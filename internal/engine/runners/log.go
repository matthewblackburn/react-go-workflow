package runners

import (
	"context"
	"fmt"
	"log/slog"
)

type LogRunner struct{}

func (r *LogRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	message, _ := config["message"].(string)
	level, _ := config["level"].(string)
	if message == "" {
		message = fmt.Sprintf("%v", config["message"])
	}

	switch level {
	case "warn":
		slog.Warn("workflow log", "message", message)
	case "error":
		slog.Error("workflow log", "message", message)
	default:
		slog.Info("workflow log", "message", message)
	}

	return map[string]any{
		"message": message,
		"level":   level,
	}, nil
}
