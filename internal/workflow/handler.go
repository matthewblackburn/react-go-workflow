package workflow

import (
	"log"
	"log/slog"
	"net/http"
	"strings"

	"react-go-workflow/ent"
	entedge "react-go-workflow/ent/edge"
	entnotifset "react-go-workflow/ent/notificationsetting"
	"react-go-workflow/ent/step"
	entworkflow "react-go-workflow/ent/workflow"
	"react-go-workflow/internal/shared"
	"react-go-workflow/internal/trigger"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	service *Service
	client  *ent.Client
	cron    *trigger.CronScheduler
}

func NewHandler(service *Service, client *ent.Client, cron *trigger.CronScheduler) *Handler {
	return &Handler{service: service, client: client, cron: cron}
}

type createRequest struct {
	Name        string         `json:"name" validate:"required,max=255"`
	Description string         `json:"description,omitempty" validate:"max=2000"`
	TriggerConfig map[string]any `json:"trigger_config,omitempty"`
	InputSchema  map[string]any `json:"input_schema,omitempty"`
	OutputSchema map[string]any `json:"output_schema,omitempty"`
}

type updateRequest struct {
	Name                 string                      `json:"name,omitempty" validate:"omitempty,max=255"`
	Description          string                      `json:"description,omitempty" validate:"max=2000"`
	Status               string                      `json:"status,omitempty" validate:"omitempty,oneof=draft active archived"`
	TriggerConfig        map[string]any              `json:"trigger_config,omitempty"`
	Concurrency          string                      `json:"concurrency,omitempty" validate:"omitempty,oneof=allow skip queue"`
	TimeoutSeconds       *int                        `json:"timeout_seconds,omitempty" validate:"omitempty,min=1,max=86400"`
	WebhookSlug          string                      `json:"webhook_slug,omitempty" validate:"omitempty,max=255"`
	InputSchema          map[string]any              `json:"input_schema,omitempty"`
	OutputSchema         map[string]any              `json:"output_schema,omitempty"`
	NotificationSettings []notificationSettingUpdate `json:"notification_settings,omitempty"`
}

type notificationSettingUpdate struct {
	Enabled  bool           `json:"enabled"`
	Channel  string         `json:"channel" validate:"required,oneof=in_app email webhook"`
	Config   map[string]any `json:"config,omitempty"`
	NotifyOn string         `json:"notify_on" validate:"required,oneof=failure success all"`
}

type canvasRequest struct {
	Steps []canvasStep `json:"steps"`
	Edges []canvasEdge `json:"edges"`
	Notes []canvasNote `json:"notes"`
}

type canvasStep struct {
	ID            string         `json:"id" validate:"required,uuid"`
	StepTypeID    string         `json:"step_type_id" validate:"required,uuid"`
	Name          string         `json:"name" validate:"required,max=255"`
	Description   string         `json:"description,omitempty"`
	Config        map[string]any `json:"config,omitempty"`
	PositionX     float64        `json:"position_x"`
	PositionY     float64        `json:"position_y"`
	InputMapping  map[string]any `json:"input_mapping,omitempty"`
	TimeoutSeconds int           `json:"timeout_seconds"`
	RetryCount    int            `json:"retry_count"`
	RetryBackoff  string         `json:"retry_backoff,omitempty"`
	RetryDelayMs  int            `json:"retry_delay_ms"`
}

type canvasEdge struct {
	ID           string         `json:"id" validate:"required,uuid"`
	SourceStepID string         `json:"source_step_id" validate:"required,uuid"`
	TargetStepID string         `json:"target_step_id" validate:"required,uuid"`
	SourceOutput string         `json:"source_output,omitempty"`
	TargetInput  string         `json:"target_input,omitempty"`
	EdgeType     string         `json:"edge_type,omitempty"`
	Condition    map[string]any `json:"condition,omitempty"`
}

type canvasNote struct {
	ID        string  `json:"id" validate:"required,uuid"`
	Content   string  `json:"content,omitempty"`
	Color     string  `json:"color,omitempty"`
	PositionX float64 `json:"position_x"`
	PositionY float64 `json:"position_y"`
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
}

