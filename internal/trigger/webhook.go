package trigger

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"react-go-workflow/ent"
	entworkflow "react-go-workflow/ent/workflow"
	"react-go-workflow/internal/engine"
	"react-go-workflow/internal/shared"

	"github.com/go-chi/chi/v5"
)

type WebhookHandler struct {
	client   *ent.Client
	executor *engine.Executor
}

func NewWebhookHandler(client *ent.Client, executor *engine.Executor) *WebhookHandler {
	return &WebhookHandler{client: client, executor: executor}
}

// Handle receives a webhook POST and triggers the matching workflow.
// Supports sync mode via ?wait=true or trigger_config.webhook_sync.
func (h *WebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	wf, err := h.client.Workflow.Query().
		Where(
			entworkflow.WebhookSlug(slug),
			entworkflow.StatusEQ(entworkflow.StatusActive),
		).
		WithSteps(func(q *ent.StepQuery) {
			q.WithStepType()
		}).
		Only(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "webhook not found"})
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	// Parse request body as input
	var input map[string]any
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&input)
	}

	executionID, err := h.executor.Execute(r.Context(), wf.ID, "webhook", input)
	if err != nil {
		shared.WriteJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}

	// Determine if we should wait for completion
	waitParam := r.URL.Query().Get("wait")
	syncFromConfig := false
	if tc := wf.TriggerConfig; tc != nil {
		if v, ok := tc["webhook_sync"].(bool); ok {
			syncFromConfig = v
		}
	}
	shouldWait := waitParam == "true" || waitParam == "1" || syncFromConfig

	if !shouldWait {
		// Async mode (default)
		shared.WriteJSON(w, http.StatusAccepted, map[string]any{
			"execution_id": executionID,
			"status":       "running",
		})
		return
	}

	// Sync mode — wait for completion
	timeout := 30 * time.Second
	if t := r.URL.Query().Get("timeout"); t != "" {
		if secs, err := strconv.Atoi(t); err == nil && secs > 0 && secs <= 300 {
			timeout = time.Duration(secs) * time.Second
		}
	}

	exec, err := h.executor.WaitForCompletion(r.Context(), executionID, timeout)
	if err != nil {
		shared.WriteJSON(w, http.StatusRequestTimeout, map[string]any{
			"execution_id": executionID,
			"error":        err.Error(),
		})
		return
	}

	// Check if a webhook_response step produced custom response data
	if exec.Edges.StepExecutions != nil {
		for _, se := range exec.Edges.StepExecutions {
			if se.Edges.Step != nil &&
				se.Edges.Step.Edges.StepType != nil &&
				se.Edges.Step.Edges.StepType.Name == "webhook_response" &&
				se.Output != nil {
				// Use the webhook_response step's output for the HTTP response
				statusCode := 200
				if sc, ok := se.Output["status_code"].(float64); ok {
					statusCode = int(sc)
				}
				body := se.Output["body"]
				if body != nil {
					// If body is a string, try to parse it as JSON
					if bodyStr, ok := body.(string); ok {
						var parsed any
						if json.Unmarshal([]byte(bodyStr), &parsed) == nil {
							body = parsed
						}
					}
					shared.WriteJSON(w, statusCode, body)
				} else {
					shared.WriteJSON(w, statusCode, map[string]any{
						"execution_id": executionID,
						"status":       string(exec.Status),
					})
				}
				return
			}
		}
	}

	// No webhook_response step — return standard response
	status := http.StatusOK
	if exec.Status == "failed" {
		status = http.StatusInternalServerError
	}

	response := map[string]any{
		"execution_id": executionID,
		"status":       string(exec.Status),
	}
	if exec.Output != nil {
		response["output"] = exec.Output
	}
	if exec.Error != "" {
		response["error"] = exec.Error
	}
	shared.WriteJSON(w, status, response)
}
