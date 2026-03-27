package runners

import (
	"context"
	"react-go-workflow/internal/engine"
	"testing"
)

func TestRegistry_RegisterAllAndGetAll(t *testing.T) {
	reg := engine.NewRunnerRegistry()
	RegisterAll(reg)

	types := []string{
		"http_request",
		"transform",
		"condition",
		"loop",
		"delay",
		"log",
		"set_variable",
		"send_email",
		"database_query",
		"webhook_response",
		"json_parse",
		"filter",
		"sub_workflow",
	}

	for _, typ := range types {
		runner, err := reg.Get(typ)
		if err != nil {
			t.Errorf("Get(%q) error: %v", typ, err)
			continue
		}
		if runner == nil {
			t.Errorf("Get(%q) returned nil runner", typ)
		}
	}
}

func TestRegistry_GetUnknown(t *testing.T) {
	reg := engine.NewRunnerRegistry()
	RegisterAll(reg)

	_, err := reg.Get("nonexistent_type")
	if err == nil {
		t.Errorf("expected error for unknown step type")
	}
}

type mockRunner struct{}

func (m *mockRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	return map[string]any{"mock": true}, nil
}

func TestRegistry_RegisterAndGetCustom(t *testing.T) {
	reg := engine.NewRunnerRegistry()
	reg.Register("custom_type", &mockRunner{})

	runner, err := reg.Get("custom_type")
	if err != nil {
		t.Errorf("Get(custom_type) error: %v", err)
		return
	}
	out, err := runner.Run(context.Background(), nil, nil)
	if err != nil {
		t.Errorf("Run error: %v", err)
		return
	}
	if out["mock"] != true {
		t.Errorf("mock = %v, want true", out["mock"])
	}
}
