package runners

import (
	"context"
	"testing"
)

func TestFilterRunner_Run(t *testing.T) {
	tests := []struct {
		name      string
		config    map[string]any
		wantCount int
	}{
		{
			name: "equals filter",
			config: map[string]any{
				"source_array": []any{
					map[string]any{"status": "active"},
					map[string]any{"status": "inactive"},
					map[string]any{"status": "active"},
				},
				"field":    "status",
				"operator": "equals",
				"value":    "active",
			},
			wantCount: 2,
		},
		{
			name: "contains filter",
			config: map[string]any{
				"source_array": []any{
					map[string]any{"name": "hello world"},
					map[string]any{"name": "goodbye"},
					map[string]any{"name": "world peace"},
				},
				"field":    "name",
				"operator": "contains",
				"value":    "world",
			},
			wantCount: 2,
		},
		{
			name: "no matches returns empty",
			config: map[string]any{
				"source_array": []any{
					map[string]any{"x": "a"},
				},
				"field":    "x",
				"operator": "equals",
				"value":    "z",
			},
			wantCount: 0,
		},
		{
			name: "empty source array",
			config: map[string]any{
				"source_array": []any{},
				"field":        "x",
				"operator":     "equals",
				"value":        "y",
			},
			wantCount: 0,
		},
		{
			name: "non-map items skipped",
			config: map[string]any{
				"source_array": []any{
					"string-item",
					42,
					map[string]any{"status": "active"},
				},
				"field":    "status",
				"operator": "equals",
				"value":    "active",
			},
			wantCount: 1,
		},
	}

	r := &FilterRunner{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := r.Run(context.Background(), tt.config, nil)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			count, ok := got["count"].(int)
			if !ok {
				t.Fatalf("count is not int: %T", got["count"])
			}
			if count != tt.wantCount {
				t.Errorf("count = %d, want %d", count, tt.wantCount)
			}
		})
	}
}

func TestFilterRunner_EmptyResult_ReturnsEmptyArray(t *testing.T) {
	r := &FilterRunner{}
	config := map[string]any{
		"source_array": []any{
			map[string]any{"name": "Alice", "age": "30"},
		},
		"field":    "name",
		"operator": "equals",
		"value":    "Nobody",
	}
	output, err := r.Run(context.Background(), config, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	items, ok := output["items"].([]any)
	if !ok {
		t.Fatal("items should be a []any, not nil")
	}
	if len(items) != 0 {
		t.Errorf("expected 0 items, got %d", len(items))
	}
	if output["count"] != 0 {
		t.Errorf("expected count 0, got %v", output["count"])
	}
}
