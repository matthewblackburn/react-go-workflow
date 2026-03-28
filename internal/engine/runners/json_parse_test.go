package runners

import (
	"context"
	"testing"
)

func TestJSONParseRunner(t *testing.T) {
	r := &JSONParseRunner{}

	t.Run("valid JSON string", func(t *testing.T) {
		config := map[string]any{"source": `{"name":"Alice","age":30}`}
		got, err := r.Run(context.Background(), config, nil)
		if err != nil {
			t.Errorf("Run() error: %v", err)
			return
		}
		if got["name"] != "Alice" {
			t.Errorf("name = %v, want Alice", got["name"])
		}
		if got["age"] != float64(30) {
			t.Errorf("age = %v (%T), want 30", got["age"], got["age"])
		}
	})

	t.Run("already a map passthrough", func(t *testing.T) {
		m := map[string]any{"key": "value"}
		config := map[string]any{"source": m}
		got, err := r.Run(context.Background(), config, nil)
		if err != nil {
			t.Errorf("Run() error: %v", err)
			return
		}
		if got["key"] != "value" {
			t.Errorf("key = %v, want value", got["key"])
		}
	})

	t.Run("invalid JSON error", func(t *testing.T) {
		config := map[string]any{"source": "not-json"}
		_, err := r.Run(context.Background(), config, nil)
		if err == nil {
			t.Errorf("Run() expected error for invalid JSON")
		}
	})

	t.Run("non-string non-map error", func(t *testing.T) {
		config := map[string]any{"source": 42}
		_, err := r.Run(context.Background(), config, nil)
		if err == nil {
			t.Errorf("Run() expected error for non-string non-map source")
		}
	})

	t.Run("nested JSON", func(t *testing.T) {
		config := map[string]any{"source": `{"outer":{"inner":"deep"}}`}
		got, err := r.Run(context.Background(), config, nil)
		if err != nil {
			t.Errorf("Run() error: %v", err)
			return
		}
		outer, ok := got["outer"].(map[string]any)
		if !ok {
			t.Errorf("outer is not a map: %T", got["outer"])
			return
		}
		if outer["inner"] != "deep" {
			t.Errorf("outer.inner = %v, want deep", outer["inner"])
		}
	})

	t.Run("nil source", func(t *testing.T) {
		config := map[string]any{"source": nil}
		_, err := r.Run(context.Background(), config, nil)
		if err == nil {
			t.Errorf("Run() expected error for nil source")
		}
	})
}

func TestJSONParseRunner_ArrayInput(t *testing.T) {
	r := &JSONParseRunner{}
	config := map[string]any{
		"source": []any{"a", "b", "c"},
	}
	output, err := r.Run(context.Background(), config, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	items, ok := output["items"].([]any)
	if !ok {
		t.Fatal("expected items array in output")
	}
	if len(items) != 3 {
		t.Errorf("expected 3 items, got %d", len(items))
	}
	if output["count"] != 3 {
		t.Errorf("expected count 3, got %v", output["count"])
	}
}

func TestJSONParseRunner_ArrayString(t *testing.T) {
	r := &JSONParseRunner{}
	config := map[string]any{
		"source": `[1, 2, 3]`,
	}
	output, err := r.Run(context.Background(), config, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if output["count"] != 3 {
		t.Errorf("expected count 3, got %v", output["count"])
	}
}

func TestJSONParseRunner_NilSource(t *testing.T) {
	r := &JSONParseRunner{}
	config := map[string]any{}
	_, err := r.Run(context.Background(), config, nil)
	if err == nil {
		t.Fatal("expected error for nil source")
	}
}

func TestJSONParseRunner_EmptyString(t *testing.T) {
	r := &JSONParseRunner{}
	config := map[string]any{
		"source": "",
	}
	_, err := r.Run(context.Background(), config, nil)
	if err == nil {
		t.Fatal("expected error for empty string")
	}
}
