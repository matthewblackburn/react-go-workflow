package trigger

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"react-go-workflow/ent"
	"react-go-workflow/internal/engine"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
)

// ActiveCron represents a running cron job returned by the API.
type ActiveCron struct {
	WorkflowID   uuid.UUID `json:"workflow_id"`
	WorkflowName string    `json:"workflow_name"`
	Expression   string    `json:"expression"`
	NextRun      string    `json:"next_run"`
	PrevRun      string    `json:"prev_run,omitempty"`
}

type cronEntry struct {
	entryID cron.EntryID
	name    string
	expr    string
}

type CronScheduler struct {
	client   *ent.Client
	executor *engine.Executor
	cron     *cron.Cron
	mu       sync.Mutex
	entries  map[uuid.UUID]cronEntry // workflow ID → cron entry
}

func NewCronScheduler(client *ent.Client, executor *engine.Executor) *CronScheduler {
	return &CronScheduler{
		client:   client,
		executor: executor,
		cron:     cron.New(),
		entries:  make(map[uuid.UUID]cronEntry),
	}
}

// Start loads all active cron workflows and registers them.
func (s *CronScheduler) Start(ctx context.Context) error {
	allActive, err := s.client.Workflow.Query().
		All(ctx)
	if err != nil {
		return err
	}

	for _, wf := range allActive {
		s.register(wf.ID, wf.Name, wf.TriggerConfig)
	}

	s.cron.Start()
	return nil
}

// Stop stops the cron scheduler.
func (s *CronScheduler) Stop() {
	s.cron.Stop()
}

// Sync adds, updates, or removes a cron job for a workflow based on its current trigger config.
// Call this after any workflow update that may change cron settings or status.
func (s *CronScheduler) Sync(workflowID uuid.UUID, name string, status string, triggerConfig map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove existing entry if any
	if entry, ok := s.entries[workflowID]; ok {
		s.cron.Remove(entry.entryID)
		delete(s.entries, workflowID)
		slog.Info("removed cron job", "workflow", name)
	}

	// Only register if workflow is not archived and cron is enabled
	if status == "archived" {
		return
	}

	s.register(workflowID, name, triggerConfig)
}

// Remove removes the cron job for a workflow (e.g. on delete).
func (s *CronScheduler) Remove(workflowID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if entry, ok := s.entries[workflowID]; ok {
		s.cron.Remove(entry.entryID)
		delete(s.entries, workflowID)
	}
}

// List returns all currently active cron jobs.
func (s *CronScheduler) List() []ActiveCron {
	s.mu.Lock()
	defer s.mu.Unlock()

	var result []ActiveCron
	for wfID, entry := range s.entries {
		cronEntry := s.cron.Entry(entry.entryID)
		ac := ActiveCron{
			WorkflowID:   wfID,
			WorkflowName: entry.name,
			Expression:   entry.expr,
			NextRun:      cronEntry.Next.Format(time.RFC3339),
		}
		if !cronEntry.Prev.IsZero() {
			ac.PrevRun = cronEntry.Prev.Format(time.RFC3339)
		}
		result = append(result, ac)
	}
	return result
}

func (s *CronScheduler) register(workflowID uuid.UUID, name string, triggerConfig map[string]any) {
	if triggerConfig == nil {
		return
	}
	enabled, ok := triggerConfig["cron_enabled"].(bool)
	if !ok || !enabled {
		return
	}

	expr, ok := triggerConfig["cron_expression"].(string)
	if !ok || expr == "" {
		slog.Warn("cron workflow has no expression", "workflow", name)
		return
	}

	wfID := workflowID
	wfName := name
	entryID, err := s.cron.AddFunc(expr, func() {
		slog.Info("cron triggered", "workflow", wfName)
		_, err := s.executor.Execute(context.Background(), wfID, "cron", nil)
		if err != nil {
			slog.Error("cron execution failed", "workflow", wfName, "error", err)
		}
	})
	if err != nil {
		slog.Error("failed to register cron", "workflow", name, "expression", expr, "error", err)
		return
	}

	s.entries[workflowID] = cronEntry{entryID: entryID, name: wfName, expr: expr}
	slog.Info("registered cron workflow", "workflow", name, "expression", expr)
}
