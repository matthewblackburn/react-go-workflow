package secret

import (
	"net/http"
	"time"

	"react-go-workflow/ent"
	entsecret "react-go-workflow/ent/secret"
	"react-go-workflow/internal/shared"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// SecretResponse is the DTO returned to clients. Never includes encrypted_value.
type SecretResponse struct {
	ID          uuid.UUID  `json:"id"`
	Key         string     `json:"key"`
	Description string     `json:"description,omitempty"`
	DateCreated time.Time  `json:"date_created"`
	DateUpdated *time.Time `json:"date_updated,omitempty"`
}

func toResponse(s *ent.Secret) SecretResponse {
	return SecretResponse{
		ID:          s.ID,
		Key:         s.Key,
		Description: s.Description,
		DateCreated: s.DateCreated,
		DateUpdated: s.DateUpdated,
	}
}

type Handler struct {
	client *ent.Client
	encKey []byte
}

func NewHandler(client *ent.Client, encKey []byte) *Handler {
	return &Handler{client: client, encKey: encKey}
}

type createRequest struct {
	Key         string `json:"key" validate:"required,max=255"`
	Value       string `json:"value" validate:"required"`
	Description string `json:"description" validate:"max=1000"`
}

type updateRequest struct {
	Value       *string `json:"value"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
}

// List returns paginated secrets (without values).
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page := shared.ParseOffsetPageRequest(r)

	query := h.client.Secret.Query().
		Order(ent.Desc(entsecret.FieldDateCreated))

	// Optional search by key
	if s := shared.QueryString(r, "search"); s != nil {
		query = query.Where(entsecret.KeyContainsFold(*s))
	}

	total, err := query.Clone().Count(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	secrets, err := query.
		Offset(page.Offset).
		Limit(page.Limit).
		All(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	items := make([]SecretResponse, len(secrets))
	for i, s := range secrets {
		items[i] = toResponse(s)
	}

	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"data":   items,
		"total":  total,
		"limit":  page.Limit,
		"offset": page.Offset,
	})
}

// Get returns a single secret (without value).
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	s, err := h.client.Secret.Get(r.Context(), id)
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrSecretNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, toResponse(s))
}

// Create adds a new secret with an encrypted value.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := shared.DecodeAndValidate(r, &req); err != nil {
		shared.WriteValidationError(w, err)
		return
	}

	encrypted, err := Encrypt([]byte(req.Value), h.encKey)
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	s, err := h.client.Secret.Create().
		SetKey(req.Key).
		SetEncryptedValue(encrypted).
		SetDescription(req.Description).
		Save(r.Context())
	if err != nil {
		if ent.IsConstraintError(err) {
			shared.WriteError(w, shared.ErrDuplicateKey)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusCreated, toResponse(s))
}

// Update modifies a secret's value and/or description.
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

	builder := h.client.Secret.UpdateOneID(id)

	if req.Value != nil && *req.Value != "" {
		encrypted, err := Encrypt([]byte(*req.Value), h.encKey)
		if err != nil {
			shared.WriteError(w, shared.ErrInternal)
			return
		}
		builder = builder.SetEncryptedValue(encrypted)
	}

	if req.Description != nil {
		builder = builder.SetDescription(*req.Description)
	}

	s, err := builder.Save(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrSecretNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, toResponse(s))
}

// Delete removes a secret.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	err = h.client.Secret.DeleteOneID(id).Exec(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrSecretNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
