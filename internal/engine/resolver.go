package engine

import (
	"fmt"
	"regexp"
	"strings"
)

// expressionPattern matches {{...}} expressions in strings.
var expressionPattern = regexp.MustCompile(`\{\{([^}]+)\}\}`)

// stepRefPattern matches step references: {{steps.<name_or_id>.<path>}}
var stepRefPattern = regexp.MustCompile(`\{\{steps\.([^.}]+)\.[^}]*\}\}`)

// ExtractStepRefs extracts all step name/ID references from a config map.
// Returns a set of step name/ID strings found in {{steps.<ref>.<path>}} patterns.
func ExtractStepRefs(config map[string]any) map[string]bool {
	refs := make(map[string]bool)
	extractFromValue(config, refs)
	return refs
}

func extractFromValue(v any, refs map[string]bool) {
	switch val := v.(type) {
	case string:
		for _, match := range stepRefPattern.FindAllStringSubmatch(val, -1) {
			if len(match) > 1 {
				refs[match[1]] = true
			}
		}
	case map[string]any:
		for _, child := range val {
			extractFromValue(child, refs)
		}
	case []any:
		for _, item := range val {
			extractFromValue(item, refs)
		}
	}
}

// ResolveExpression resolves a single expression like "steps.fetch.output.body.name"
// against the execution context. Returns the resolved value.
func ResolveExpression(expr string, ctx *ExecContext) (any, error) {
	expr = strings.TrimSpace(expr)
	parts := strings.Split(expr, ".")

	if len(parts) < 2 {
		return nil, fmt.Errorf("invalid expression: %s", expr)
	}

	switch parts[0] {
	case "steps":
		return resolveStepExpr(parts[1:], ctx)
	case "workflow":
		return resolveWorkflowExpr(parts[1:], ctx)
	case "secrets":
		return resolveSecretExpr(parts[1:], ctx)
	case "env":
		return resolveEnvExpr(parts[1:], ctx)
	default:
		return nil, fmt.Errorf("unknown expression root: %s", parts[0])
	}
}

// ResolveString resolves all {{...}} expressions within a string,
// replacing them with their values. If the entire string is a single
// expression, returns the raw value (preserving type). Otherwise
// returns a string with expressions interpolated.
func ResolveString(s string, ctx *ExecContext) (any, error) {
	matches := expressionPattern.FindAllStringIndex(s, -1)
	if len(matches) == 0 {
		return s, nil
	}

	// If the entire string is a single expression, return the raw value
	if len(matches) == 1 && matches[0][0] == 0 && matches[0][1] == len(s) {
		expr := s[2 : len(s)-2] // strip {{ and }}
		return ResolveExpression(expr, ctx)
	}

	// Multiple expressions or mixed text — interpolate as string
	var resolveErr error
	result := expressionPattern.ReplaceAllStringFunc(s, func(match string) string {
		expr := match[2 : len(match)-2]
		val, err := ResolveExpression(expr, ctx)
		if err != nil {
			resolveErr = fmt.Errorf("expression %s: %w", match, err)
			return match
		}
		return fmt.Sprintf("%v", val)
	})

	if resolveErr != nil {
		return nil, resolveErr
	}
	return result, nil
}

// ResolveMap resolves all expression strings within a map recursively.
func ResolveMap(data map[string]any, ctx *ExecContext) (map[string]any, error) {
	if data == nil {
		return nil, nil
	}

	result := make(map[string]any, len(data))
	for k, v := range data {
		resolved, err := resolveValue(v, ctx)
		if err != nil {
			return nil, fmt.Errorf("field %s: %w", k, err)
		}
		result[k] = resolved
	}
	return result, nil
}

func resolveValue(v any, ctx *ExecContext) (any, error) {
	switch val := v.(type) {
	case string:
		return ResolveString(val, ctx)
	case map[string]any:
		return ResolveMap(val, ctx)
	case []any:
		result := make([]any, len(val))
		for i, item := range val {
			resolved, err := resolveValue(item, ctx)
			if err != nil {
				return nil, err
			}
			result[i] = resolved
		}
		return result, nil
	default:
		return v, nil
	}
}

// resolveStepExpr resolves "step_name.output.field.path"
func resolveStepExpr(parts []string, ctx *ExecContext) (any, error) {
	if len(parts) < 2 {
		return nil, fmt.Errorf("step expression needs at least step_name.output")
	}

	stepName := parts[0]
	output := ctx.GetStepOutput(stepName)
	if output == nil {
		return nil, fmt.Errorf("step '%s' has no output yet (it may not have run or the name/ID doesn't match a completed step)", stepName)
	}

	if parts[1] != "output" {
		return nil, fmt.Errorf("expected 'output' after step name, got '%s'", parts[1])
	}

	// Navigate into the output
	if len(parts) == 2 {
		return output, nil
	}

	return navigatePath(output, parts[2:])
}

// resolveWorkflowExpr resolves "input.field.path"
func resolveWorkflowExpr(parts []string, ctx *ExecContext) (any, error) {
	if len(parts) < 1 {
		return nil, fmt.Errorf("workflow expression needs at least one field")
	}

	if parts[0] != "input" {
		return nil, fmt.Errorf("expected 'input' after 'workflow', got '%s'", parts[0])
	}

	if len(parts) == 1 {
		return ctx.WorkflowInput, nil
	}

	return navigatePath(ctx.WorkflowInput, parts[1:])
}

// resolveSecretExpr resolves "SECRET_KEY"
func resolveSecretExpr(parts []string, ctx *ExecContext) (any, error) {
	if len(parts) != 1 {
		return nil, fmt.Errorf("secret expression should be: secrets.KEY_NAME")
	}

	ctx.mu.RLock()
	defer ctx.mu.RUnlock()

	val, ok := ctx.Secrets[parts[0]]
	if !ok {
		return nil, fmt.Errorf("secret '%s' not found", parts[0])
	}
	return val, nil
}

// resolveEnvExpr resolves "VAR_NAME"
func resolveEnvExpr(parts []string, ctx *ExecContext) (any, error) {
	if len(parts) != 1 {
		return nil, fmt.Errorf("env expression should be: env.VAR_NAME")
	}

	ctx.mu.RLock()
	defer ctx.mu.RUnlock()

	val, ok := ctx.Env[parts[0]]
	if !ok {
		return nil, fmt.Errorf("env var '%s' not found", parts[0])
	}
	return val, nil
}

// navigatePath walks a dot-separated path through nested maps/slices.
func navigatePath(data any, path []string) (any, error) {
	current := data

	for _, key := range path {
		switch v := current.(type) {
		case map[string]any:
			val, ok := v[key]
			if !ok {
				return nil, fmt.Errorf("key '%s' not found", key)
			}
			current = val
		default:
			return nil, fmt.Errorf("cannot navigate into %T with key '%s'", current, key)
		}
	}

	return current, nil
}
