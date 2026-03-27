package runners

import (
	"context"
	"fmt"
)

type LoopRunner struct{}

func (r *LoopRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	sourceArray, _ := config["source_array"].([]any)
	if sourceArray == nil {
		return nil, fmt.Errorf("source_array is not an array")
	}

	// For now, loop just passes through the items.
	// In a full implementation, it would execute sub-steps for each item.
	results := make([]any, len(sourceArray))
	for i, item := range sourceArray {
		results[i] = item
	}

	return map[string]any{
		"results": results,
		"count":   len(results),
	}, nil
}
