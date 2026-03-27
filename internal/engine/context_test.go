package engine

import (
	"sync"
	"testing"
)

func TestExecContext_SetAndGetByName(t *testing.T) {
	ctx := NewExecContext(nil)
	ctx.SetStepOutput("fetch", "", map[string]any{"status": 200})

	out := ctx.GetStepOutput("fetch")
	if out == nil {
		t.Fatal("expected output, got nil")
	}
	if out["status"] != 200 {
		t.Errorf("status = %v, want 200", out["status"])
	}
}

func TestExecContext_SetWithIDAndGetByID(t *testing.T) {
	ctx := NewExecContext(nil)
	ctx.SetStepOutput("fetch", "abc-123", map[string]any{"status": 200})

	out := ctx.GetStepOutput("abc-123")
	if out == nil {
		t.Fatal("expected output by ID, got nil")
	}
	if out["status"] != 200 {
		t.Errorf("status = %v, want 200", out["status"])
	}
}

func TestExecContext_MissingStepReturnsNil(t *testing.T) {
	ctx := NewExecContext(nil)
	out := ctx.GetStepOutput("nonexistent")
	if out != nil {
		t.Errorf("expected nil, got %v", out)
	}
}

func TestExecContext_SetSecret(t *testing.T) {
	ctx := NewExecContext(nil)
	ctx.SetSecret("API_KEY", "sk-123")

	if ctx.Secrets["API_KEY"] != "sk-123" {
		t.Errorf("secret = %q, want %q", ctx.Secrets["API_KEY"], "sk-123")
	}
}

func TestExecContext_SetEnv(t *testing.T) {
	ctx := NewExecContext(nil)
	ctx.SetEnv("APP_ENV", "production")

	if ctx.Env["APP_ENV"] != "production" {
		t.Errorf("env = %q, want %q", ctx.Env["APP_ENV"], "production")
	}
}

func TestExecContext_ConcurrentAccess(t *testing.T) {
	ctx := NewExecContext(nil)
	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			name := "step" + string(rune('A'+n))
			ctx.SetStepOutput(name, "", map[string]any{"n": n})
			ctx.GetStepOutput(name)
			ctx.SetSecret(name, "val")
			ctx.SetEnv(name, "val")
		}(i)
	}
	wg.Wait()

	// If we reach here without a race detector failure, the test passes.
}
