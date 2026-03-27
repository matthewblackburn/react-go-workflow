package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"react-go-workflow/ent"
	_ "react-go-workflow/ent/runtime"
	"react-go-workflow/internal/ai"
	"react-go-workflow/internal/engine"
	"react-go-workflow/internal/engine/runners"
	"react-go-workflow/internal/execution"
	"react-go-workflow/internal/middleware"
	"react-go-workflow/internal/notification"
	"react-go-workflow/internal/secret"
	"react-go-workflow/internal/steptype"
	"react-go-workflow/internal/database"
	"react-go-workflow/internal/trigger"
	"react-go-workflow/internal/workflow"

	"entgo.io/ent/dialect"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	if err := run(); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// Configuration from environment
	port := envOr("PORT", "8080")
	dbURL := envOr("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/workflow?sslmode=disable")
	jwtSecret := envOr("JWT_SECRET", "dev-secret-change-me")
	encKeyRaw := envOr("SECRET_ENCRYPTION_KEY", "dev-encryption-key-change-me")
	encKey := secret.DeriveKey(encKeyRaw)
	anthropicKey := envOr("ANTHROPIC_API_KEY", "")

	slog.Info("configuration loaded", "port", port)

	// Database connection
	client, err := ent.Open(dialect.Postgres, dbURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = client.Close() }()

	// Raw SQL connection for database introspection
	rawDB, err := sql.Open("postgres", dbURL)
	if err != nil {
		return fmt.Errorf("open raw database: %w", err)
	}
	defer func() { _ = rawDB.Close() }()

	// Auto-migrate
	ctx := context.Background()
	if err := client.Schema.Create(ctx); err != nil {
		return fmt.Errorf("auto-migrate: %w", err)
	}
	slog.Info("database migration complete")

	// Seed built-in step types
	if err := steptype.SeedBuiltinTypes(ctx, client); err != nil {
		return fmt.Errorf("seed step types: %w", err)
	}
	slog.Info("step types seeded")

	// Seed example workflow
	if err := workflow.SeedExampleWorkflow(ctx, client); err != nil {
		return fmt.Errorf("seed example workflow: %w", err)
	}

	// JWT config
	jwtCfg := middleware.JWTConfig{
		Secret: jwtSecret,
	}

	// Execution engine
	registry := engine.NewRunnerRegistry()
	runners.RegisterAll(registry)
	eventBus := engine.NewEventBus()
	executor := engine.NewExecutor(client, registry, eventBus, encKey)

	// Cron scheduler
	cronScheduler := trigger.NewCronScheduler(client, executor)
	if err := cronScheduler.Start(ctx); err != nil {
		slog.Warn("failed to start cron scheduler", "error", err)
	}
	defer cronScheduler.Stop()

	// Handlers
	stepTypeHandler := steptype.NewHandler(steptype.NewService(steptype.NewRepository(client)))
	workflowHandler := workflow.NewHandler(workflow.NewService(workflow.NewRepository(client)), client, cronScheduler)
	manualHandler := trigger.NewManualHandler(executor)
	webhookHandler := trigger.NewWebhookHandler(client, executor)
	executionHandler := execution.NewHandler(client, executor)
	secretHandler := secret.NewHandler(client, encKey)
	notificationHandler := notification.NewHandler(client)
	databaseHandler := database.NewHandler(rawDB)
	aiHandler := ai.NewHandler(client, anthropicKey)

	// Router
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:8080", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "Accept", "If-Match", "If-None-Match"},
		ExposedHeaders:   []string{"ETag"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check (unauthenticated)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Dev token endpoint (for development only)
	r.Post("/v1/dev/token", func(w http.ResponseWriter, r *http.Request) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":   1,
			"roles": []string{"admin"},
			"exp":   time.Now().Add(24 * time.Hour).Unix(),
		})
		signed, err := token.SignedString([]byte(jwtSecret))
		if err != nil {
			http.Error(w, "failed to sign token", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"token":"` + signed + `"}`))
	})

	// Step Types — read is public, write requires auth
	r.Route("/v1/step-types", func(r chi.Router) {
		r.Get("/", stepTypeHandler.List)
		r.Get("/{id}", stepTypeHandler.Get)
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth(jwtCfg))
			r.Post("/", stepTypeHandler.Create)
			r.Patch("/{id}", stepTypeHandler.Update)
			r.Delete("/{id}", stepTypeHandler.Delete)
		})
	})

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(jwtCfg))

		// Workflows
		r.Route("/v1/workflows", func(r chi.Router) {
			r.Get("/", workflowHandler.List)
			r.Post("/", workflowHandler.Create)
			r.Get("/{id}", workflowHandler.Get)
			r.Patch("/{id}", workflowHandler.Update)
			r.Delete("/{id}", workflowHandler.Delete)
			r.Put("/{id}/canvas", workflowHandler.SaveCanvas)
			r.Post("/{id}/clone", workflowHandler.Clone)
			r.Get("/{id}/expressions", workflowHandler.Expressions)
			r.Post("/{id}/execute", manualHandler.Execute)
			r.Get("/{id}/executions", executionHandler.ListByWorkflow)
		})

		// Active crons
		r.Get("/v1/crons", workflowHandler.ActiveCrons)

		// Executions
		r.Get("/v1/executions", executionHandler.List)
		r.Get("/v1/executions/{id}", executionHandler.Get)
		r.Post("/v1/executions/{id}/cancel", executionHandler.Cancel)

		// Secrets
		r.Route("/v1/secrets", func(r chi.Router) {
			r.Get("/", secretHandler.List)
			r.Post("/", secretHandler.Create)
			r.Get("/{id}", secretHandler.Get)
			r.Patch("/{id}", secretHandler.Update)
			r.Delete("/{id}", secretHandler.Delete)
		})

		// Notifications
		r.Route("/v1/notifications", func(r chi.Router) {
			r.Get("/", notificationHandler.List)
			r.Get("/unread-count", notificationHandler.UnreadCount)
			r.Patch("/{id}/read", notificationHandler.MarkRead)
			r.Post("/mark-all-read", notificationHandler.MarkAllRead)
		})

		// Database
		r.Get("/v1/database/tables", databaseHandler.ListTables)

		// Dashboard
		r.Get("/bff/dashboard", workflowHandler.Dashboard)

		// AI — extended timeout for LLM calls
		r.Group(func(r chi.Router) {
			r.Use(chimw.Timeout(60 * time.Second))
			r.Post("/v1/ai/generate-workflow", aiHandler.GenerateWorkflow)
			r.Post("/v1/ai/diagnose-execution", aiHandler.DiagnoseExecution)
		})
	})

	// Webhook endpoint (public, no auth)
	r.Post("/webhooks/{slug}", webhookHandler.Handle)

	// WebSocket endpoint for live execution updates
	wsHandler := engine.NewWSHandler(eventBus, client)
	r.Get("/ws/executions/{id}", wsHandler.Handle)

	// Start server
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("server starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
		}
	}()

	<-done
	slog.Info("server shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return srv.Shutdown(shutdownCtx)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func init() {
	_ = os.MkdirAll("tmp", 0o755)
}
