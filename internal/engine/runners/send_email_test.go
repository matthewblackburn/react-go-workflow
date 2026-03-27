package runners

import (
	"context"
	"testing"
)

func TestSendEmail_ValidToAndSubject(t *testing.T) {
	r := &SendEmailRunner{}
	out, err := r.Run(context.Background(), map[string]any{
		"to":      "user@example.com",
		"subject": "Hello",
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if out["sent"] != true {
		t.Errorf("sent = %v, want true", out["sent"])
	}
}

func TestSendEmail_MissingTo(t *testing.T) {
	r := &SendEmailRunner{}
	_, err := r.Run(context.Background(), map[string]any{
		"subject": "Hello",
	}, nil)
	if err == nil {
		t.Errorf("expected error for missing to")
	}
}

func TestSendEmail_MissingSubject(t *testing.T) {
	r := &SendEmailRunner{}
	_, err := r.Run(context.Background(), map[string]any{
		"to": "user@example.com",
	}, nil)
	if err == nil {
		t.Errorf("expected error for missing subject")
	}
}

func TestSendEmail_WithBody(t *testing.T) {
	r := &SendEmailRunner{}
	out, err := r.Run(context.Background(), map[string]any{
		"to":      "user@example.com",
		"subject": "Hello",
		"body":    "This is the body",
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if out["sent"] != true {
		t.Errorf("sent = %v, want true", out["sent"])
	}
}
