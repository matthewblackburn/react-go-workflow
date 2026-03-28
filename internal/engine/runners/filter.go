package runners

import (
	"context"
	"fmt"
)

type FilterRunner struct{}

func (r *FilterRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	sourceArray, _ := config["source_array"].([]any)
	field, _ := config["field"].(string)
	operator, _ := config["operator"].(string)
	value := fmt.Sprintf("%v", config["value"])

	filtered := make([]any, 0)
	for _, item := range sourceArray {
		itemMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		fieldVal := fmt.Sprintf("%v", itemMap[field])
		if evaluate(fieldVal, operator, value) {
			filtered = append(filtered, item)
		}
	}

	return map[string]any{
		"items": filtered,
		"count": len(filtered),
	}, nil
}
