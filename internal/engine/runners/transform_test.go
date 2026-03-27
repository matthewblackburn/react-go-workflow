package runners

import (
	"context"
	"testing"
)

func TestTransformRunner_Run(t *testing.T) {
	tests := []struct {
		name       string
		config     map[string]any
		input      map[string]any
		wantKeys   map[string]any
		wantPassth bool // expect input returned as-is
	}{
		{
			name: "single mapping",
			config: map[string]any{
				"mappings": []any{
					map[string]any{"source": "hello", "target": "greeting"},
				},
			},
			input:    map[string]any{"orig": "data"},
			wantKeys: map[string]any{"greeting": "hello"},
		},
		{
			name: "multiple mappings",
			config: map[string]any{
				"mappings": []any{
					map[string]any{"source": "a", "target": "x"},
					map[string]any{"source": "b", "target": "y"},
				},
			},
			input:    map[string]any{},
			wantKeys: map[string]any{"x": "a", "y": "b"},
		},
		{
			name: "empty target skipped",
			config: map[string]any{
				"mappings": []any{
					map[string]any{"source": "val", "target": ""},
				},
			},
			input:      map[string]any{"pass": "through"},
			wantPassth: true,
		},
		{
			name: "empty mappings passthrough",
			config: map[string]any{
				"mappings": []any{},
			},
			input:      map[string]any{"keep": "me"},
			wantPassth: true,
		},
		{
			name:       "nil mappings passthrough",
			config:     map[string]any{"mappings": nil},
			input:      map[string]any{"keep": "me"},
			wantPassth: true,
		},
		{
			name:       "no mappings key passthrough",
			config:     map[string]any{},
			input:      map[string]any{"keep": "me"},
			wantPassth: true,
		},
		{
			name: "invalid mapping type skipped",
			config: map[string]any{
				"mappings": []any{"not-a-map"},
			},
			input:      map[string]any{"keep": "me"},
			wantPassth: true,
		},
		{
			name: "duplicate target last wins",
			config: map[string]any{
				"mappings": []any{
					map[string]any{"source": "first", "target": "key"},
					map[string]any{"source": "second", "target": "key"},
				},
			},
			input:    map[string]any{},
			wantKeys: map[string]any{"key": "second"},
		},
	}

	r := &TransformRunner{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := r.Run(context.Background(), tt.config, tt.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantPassth {
				for k, v := range tt.input {
					if got[k] != v {
						t.Errorf("passthrough: got[%q] = %v, want %v", k, got[k], v)
					}
				}
				return
			}
			for k, v := range tt.wantKeys {
				if got[k] != v {
					t.Errorf("got[%q] = %v, want %v", k, got[k], v)
				}
			}
		})
	}
}
