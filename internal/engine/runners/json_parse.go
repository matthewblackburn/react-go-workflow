package runners

import (
	"context"
	"encoding/json"
	"fmt"
)

type JSONParseRunner struct{}

func (r *JSONParseRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	source := config["source"]

	if source == nil {
		return nil, fmt.Errorf("source is empty — nothing to parse")
	}

	// If already a map, return it
	if m, ok := source.(map[string]any); ok {
		return m, nil
	}

	// If it's an array, wrap it
	if arr, ok := source.([]any); ok {
		return map[string]any{"items": arr, "count": len(arr)}, nil
	}

	// Parse JSON string
	str, ok := source.(string)
	if !ok {
		return nil, fmt.Errorf("expected a JSON string or object, but got %T — check that the source expression points to the correct field", source)
	}

	if str == "" {
		return nil, fmt.Errorf("source is an empty string — nothing to parse")
	}

	// Try parsing as object first, then array
	var obj map[string]any
	if err := json.Unmarshal([]byte(str), &obj); err == nil {
		return obj, nil
	}

	var arr []any
	if err := json.Unmarshal([]byte(str), &arr); err == nil {
		return map[string]any{"items": arr, "count": len(arr)}, nil
	}

	return nil, fmt.Errorf("failed to parse as JSON — make sure the source contains valid JSON")
}
