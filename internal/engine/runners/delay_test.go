package runners

import (
	"context"
	"testing"
)

func TestDelay_CancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	r := &DelayRunner{}
	_, err := r.Run(ctx, map[string]any{
		"duration_seconds": 10.0,
	}, nil)
	if err == nil {
		t.Errorf("expected error for cancelled context")
	}
}

func TestDelay_ShortDelay(t *testing.T) {
	r := &DelayRunner{}
	out, err := r.Run(context.Background(), map[string]any{
		"duration_seconds": 0.01,
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if out["waited_seconds"] != 0.01 {
		t.Errorf("waited_seconds = %v, want 0.01", out["waited_seconds"])
	}
}

func TestDelay_DefaultDurationCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	r := &DelayRunner{}
	_, err := r.Run(ctx, map[string]any{}, nil)
	if err == nil {
		t.Errorf("expected error for default duration with cancelled context")
	}
}
