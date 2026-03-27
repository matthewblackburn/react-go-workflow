package runners

import (
	"context"
	"testing"
)

func TestSubWorkflow_MissingWorkflowID(t *testing.T) {
	r := &SubWorkflowRunner{}
	_, err := r.Run(context.Background(), map[string]any{}, nil)
	if err == nil {
		t.Errorf("expected error for missing workflow_id")
	}
}

func TestSubWorkflow_EmptyWorkflowID(t *testing.T) {
	r := &SubWorkflowRunner{}
	_, err := r.Run(context.Background(), map[string]any{
		"workflow_id": "",
	}, nil)
	if err == nil {
		t.Errorf("expected error for empty workflow_id")
	}
}

func TestSubWorkflow_ValidID(t *testing.T) {
	r := &SubWorkflowRunner{}
	out, err := r.Run(context.Background(), map[string]any{
		"workflow_id": "wf-123",
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	msg, ok := out["message"].(string)
	if !ok {
		t.Errorf("message is not a string: %T", out["message"])
		return
	}
	if msg != "sub-workflow wf-123 would be executed" {
		t.Errorf("message = %q, want %q", msg, "sub-workflow wf-123 would be executed")
	}
}
