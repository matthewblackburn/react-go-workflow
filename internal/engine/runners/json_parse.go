package runners

import (
	"context"
	"encoding/json"
	"fmt"
)

type JSONParseRunner struct{}

func (r *JSONParseRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	source := config["source"]

	// If already a map, return it
	if m, ok := source.(map[string]any); ok {
		return m, nil
	}

	// Parse JSON string
	str, ok := source.(string)
	if !ok {
		return nil, fmt.Errorf("source is not a string: %T", source)
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(str), &result); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}

	return result, nil
}
