package runners

import (
	"context"
	"testing"
)

func TestLogRunner(t *testing.T) {
	r := &LogRunner{}

	tests := []struct {
		name      string
		config    map[string]any
		wantMsg   string
		wantLevel string
	}{
		{
			name:      "info level",
			config:    map[string]any{"message": "hello", "level": "info"},
			wantMsg:   "hello",
			wantLevel: "info",
		},
		{
			name:      "warn level",
			config:    map[string]any{"message": "careful", "level": "warn"},
			wantMsg:   "careful",
			wantLevel: "warn",
		},
		{
			name:      "error level",
			config:    map[string]any{"message": "broke", "level": "error"},
			wantMsg:   "broke",
			wantLevel: "error",
		},
		{
			name:      "empty level defaults to info",
			config:    map[string]any{"message": "default"},
			wantMsg:   "default",
			wantLevel: "",
		},
		{
			name:      "non-string message coercion",
			config:    map[string]any{"message": 123, "level": "info"},
			wantMsg:   "123",
			wantLevel: "info",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := r.Run(context.Background(), tt.config, nil)
			if err != nil {
				t.Errorf("Run() error: %v", err)
				return
			}
			if got["message"] != tt.wantMsg {
				t.Errorf("Run() message = %v, want %v", got["message"], tt.wantMsg)
			}
			if got["level"] != tt.wantLevel {
				t.Errorf("Run() level = %v, want %v", got["level"], tt.wantLevel)
			}
		})
	}
}
