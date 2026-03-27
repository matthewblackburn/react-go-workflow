package engine

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"nhooyr.io/websocket"
)

type WSHandler struct {
	eventBus *EventBus
}

func NewWSHandler(eventBus *EventBus) *WSHandler {
	return &WSHandler{eventBus: eventBus}
}

// Handle upgrades the HTTP connection to a WebSocket and streams execution events.
func (h *WSHandler) Handle(w http.ResponseWriter, r *http.Request) {
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
