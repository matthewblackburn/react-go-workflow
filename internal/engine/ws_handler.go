package engine

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"react-go-workflow/ent"
	entwfexec "react-go-workflow/ent/workflowexecution"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/supertokens/supertokens-golang/recipe/session"
	"nhooyr.io/websocket"
)

type WSHandler struct {
	eventBus *EventBus
	client   *ent.Client
}

func NewWSHandler(eventBus *EventBus, client *ent.Client) *WSHandler {
	return &WSHandler{eventBus: eventBus, client: client}
}

// Handle upgrades the HTTP connection to a WebSocket and streams execution events.
func (h *WSHandler) Handle(w http.ResponseWriter, r *http.Request) {
	// Verify session without wrapping the ResponseWriter (which would break
	// http.Hijacker needed by nhooyr/websocket).
	cookie, err := r.Cookie("sAccessToken")
	if err != nil || cookie.Value == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if _, err := session.GetSessionWithoutRequestResponse(cookie.Value, nil, nil); err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	executionID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid execution id", http.StatusBadRequest)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		slog.Error("websocket accept failed", "error", err)
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	ctx := r.Context()

	// Subscribe to execution events
	ch := h.eventBus.Subscribe(executionID)
	defer h.eventBus.Unsubscribe(executionID, ch)

	slog.Info("websocket client connected", "execution_id", executionID)

	// Replay current state: if execution already finished before we connected,
	// send the terminal status immediately so the frontend doesn't hang.
	if exec, err := h.client.WorkflowExecution.Query().
		Where(entwfexec.ID(executionID)).
		WithStepExecutions(func(q *ent.StepExecutionQuery) {
			q.WithStep()
		}).
		Only(ctx); err == nil {

		// Send step statuses for any steps that already ran
		for _, se := range exec.Edges.StepExecutions {
			stepID := se.StepID
			stepName := ""
			if se.Edges.Step != nil {
				stepName = se.Edges.Step.Name
			}
			evt := Event{
				Type:      EventStepStatus,
				StepID:    &stepID,
				StepName:  stepName,
				Status:    string(se.Status),
				Timestamp: se.DateCreated,
			}
			if se.Error != "" {
				evt.Error = se.Error
			}
			if se.Output != nil {
				evt.Output = se.Output
			}
			if se.StartedAt != nil {
				evt.StartedAt = se.StartedAt
			}
			if se.CompletedAt != nil {
				evt.CompletedAt = se.CompletedAt
			}
			if data, err := json.Marshal(evt); err == nil {
				conn.Write(ctx, websocket.MessageText, data)
			}
		}

		// Send execution status if terminal
		status := string(exec.Status)
		if status == "completed" || status == "failed" || status == "cancelled" {
			now := time.Now()
			evt := Event{
				Type:        EventExecutionStatus,
				Status:      status,
				Error:       exec.Error,
				Timestamp:   now,
				CompletedAt: exec.CompletedAt,
			}
			if exec.Output != nil {
				evt.Output = exec.Output
			}
			if data, err := json.Marshal(evt); err == nil {
				conn.Write(ctx, websocket.MessageText, data)
			}
			return // Already done, no need to stream
		}
	}

	// Read client commands in background (cancel, pause, etc.)
	go func() {
		for {
			_, msg, err := conn.Read(ctx)
			if err != nil {
				return
			}
			var cmd struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(msg, &cmd) == nil {
				slog.Info("websocket command received", "type", cmd.Type, "execution_id", executionID)
				// TODO: Handle cancel/pause/resume commands
			}
		}
	}()

	// Stream events to client
	for {
		select {
		case event, ok := <-ch:
			if !ok {
				return // Channel closed, execution done
			}
			data, err := json.Marshal(event)
			if err != nil {
				continue
			}
			if err := conn.Write(ctx, websocket.MessageText, data); err != nil {
				slog.Debug("websocket write failed", "error", err)
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
