package runners

import (
	"context"
)

type TransformRunner struct{}

func (r *TransformRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	output := make(map[string]any)

	// New format: flat object {target: source_expression}
	if mappingObj, ok := config["mappings"].(map[string]any); ok {
		for target, source := range mappingObj {
			if target != "" {
				output[target] = source
			}
		}
	}

	// Legacy format: array of {source, target} objects
	if mappingArr, ok := config["mappings"].([]any); ok {
		for _, m := range mappingArr {
			mapping, ok := m.(map[string]any)
			if !ok {
				continue
			}
			source, _ := mapping["source"].(string)
			target, _ := mapping["target"].(string)
			if target != "" {
				output[target] = source
			}
		}
	}

	// If no mappings, pass through input
	if len(output) == 0 {
		return input, nil
	}

	return output, nil
}
