package runners

import (
	"context"
	"testing"
)

func TestWebhookResponseRunner(t *testing.T) {
	r := &WebhookResponseRunner{}

	t.Run("default status 200", func(t *testing.T) {
		config := map[string]any{"body": "ok"}
		got, err := r.Run(context.Background(), config, nil)
		if err != nil {
			t.Errorf("Run() error: %v", err)
			return
		}
		if got["status_code"] != 200 {
			t.Errorf("status_code = %v, want 200", got["status_code"])
		}
	})

	t.Run("custom status", func(t *testing.T) {
		config := map[string]any{"status_code": float64(404), "body": "not found"}
		got, err := r.Run(context.Background(), config, nil)
		if err != nil {
			t.Errorf("Run() error: %v", err)
			return
		}
		if got["status_code"] != 404 {
			t.Errorf("status_code = %v, want 404", got["status_code"])
		}
	})

	t.Run("body passthrough", func(t *testing.T) {
		body := map[string]any{"result": "data"}
		config := map[string]any{"body": body}
		got, err := r.Run(context.Background(), config, nil)
		if err != nil {
			t.Errorf("Run() error: %v", err)
			return
		}
		gotBody, ok := got["body"].(map[string]any)
		if !ok {
			t.Errorf("body is not a map: %T", got["body"])
			return
		}
		if gotBody["result"] != "data" {
			t.Errorf("body.result = %v, want data", gotBody["result"])
		}
	})

	t.Run("headers passthrough", func(t *testing.T) {
		headers := map[string]any{"Content-Type": "application/json"}
		config := map[string]any{"headers": headers}
		got, err := r.Run(context.Background(), config, nil)
		if err != nil {
			t.Errorf("Run() error: %v", err)
			return
		}
		gotHeaders, ok := got["headers"].(map[string]any)
		if !ok {
			t.Errorf("headers is not a map: %T", got["headers"])
			return
		}
		if gotHeaders["Content-Type"] != "application/json" {
			t.Errorf("headers.Content-Type = %v, want application/json", gotHeaders["Content-Type"])
		}
	})
}
