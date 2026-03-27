package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"react-go-workflow/ent"
	entnotif "react-go-workflow/ent/notification"
	entnotifset "react-go-workflow/ent/notificationsetting"

	"github.com/google/uuid"
)

// Dispatch sends notifications for a completed/failed workflow execution.
// Runs in a goroutine — non-blocking, fire-and-forget.
func Dispatch(client *ent.Client, workflowID uuid.UUID, workflowName string, executionID uuid.UUID, status string, errMsg string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		settings, err := client.NotificationSetting.Query().
			Where(entnotifset.WorkflowID(workflowID), entnotifset.Enabled(true)).
			All(ctx)
		if err != nil {
			slog.Warn("failed to load notification settings", "workflow_id", workflowID, "error", err)
			return
		}

		for _, s := range settings {
			if !shouldNotify(s.NotifyOn.String(), status) {
				continue
			}

			switch s.Channel.String() {
			case "in_app":
				dispatchInApp(ctx, client, workflowID, executionID, workflowName, status, errMsg)
			case "webhook":
				dispatchWebhook(ctx, s.Config, workflowID, workflowName, executionID, status, errMsg)
			}
		}
	}()
}

func shouldNotify(notifyOn, status string) bool {
	switch notifyOn {
	case "all":
		return true
	case "failure":
		return status == "failed"
	case "success":
		return status == "completed"
	default:
		return false
	}
}

func dispatchInApp(ctx context.Context, client *ent.Client, workflowID, executionID uuid.UUID, workflowName, status, errMsg string) {
	title := fmt.Sprintf("%s %s", workflowName, status)
	message := ""
	severity := entnotif.SeverityInfo

	switch status {
	case "completed":
		message = "Workflow completed successfully"
		severity = entnotif.SeveritySuccess
	case "failed":
		message = errMsg
		if message == "" {
			message = "Workflow execution failed"
		}
		severity = entnotif.SeverityError
	}

	_, err := client.Notification.Create().
		SetWorkflowID(workflowID).
		SetWorkflowExecutionID(executionID).
		SetTitle(title).
		SetMessage(message).
		SetSeverity(severity).
		Save(ctx)
	if err != nil {
		slog.Warn("failed to create in-app notification", "error", err)
	}
}

func dispatchWebhook(ctx context.Context, config map[string]any, workflowID uuid.UUID, workflowName string, executionID uuid.UUID, status, errMsg string) {
	url, ok := config["url"].(string)
	if !ok || url == "" {
		slog.Warn("webhook notification missing url", "workflow_id", workflowID)
		return
	}

	payload := map[string]any{
		"workflow_id":   workflowID.String(),
		"workflow_name": workflowName,
		"execution_id":  executionID.String(),
		"status":        status,
		"timestamp":     time.Now().UTC().Format(time.RFC3339),
	}
	if errMsg != "" {
		payload["error"] = errMsg
	}

	body, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("failed to marshal webhook payload", "error", err)
		return
	}

	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "POST", url, bytes.NewReader(body))
	if err != nil {
		slog.Warn("failed to create webhook request", "url", url, "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("webhook notification failed", "url", url, "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		slog.Warn("webhook returned error status", "url", url, "status", resp.StatusCode)
	}
}
