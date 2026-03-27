package runners

import (
	"context"
	"fmt"
	"log/slog"
)

type SendEmailRunner struct{}

func (r *SendEmailRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	to, _ := config["to"].(string)
	subject, _ := config["subject"].(string)
	body, _ := config["body"].(string)

	if to == "" || subject == "" {
		return nil, fmt.Errorf("to and subject are required")
	}

	// TODO: Implement actual SMTP sending when smtp_host is configured
	// For now, log the email that would be sent
	slog.Info("email would be sent",
		"to", to,
		"subject", subject,
		"body_length", len(body),
	)

	return map[string]any{
		"sent":       true,
		"message_id": fmt.Sprintf("mock-%s", to),
	}, nil
}
