package runners

import (
	"context"
)

type SetVariableRunner struct{}

func (r *SetVariableRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	name, _ := config["variable_name"].(string)
	value := config["value"]

	return map[string]any{
		name: value,
	}, nil
}
