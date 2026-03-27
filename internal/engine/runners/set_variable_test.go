package runners

import (
	"context"
	"testing"
)

func TestSetVariableRunner(t *testing.T) {
	r := &SetVariableRunner{}

	tests := []struct {
		name      string
		config    map[string]any
		wantKey   string
		wantValue any
	}{
		{
			name:      "string value",
			config:    map[string]any{"variable_name": "greeting", "value": "hello"},
			wantKey:   "greeting",
			wantValue: "hello",
		},
		{
			name:      "numeric value",
			config:    map[string]any{"variable_name": "count", "value": 42},
			wantKey:   "count",
			wantValue: 42,
		},
		{
			name:      "nil value",
			config:    map[string]any{"variable_name": "empty", "value": nil},
			wantKey:   "empty",
			wantValue: nil,
		},
		{
			name:      "empty name",
			config:    map[string]any{"value": "orphan"},
			wantKey:   "",
			wantValue: "orphan",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := r.Run(context.Background(), tt.config, nil)
			if err != nil {
				t.Errorf("Run() error: %v", err)
				return
			}
			v, ok := got[tt.wantKey]
			if !ok {
				t.Errorf("Run() missing key %q in output %v", tt.wantKey, got)
				return
			}
			if v != tt.wantValue {
				t.Errorf("Run()[%q] = %v, want %v", tt.wantKey, v, tt.wantValue)
			}
		})
	}
}
