package notification

import (
	"net/http"

	"react-go-workflow/ent"
	entnotif "react-go-workflow/ent/notification"
	"react-go-workflow/internal/shared"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	client *ent.Client
}

func NewHandler(client *ent.Client) *Handler {
	return &Handler{client: client}
}

// List returns paginated in-app notifications, newest first.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page := shared.ParseOffsetPageRequest(r)

	query := h.client.Notification.Query().
		WithWorkflow().
		WithWorkflowExecution().
		Order(ent.Desc(entnotif.FieldDateCreated))

	// Optional filter: ?status=unread
	if s := shared.QueryString(r, "status"); s != nil {
		switch *s {
		case "unread":
			query = query.Where(entnotif.StatusEQ(entnotif.StatusUnread))
		case "read":
			query = query.Where(entnotif.StatusEQ(entnotif.StatusRead))
		}
	}

	total, err := query.Clone().Count(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	notifications, err := query.
		Offset(page.Offset).
		Limit(page.Limit).
		All(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"data":   notifications,
		"total":  total,
		"limit":  page.Limit,
		"offset": page.Offset,
	})
}

// UnreadCount returns the count of unread notifications.
func (h *Handler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	count, err := h.client.Notification.Query().
		Where(entnotif.StatusEQ(entnotif.StatusUnread)).
		Count(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, map[string]any{"count": count})
}

// MarkRead marks a single notification as read.
func (h *Handler) MarkRead(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	n, err := h.client.Notification.UpdateOneID(id).
		SetStatus(entnotif.StatusRead).
		Save(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	shared.WriteJSON(w, http.StatusOK, n)
}

// MarkAllRead marks all unread notifications as read.
func (h *Handler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	_, err := h.client.Notification.Update().
		Where(entnotif.StatusEQ(entnotif.StatusUnread)).
		SetStatus(entnotif.StatusRead).
		Save(r.Context())
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
