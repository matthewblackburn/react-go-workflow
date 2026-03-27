package engine

import (
	"testing"
)

func newTestContext() *ExecContext {
	ctx := NewExecContext(map[string]any{
		"name":  "test-run",
		"count": 42,
	})
	ctx.SetStepOutput("fetch", "", map[string]any{
		"status": 200,
		"body": map[string]any{
			"id":   "abc-123",
			"name": "Widget",
			"tags": []any{"new", "sale"},
		},
	})
	ctx.SetStepOutput("transform", "", map[string]any{
		"result": "transformed-value",
	})
	ctx.SetSecret("API_KEY", "sk-secret-123")
	ctx.SetEnv("APP_ENV", "production")
	return ctx
}

func TestResolveExpression_StepOutput(t *testing.T) {
	ctx := newTestContext()

	tests := []struct {
		expr string
		want any
	}{
		{"steps.fetch.output.status", 200},
		{"steps.fetch.output.body.id", "abc-123"},
		{"steps.fetch.output.body.name", "Widget"},
		{"steps.transform.output.result", "transformed-value"},
	}

	for _, tt := range tests {
		got, err := ResolveExpression(tt.expr, ctx)
		if err != nil {
			t.Errorf("ResolveExpression(%q) error: %v", tt.expr, err)
			continue
		}
		if got != tt.want {
			t.Errorf("ResolveExpression(%q) = %v, want %v", tt.expr, got, tt.want)
		}
	}
}

func TestResolveExpression_WorkflowInput(t *testing.T) {
	ctx := newTestContext()

	got, err := ResolveExpression("workflow.input.name", ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got != "test-run" {
		t.Errorf("got %v, want test-run", got)
	}

	got, err = ResolveExpression("workflow.input.count", ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got != 42 {
		t.Errorf("got %v, want 42", got)
	}
}

func TestResolveExpression_Secrets(t *testing.T) {
	ctx := newTestContext()

	got, err := ResolveExpression("secrets.API_KEY", ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got != "sk-secret-123" {
		t.Errorf("got %v, want sk-secret-123", got)
	}
}

func TestResolveExpression_Env(t *testing.T) {
	ctx := newTestContext()

	got, err := ResolveExpression("env.APP_ENV", ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got != "production" {
		t.Errorf("got %v, want production", got)
	}
}

func TestResolveExpression_Errors(t *testing.T) {
	ctx := newTestContext()

	_, err := ResolveExpression("steps.missing.output.field", ctx)
	if err == nil {
		t.Error("expected error for missing step")
	}

	_, err = ResolveExpression("secrets.MISSING_KEY", ctx)
	if err == nil {
		t.Error("expected error for missing secret")
	}

	_, err = ResolveExpression("unknown.path", ctx)
	if err == nil {
		t.Error("expected error for unknown root")
	}
}

func TestResolveString_SingleExpression(t *testing.T) {
	ctx := newTestContext()

	// Single expression — should return raw type (int)
	got, err := ResolveString("{{steps.fetch.output.status}}", ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got != 200 {
		t.Errorf("got %v (%T), want 200", got, got)
	}
}

func TestResolveString_Interpolation(t *testing.T) {
	ctx := newTestContext()

	got, err := ResolveString("Status: {{steps.fetch.output.status}}, Name: {{steps.fetch.output.body.name}}", ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := "Status: 200, Name: Widget"
	if got != want {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestResolveString_NoExpressions(t *testing.T) {
	ctx := newTestContext()

	got, err := ResolveString("just plain text", ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got != "just plain text" {
		t.Errorf("got %v, want plain text", got)
	}
}

func TestResolveMap(t *testing.T) {
	ctx := newTestContext()

	input := map[string]any{
		"url":    "https://api.example.com/{{steps.fetch.output.body.id}}",
		"header": "Bearer {{secrets.API_KEY}}",
		"static": "no-change",
		"number": 123,
	}

	got, err := ResolveMap(input, ctx)
	if err != nil {
		t.Fatal(err)
	}

	if got["url"] != "https://api.example.com/abc-123" {
		t.Errorf("url = %v", got["url"])
	}
	if got["header"] != "Bearer sk-secret-123" {
		t.Errorf("header = %v", got["header"])
	}
	if got["static"] != "no-change" {
		t.Errorf("static = %v", got["static"])
	}
	if got["number"] != 123 {
		t.Errorf("number = %v", got["number"])
	}
}

func TestExtractStepRefs(t *testing.T) {
	config := map[string]any{
		"field":   "{{steps.fetch.output.status}}",
		"value":   "200",
		"nested":  map[string]any{"url": "{{steps.abc-123.output.body}}"},
		"noref":   "plain text",
		"secrets": "{{secrets.API_KEY}}", // not a step ref
	}

	refs := ExtractStepRefs(config)

	if !refs["fetch"] {
		t.Error("expected 'fetch' in refs")
	}
	if !refs["abc-123"] {
		t.Error("expected 'abc-123' in refs")
	}
	if refs["API_KEY"] {
		t.Error("should not include secret refs")
	}
	if len(refs) != 2 {
		t.Errorf("expected 2 refs, got %d: %v", len(refs), refs)
	}
}

func TestExtractStepRefs_Empty(t *testing.T) {
	refs := ExtractStepRefs(map[string]any{"static": "hello"})
	if len(refs) != 0 {
		t.Errorf("expected 0 refs, got %d", len(refs))
	}
}

func TestExtractStepRefs_UUID(t *testing.T) {
	config := map[string]any{
		"field": "{{steps.21e3e7cb-5d51-45f9-99d9-054680d1c9b5.output.status}}",
	}
	refs := ExtractStepRefs(config)
	if !refs["21e3e7cb-5d51-45f9-99d9-054680d1c9b5"] {
		t.Error("expected UUID ref")
	}
}
