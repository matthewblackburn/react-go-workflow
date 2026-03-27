package execution

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"react-go-workflow/ent"
	"react-go-workflow/ent/predicate"
	"react-go-workflow/ent/workflowexecution"
	"react-go-workflow/internal/engine"
	"react-go-workflow/internal/shared"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	client   *ent.Client
	executor *engine.Executor
}

func NewHandler(client *ent.Client, executor *engine.Executor) *Handler {
	return &Handler{client: client, executor: executor}
}

// Cancel stops a running execution.
func (h *Handler) Cancel(w http.ResponseWriter, r *http.Request) {
	execID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	// Verify it exists and is running
	exec, err := h.client.WorkflowExecution.Get(r.Context(), execID)
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrExecutionNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	if exec.Status != workflowexecution.StatusRunning && exec.Status != workflowexecution.StatusPending {
		shared.WriteJSON(w, http.StatusOK, map[string]any{
			"message": "execution is not running",
			"status":  exec.Status,
		})
		return
	}

	h.executor.Cancel(execID)
	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"message": "cancellation requested",
		"status":  "cancelling",
	})
}

// validStatuses is the set of valid execution status values.
var validStatuses = map[string]workflowexecution.Status{
	"pending":   workflowexecution.StatusPending,
	"running":   workflowexecution.StatusRunning,
	"completed": workflowexecution.StatusCompleted,
	"failed":    workflowexecution.StatusFailed,
	"cancelled": workflowexecution.StatusCancelled,
}

// validTriggerTypes is the set of valid trigger type values.
var validTriggerTypes = map[string]workflowexecution.TriggerType{
	"manual":         workflowexecution.TriggerTypeManual,
	"cron":           workflowexecution.TriggerTypeCron,
	"webhook":        workflowexecution.TriggerTypeWebhook,
	"database_event": workflowexecution.TriggerTypeDatabaseEvent,
}

// sortableFields maps column names to ent field names for sorting.
var sortableFields = map[string]string{
	"status":       workflowexecution.FieldStatus,
	"trigger_type": workflowexecution.FieldTriggerType,
	"started_at":   workflowexecution.FieldStartedAt,
	"date_created": workflowexecution.FieldDateCreated,
}

// parseFilterValue extracts the value from a "operator:value" filter string.
// Supports formats: "is:running", "any:running,failed", or plain "running".
func parseFilterValue(raw string) string {
	if idx := strings.Index(raw, ":"); idx > 0 {
		return raw[idx+1:]
	}
	return raw
}

// datePredicates maps a field name to its GTE and LT predicate constructors.
type datePredicates struct {
	gte func(time.Time) predicate.WorkflowExecution
	lt  func(time.Time) predicate.WorkflowExecution
}

var datePredMap = map[string]datePredicates{
	workflowexecution.FieldStartedAt: {
		gte: workflowexecution.StartedAtGTE,
		lt:  workflowexecution.StartedAtLT,
	},
	workflowexecution.FieldCompletedAt: {
		gte: workflowexecution.CompletedAtGTE,
		lt:  workflowexecution.CompletedAtLT,
	},
}

func parseDate(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid date: %s", s)
	}
	return t, nil
}

// parseDateFilter parses "after:2026-03-01", "before:2026-03-31",
// or "between:2026-03-01,2026-03-31" into an ent predicate.
func parseDateFilter(raw string, field string) (predicate.WorkflowExecution, error) {
	preds, ok := datePredMap[field]
	if !ok {
		return nil, fmt.Errorf("unsupported date field: %s", field)
	}

	op := ""
	val := raw
	if idx := strings.Index(raw, ":"); idx > 0 {
		op = raw[:idx]
		val = raw[idx+1:]
	}

	switch op {
	case "after", "":
		t, err := parseDate(val)
		if err != nil {
			return nil, err
		}
		return preds.gte(t), nil
	case "before":
		t, err := parseDate(val)
		if err != nil {
			return nil, err
		}
		return preds.lt(t.Add(24 * time.Hour)), nil
	case "between":
		parts := strings.SplitN(val, ",", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return nil, fmt.Errorf("between requires two dates separated by comma")
		}
		from, err := parseDate(parts[0])
		if err != nil {
			return nil, err
		}
		to, err := parseDate(parts[1])
		if err != nil {
			return nil, err
		}
		return workflowexecution.And(
			preds.gte(from),
			preds.lt(to.Add(24*time.Hour)),
		), nil
	default:
		return nil, fmt.Errorf("unknown date operator: %s", op)
	}
}

