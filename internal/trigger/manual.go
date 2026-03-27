package trigger

import (
	"net/http"

	"react-go-workflow/internal/engine"
	"react-go-workflow/internal/shared"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type ManualHandler struct {
	executor *engine.Executor
}

func NewManualHandler(executor *engine.Executor) *ManualHandler {
	return &ManualHandler{executor: executor}
}

type executeRequest struct {
	Input map[string]any `json:"input"`
}

// Execute triggers a manual workflow execution.
func (h *ManualHandler) Execute(w http.ResponseWriter, r *http.Request) {
	workflowID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	var req executeRequest
	// Body is optional for manual triggers
	_ = shared.DecodeAndValidate(r, &req)

	executionID, err := h.executor.Execute(r.Context(), workflowID, "manual", req.Input)
	if err != nil {
		shared.WriteError(w, &shared.APIError{
			Code:    "EXECUTION_FAILED",
			Message: err.Error(),
		})
		return
	}

	shared.WriteJSON(w, http.StatusAccepted, map[string]any{
		"execution_id": executionID,
		"status":       "running",
	})
}
