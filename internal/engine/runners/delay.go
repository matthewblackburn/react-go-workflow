package runners

import (
	"context"
	"fmt"
	"time"
)

type DelayRunner struct{}

func (r *DelayRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	seconds := 5.0
	if v, ok := config["duration_seconds"].(float64); ok {
		seconds = v
	}

	duration := time.Duration(seconds) * time.Second

	select {
	case <-time.After(duration):
		return map[string]any{
			"waited_seconds": seconds,
		}, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("delay cancelled: %w", ctx.Err())
	}
}
