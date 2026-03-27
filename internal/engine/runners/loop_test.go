package runners

import (
	"context"
	"testing"
)

func TestLoopRunner_Run(t *testing.T) {
	tests := []struct {
		name      string
		config    map[string]any
		wantCount int
		wantErr   bool
	}{
		{
			name: "basic array passthrough",
			config: map[string]any{
				"source_array": []any{"a", "b", "c"},
			},
			wantCount: 3,
		},
		{
			name: "empty array",
			config: map[string]any{
				"source_array": []any{},
			},
			wantCount: 0,
		},
		{
			name:    "nil source returns error",
			config:  map[string]any{},
			wantErr: true,
		},
		{
			name: "array of maps",
			config: map[string]any{
				"source_array": []any{
					map[string]any{"id": 1},
					map[string]any{"id": 2},
				},
			},
			wantCount: 2,
		},
		{
			name: "mixed types",
			config: map[string]any{
				"source_array": []any{"str", 42, true, nil},
			},
			wantCount: 4,
		},
	}

	r := &LoopRunner{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := r.Run(context.Background(), tt.config, nil)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
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
