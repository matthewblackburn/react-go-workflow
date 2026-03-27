package runners

import (
	"context"
)

type TransformRunner struct{}

func (r *TransformRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	mappings, _ := config["mappings"].([]any)
	output := make(map[string]any)

	for _, m := range mappings {
		mapping, ok := m.(map[string]any)
		if !ok {
			continue
		}
		source, _ := mapping["source"].(string)
		target, _ := mapping["target"].(string)
		if target == "" {
			continue
		}
		// Source is already resolved by the expression resolver
		output[target] = source
	}

	// If no mappings, pass through input
	if len(output) == 0 {
		return input, nil
	}

	return output, nil
}