// Sortable workflow fields.
var workflowSortFields = map[string]string{
	"name":         entworkflow.FieldName,
	"status":       entworkflow.FieldStatus,
	"date_created": entworkflow.FieldDateCreated,
}

// Valid workflow status values.
var validWorkflowStatuses = map[string]entworkflow.Status{
	"draft":    entworkflow.StatusDraft,
	"active":   entworkflow.StatusActive,
	"archived": entworkflow.StatusArchived,
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page := shared.ParseOffsetPageRequest(r)

	query := h.client.Workflow.Query()

	// Sorting
	if s := shared.QueryString(r, "sort"); s != nil {
		parts := strings.SplitN(*s, ":", 2)
		col := parts[0]
		dir := "asc"
		if len(parts) == 2 && parts[1] == "desc" {
			dir = "desc"
		}
		if field, ok := workflowSortFields[col]; ok {
			if dir == "desc" {
				query = query.Order(ent.Desc(field))
			} else {
				query = query.Order(ent.Asc(field))
			}
		} else {
			query = query.Order(ent.Desc(entworkflow.FieldDateCreated))
		}
	} else {
		query = query.Order(ent.Desc(entworkflow.FieldDateCreated))
	}

	// Filter by status
	if s := shared.QueryString(r, "status"); s != nil {
		val := *s
		if idx := strings.Index(val, ":"); idx > 0 {
			val = val[idx+1:]
		}
		parts := strings.Split(val, ",")
		statuses := make([]entworkflow.Status, 0, len(parts))
		for _, p := range parts {
			v, ok := validWorkflowStatuses[strings.TrimSpace(p)]
			if !ok {
				shared.WriteError(w, shared.ErrInvalidFilter.WithDetails(map[string]string{
					"status": "invalid value: " + p,
				}))
				return
			}
			statuses = append(statuses, v)
		}
		query = query.Where(entworkflow.StatusIn(statuses...))
	}

	// Filter by name (text search)
	if s := shared.QueryString(r, "name"); s != nil {
		val := *s
		if idx := strings.Index(val, ":"); idx > 0 {
			val = val[idx+1:]
		}
		if val != "" {
			query = query.Where(entworkflow.NameContainsFold(val))
		}
	}

	// Count total
	total, err := query.Clone().Count(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	// Fetch page
	workflows, err := query.
		Offset(page.Offset).
		Limit(page.Limit).
		All(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"data":   workflows,
		"total":  total,
		"limit":  page.Limit,
		"offset": page.Offset,
	})
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	wf, err := h.service.GetFull(r.Context(), id)
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrWorkflowNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	shared.WriteJSON(w, http.StatusOK, wf)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := shared.DecodeAndValidate(r, &req); err != nil {
		shared.WriteValidationError(w, err)
		return
	}

	wf := &ent.Workflow{
		Name:          req.Name,
		Description:   req.Description,
		Status:        entworkflow.StatusDraft,
		TriggerConfig: req.TriggerConfig,
		InputSchema:   req.InputSchema,
		OutputSchema:  req.OutputSchema,
		Concurrency:   entworkflow.ConcurrencyAllow,
	}

	created, err := h.service.Create(r.Context(), wf)
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	shared.WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	var req updateRequest
	if err := shared.DecodeAndValidate(r, &req); err != nil {
		shared.WriteValidationError(w, err)
		return
	}

	wf := &ent.Workflow{
		Name:          req.Name,
		Description:   req.Description,
		TriggerConfig: req.TriggerConfig,
	}
	if req.Status != "" {
		wf.Status = entworkflow.Status(req.Status)
	}
	if req.Concurrency != "" {
		wf.Concurrency = entworkflow.Concurrency(req.Concurrency)
	}
	if req.TimeoutSeconds != nil {
		wf.TimeoutSeconds = req.TimeoutSeconds
	}
	if req.WebhookSlug != "" {
		wf.WebhookSlug = &req.WebhookSlug
	}
	if req.InputSchema != nil {
		wf.InputSchema = req.InputSchema
	}
	if req.OutputSchema != nil {
		wf.OutputSchema = req.OutputSchema
	}

	updated, err := h.service.Update(r.Context(), id, wf)
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrWorkflowNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	// Sync cron scheduler with updated trigger config
	s := string(updated.Status)
	h.cron.Sync(id, updated.Name, s, updated.TriggerConfig)

	// Replace notification settings if provided
	if req.NotificationSettings != nil {
		// Delete existing
		_, _ = h.client.NotificationSetting.Delete().
			Where(entnotifset.WorkflowID(id)).
			Exec(r.Context())

		// Create new
		for _, ns := range req.NotificationSettings {
			_, err := h.client.NotificationSetting.Create().
				SetWorkflowID(id).
				SetEnabled(ns.Enabled).
				SetChannel(entnotifset.Channel(ns.Channel)).
				SetConfig(ns.Config).
				SetNotifyOn(entnotifset.NotifyOn(ns.NotifyOn)).
				Save(r.Context())
			if err != nil {
				slog.Error("failed to create notification setting", "error", err)
			}
		}

		// Re-fetch with notification settings
		updated, err = h.service.GetFull(r.Context(), id)
		if err != nil {
			shared.WriteError(w, shared.ErrInternal)
			return
		}
	}

	shared.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) ActiveCrons(w http.ResponseWriter, _ *http.Request) {
	crons := h.cron.List()
	if crons == nil {
		crons = []trigger.ActiveCron{}
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"data": crons})
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	if err := h.service.Delete(r.Context(), id); err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrWorkflowNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	h.cron.Remove(id)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SaveCanvas(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	var req canvasRequest
	if err := shared.DecodeAndValidate(r, &req); err != nil {
		shared.WriteValidationError(w, err)
		return
	}

	// Convert request to ent types
	steps := make([]ent.Step, len(req.Steps))
	for i, s := range req.Steps {
		stepID, _ := uuid.Parse(s.ID)
		stepTypeID, _ := uuid.Parse(s.StepTypeID)
		backoff := step.RetryBackoffNone
		if s.RetryBackoff != "" {
			backoff = step.RetryBackoff(s.RetryBackoff)
		}
		steps[i] = ent.Step{
			ID:             stepID,
			StepTypeID:     stepTypeID,
			Name:           s.Name,
			Description:    s.Description,
			Config:         s.Config,
			PositionX:      s.PositionX,
			PositionY:      s.PositionY,
			InputMapping:   s.InputMapping,
			TimeoutSeconds: s.TimeoutSeconds,
			RetryCount:     s.RetryCount,
			RetryBackoff:   backoff,
			RetryDelayMs:   s.RetryDelayMs,
		}
	}

	edges := make([]ent.Edge, len(req.Edges))
	for i, e := range req.Edges {
		edgeID, _ := uuid.Parse(e.ID)
		srcID, _ := uuid.Parse(e.SourceStepID)
		tgtID, _ := uuid.Parse(e.TargetStepID)
		edgeType := entedge.EdgeTypeNormal
		if e.EdgeType != "" {
			edgeType = entedge.EdgeType(e.EdgeType)
		}
		edges[i] = ent.Edge{
			ID:           edgeID,
			SourceStepID: srcID,
			TargetStepID: tgtID,
			SourceOutput: e.SourceOutput,
			TargetInput:  e.TargetInput,
			EdgeType:     edgeType,
			Condition:    e.Condition,
		}
	}

	notes := make([]ent.CanvasNote, len(req.Notes))
	for i, n := range req.Notes {
		noteID, _ := uuid.Parse(n.ID)
		color := "yellow"
		if n.Color != "" {
			color = n.Color
		}
		notes[i] = ent.CanvasNote{
			ID:        noteID,
			Content:   n.Content,
			Color:     color,
			PositionX: n.PositionX,
			PositionY: n.PositionY,
			Width:     n.Width,
			Height:    n.Height,
		}
	}

	if err := h.service.SaveCanvas(r.Context(), id, steps, edges, notes); err != nil {
		log.Printf("[SaveCanvas] error: %v", err)
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	// Return the updated workflow
	wf, err := h.service.GetFull(r.Context(), id)
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	shared.WriteJSON(w, http.StatusOK, wf)
}

func (h *Handler) Clone(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	cloned, err := h.service.Clone(r.Context(), id)
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrWorkflowNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	shared.WriteJSON(w, http.StatusCreated, cloned)
}
