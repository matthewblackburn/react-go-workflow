package runners

import (
	"context"
	"fmt"
	"strings"
)

type ConditionRunner struct{}

func (r *ConditionRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	field := fmt.Sprintf("%v", config["field"])
	operator, _ := config["operator"].(string)
	value := fmt.Sprintf("%v", config["value"])

	result := evaluate(field, operator, value)

	return map[string]any{
		"result": result,
	}, nil
}

func evaluate(field, operator, value string) bool {
	switch operator {
	case "equals":
		return field == value
	case "not_equals":
		return field != value
	case "contains":
		return strings.Contains(field, value)
	case "not_contains":
		return !strings.Contains(field, value)
	case "greater_than":
		return field > value
	case "less_than":
		return field < value
	case "is_empty":
		return field == "" || field == "<nil>"
	case "is_not_empty":
		return field != "" && field != "<nil>"
	default:
		return false
	}
}
