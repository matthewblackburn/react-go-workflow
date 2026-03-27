package steptype

import (
	"net/http"

	"react-go-workflow/ent"
	entsteptype "react-go-workflow/ent/steptype"
	"react-go-workflow/internal/shared"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type createRequest struct {
	Name         string         `json:"name" validate:"required,max=100"`
	DisplayName  string         `json:"display_name" validate:"required,max=200"`
	Category     string         `json:"category" validate:"required,oneof=trigger action logic utility"`
	Description  string         `json:"description,omitempty" validate:"max=1000"`
	Icon         string         `json:"icon,omitempty" validate:"max=100"`
	ConfigSchema map[string]any `json:"config_schema,omitempty"`
	InputSchema  map[string]any `json:"input_schema,omitempty"`
	OutputSchema map[string]any `json:"output_schema,omitempty"`
}

type updateRequest struct {
	DisplayName  string         `json:"display_name,omitempty"`
	Description  string         `json:"description,omitempty"`
	Icon         string         `json:"icon,omitempty"`
	ConfigSchema map[string]any `json:"config_schema,omitempty"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	types, err := h.service.List(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"data": types})
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	st, err := h.service.GetByID(r.Context(), id)
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrStepTypeNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	shared.WriteJSON(w, http.StatusOK, st)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := shared.DecodeAndValidate(r, &req); err != nil {
		shared.WriteValidationError(w, err)
		return
	}

	st := &ent.StepType{
		Name:         req.Name,
		DisplayName:  req.DisplayName,
		Category:     entsteptype.Category(req.Category),
		Description:  req.Description,
		Icon:         req.Icon,
		ConfigSchema: req.ConfigSchema,
		InputSchema:  req.InputSchema,
		OutputSchema: req.OutputSchema,
	}

	created, err := h.service.Create(r.Context(), st)
	if err != nil {
		if ent.IsConstraintError(err) {
			shared.WriteError(w, shared.ErrDuplicateName)
			return
		}
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

	st := &ent.StepType{
		DisplayName:  req.DisplayName,
		Description:  req.Description,
		Icon:         req.Icon,
		ConfigSchema: req.ConfigSchema,
	}

	updated, err := h.service.Update(r.Context(), id, st)
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrStepTypeNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	shared.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	if err := h.service.Delete(r.Context(), id); err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrStepTypeNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
