package workflow

import (
	"net/http"

	"react-go-workflow/ent"
	entworkflow "react-go-workflow/ent/workflow"
	entwfexec "react-go-workflow/ent/workflowexecution"
	"react-go-workflow/internal/shared"
)

type DashboardStats struct {
	TotalWorkflows   int                      `json:"total_workflows"`
	ActiveCount      int                      `json:"active_count"`
	DraftCount       int                      `json:"draft_count"`
	TotalExecs       int                      `json:"total_executions"`
	SuccessCount     int                      `json:"success_count"`
	FailureCount     int                      `json:"failure_count"`
	RunningCount     int                      `json:"running_count"`
	CancelledCount   int                      `json:"cancelled_count"`
	RecentExecs      []*ent.WorkflowExecution `json:"recent_executions"`
}

// Dashboard returns stats for the dashboard page.
func (h *Handler) Dashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	client := h.client

	total, _ := client.Workflow.Query().Count(ctx)
	active, _ := client.Workflow.Query().Where(entworkflow.StatusEQ(entworkflow.StatusActive)).Count(ctx)
	draft, _ := client.Workflow.Query().Where(entworkflow.StatusEQ(entworkflow.StatusDraft)).Count(ctx)

	totalExecs, _ := client.WorkflowExecution.Query().Count(ctx)
	successExecs, _ := client.WorkflowExecution.Query().Where(entwfexec.StatusEQ(entwfexec.StatusCompleted)).Count(ctx)
	failedExecs, _ := client.WorkflowExecution.Query().Where(entwfexec.StatusEQ(entwfexec.StatusFailed)).Count(ctx)
	runningExecs, _ := client.WorkflowExecution.Query().Where(entwfexec.StatusEQ(entwfexec.StatusRunning)).Count(ctx)
	cancelledExecs, _ := client.WorkflowExecution.Query().Where(entwfexec.StatusEQ(entwfexec.StatusCancelled)).Count(ctx)

	recentExecs, _ := client.WorkflowExecution.Query().
		Order(ent.Desc(entwfexec.FieldDateCreated)).
		WithWorkflow().
		Limit(10).
		All(ctx)

	shared.WriteJSON(w, http.StatusOK, DashboardStats{
		TotalWorkflows:   total,
		ActiveCount:      active,
		DraftCount:       draft,
		TotalExecs:       totalExecs,
		SuccessCount:     successExecs,
		FailureCount:     failedExecs,
		RunningCount:     runningExecs,
		CancelledCount:   cancelledExecs,
		RecentExecs:      recentExecs,
	})
}
