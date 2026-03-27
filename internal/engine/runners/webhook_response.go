package runners

import (
	"context"
)

type WebhookResponseRunner struct{}

func (r *WebhookResponseRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	statusCode := 200
	if v, ok := config["status_code"].(float64); ok {
		statusCode = int(v)
	}
	body := config["body"]

	// Store the response data so the webhook handler can return it
	return map[string]any{
		"status_code": statusCode,
		"body":        body,
		"headers":     config["headers"],
	}, nil
}
