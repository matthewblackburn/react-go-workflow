package runners

import (
	"context"
	"fmt"
	"log/slog"
)

type DatabaseQueryRunner struct{}

func (r *DatabaseQueryRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	connStr, _ := config["connection_string"].(string)
	query, _ := config["query"].(string)

	if connStr == "" || query == "" {
		return nil, fmt.Errorf("connection_string and query are required")
	}

	// TODO: Implement actual database query execution
	// For now, log what would be executed
	slog.Info("database query would be executed",
		"query", query,
	)

	return map[string]any{
		"rows":      []any{},
		"row_count": 0,
	}, nil
}