// List returns all executions with offset/limit pagination, sorting, and filters.
//
//	GET /v1/executions?offset=0&limit=20&status=is:running&trigger_type=any:manual,cron&sort=date_created:desc
//
//	Filters use "operator:value" format from FilterBar (e.g. "is:running", "any:running,failed").
//	Response: { data: [], total: N, limit: N, offset: N }
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page := shared.ParseOffsetPageRequest(r)

	query := h.client.WorkflowExecution.Query().
		WithWorkflow()

	// Sorting: ?sort=column:direction (e.g. "date_created:desc")
	if s := shared.QueryString(r, "sort"); s != nil {
		parts := strings.SplitN(*s, ":", 2)
		col := parts[0]
		dir := "asc"
		if len(parts) == 2 && parts[1] == "desc" {
			dir = "desc"
		}
		if field, ok := sortableFields[col]; ok {
			if dir == "desc" {
				query = query.Order(ent.Desc(field))
			} else {
				query = query.Order(ent.Asc(field))
			}
		} else {
			query = query.Order(ent.Desc(workflowexecution.FieldDateCreated))
		}
	} else {
		query = query.Order(ent.Desc(workflowexecution.FieldDateCreated))
	}

	// Filter by status (supports "is:running", "any:running,failed", or plain "running,failed").
	if s := shared.QueryString(r, "status"); s != nil {
		val := parseFilterValue(*s)
		parts := strings.Split(val, ",")
		statuses := make([]workflowexecution.Status, 0, len(parts))
		for _, p := range parts {
			v, ok := validStatuses[strings.TrimSpace(p)]
			if !ok {
				shared.WriteError(w, shared.ErrInvalidFilter.WithDetails(map[string]string{
					"status": "invalid value: " + p,
				}))
				return
			}
			statuses = append(statuses, v)
		}
		query = query.Where(workflowexecution.StatusIn(statuses...))
	}

	// Filter by workflow_id.
	if s := shared.QueryString(r, "workflow_id"); s != nil {
		val := parseFilterValue(*s)
		wid, err := uuid.Parse(val)
		if err != nil {
			shared.WriteError(w, shared.ErrInvalidFilter.WithDetails(map[string]string{
				"workflow_id": "must be a valid UUID",
			}))
			return
		}
		query = query.Where(workflowexecution.WorkflowID(wid))
	}

	// Filter by trigger_type.
	if s := shared.QueryString(r, "trigger_type"); s != nil {
		val := parseFilterValue(*s)
		parts := strings.Split(val, ",")
		types := make([]workflowexecution.TriggerType, 0, len(parts))
		for _, p := range parts {
			v, ok := validTriggerTypes[strings.TrimSpace(p)]
			if !ok {
				shared.WriteError(w, shared.ErrInvalidFilter.WithDetails(map[string]string{
					"trigger_type": "invalid value: " + p,
				}))
				return
			}
			types = append(types, v)
		}
		query = query.Where(workflowexecution.TriggerTypeIn(types...))
	}

	// Filter by started_at date range.
	// Formats: "after:2026-03-01", "before:2026-03-31", "between:2026-03-01,2026-03-31"
	if s := shared.QueryString(r, "started_at"); s != nil {
		if pred, err := parseDateFilter(*s, workflowexecution.FieldStartedAt); err != nil {
			shared.WriteError(w, shared.ErrInvalidFilter.WithDetails(map[string]string{"started_at": err.Error()}))
			return
		} else if pred != nil {
			query = query.Where(pred)
		}
	}

	// Filter by completed_at date range.
	if s := shared.QueryString(r, "completed_at"); s != nil {
		if pred, err := parseDateFilter(*s, workflowexecution.FieldCompletedAt); err != nil {
			shared.WriteError(w, shared.ErrInvalidFilter.WithDetails(map[string]string{"completed_at": err.Error()}))
			return
		} else if pred != nil {
			query = query.Where(pred)
		}
	}

	// Count total (before offset/limit).
	total, err := query.Clone().Count(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	// Fetch page.
	execs, err := query.
		Offset(page.Offset).
		Limit(page.Limit).
		All(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"data":   execs,
		"total":  total,
		"limit":  page.Limit,
		"offset": page.Offset,
	})
}

// ListByWorkflow returns executions for a workflow.
func (h *Handler) ListByWorkflow(w http.ResponseWriter, r *http.Request) {
	workflowID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	execs, err := h.client.WorkflowExecution.Query().
		Where(workflowexecution.WorkflowID(workflowID)).
		Order(ent.Desc(workflowexecution.FieldDateCreated)).
		Limit(50).
		All(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, map[string]any{"data": execs})
}

// Get returns a single execution with step details and the full workflow canvas.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	execID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	exec, err := h.client.WorkflowExecution.Query().
		Where(workflowexecution.ID(execID)).
		WithStepExecutions(func(q *ent.StepExecutionQuery) {
			q.WithStep()
		}).
		WithWorkflow(func(q *ent.WorkflowQuery) {
			q.WithSteps(func(sq *ent.StepQuery) {
				sq.WithStepType()
			})
			q.WithEdges()
			q.WithCanvasNotes()
		}).
		Only(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrExecutionNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, exec)
}
