package runners

import (
	"context"
	"testing"
)

func TestEvaluate(t *testing.T) {
	tests := []struct {
		name     string
		field    string
		operator string
		value    string
		want     bool
	}{
		// equals
		{"equals match", "hello", "equals", "hello", true},
		{"equals no match", "hello", "equals", "world", false},

		// not_equals
		{"not_equals match", "hello", "not_equals", "world", true},
		{"not_equals no match", "hello", "not_equals", "hello", false},

		// contains
		{"contains match", "hello world", "contains", "world", true},
		{"contains no match", "hello world", "contains", "foo", false},

		// not_contains
		{"not_contains match", "hello", "not_contains", "world", true},
		{"not_contains no match", "hello world", "not_contains", "world", false},

		// greater_than (string comparison)
		{"greater_than true", "b", "greater_than", "a", true},
		{"greater_than false", "a", "greater_than", "b", false},

		// less_than (string comparison)
		{"less_than true", "a", "less_than", "b", true},
		{"less_than false", "b", "less_than", "a", false},

		// is_empty
		{"is_empty empty string", "", "is_empty", "", true},
		{"is_empty nil string", "<nil>", "is_empty", "", true},
		{"is_empty non-empty", "hello", "is_empty", "", false},

		// is_not_empty
		{"is_not_empty non-empty", "hello", "is_not_empty", "", true},
		{"is_not_empty empty", "", "is_not_empty", "", false},
		{"is_not_empty nil", "<nil>", "is_not_empty", "", false},

		// unknown operator
		{"unknown operator returns false", "a", "unknown_op", "a", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := evaluate(tt.field, tt.operator, tt.value)
			if got != tt.want {
				t.Errorf("evaluate(%q, %q, %q) = %v, want %v", tt.field, tt.operator, tt.value, got, tt.want)
			}
		})
	}
}

func TestConditionRunner_Run_NilField(t *testing.T) {
	r := &ConditionRunner{}
	config := map[string]any{
		"field":    nil,
		"operator": "is_empty",
		"value":    "",
	}
	out, err := r.Run(context.Background(), config, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	result, ok := out["result"].(bool)
	if !ok {
		t.Fatal("result is not a bool")
	}
	if !result {
		t.Errorf("nil field should coerce to '<nil>' and evaluate is_empty as true")
	}
}

func TestConditionRunner_Run_ReturnsResultBool(t *testing.T) {
	r := &ConditionRunner{}
	config := map[string]any{
		"field":    "abc",
		"operator": "equals",
		"value":    "abc",
	}
	out, err := r.Run(context.Background(), config, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	result, ok := out["result"].(bool)
	if !ok {
		t.Fatalf("result should be bool, got %T", out["result"])
	}
	if !result {
		t.Errorf("expected result true for equals match")
	}
}
