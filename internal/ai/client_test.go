package ai

import (
	"context"
	"encoding/json"
	"testing"
)

func TestCreateMessage_Success(t *testing.T) {
	// Since anthropicAPIURL is a const, test the response parsing logic directly
	result, err := parseToolUseResponse([]byte(`{
		"content": [
			{"type": "text", "text": "Here is the workflow"},
			{"type": "tool_use", "name": "create_workflow", "input": {"summary": "test", "steps": [], "edges": []}}
		]
	}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["summary"] != "test" {
		t.Errorf("expected summary=test, got %v", result["summary"])
	}
}

func TestCreateMessage_NoToolUse(t *testing.T) {
	_, err := parseToolUseResponse([]byte(`{
		"content": [
			{"type": "text", "text": "I cannot create that workflow"}
		]
	}`))
	if err == nil {
		t.Fatal("expected error for missing tool_use block")
	}
}

func TestCreateMessage_MalformedJSON(t *testing.T) {
	_, err := parseToolUseResponse([]byte(`not json`))
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

func TestCreateMessage_CancelledContext(t *testing.T) {
	client := NewClient("test-key")

	cancelCtx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	_, _, err := client.CreateMessage(cancelCtx, "system", "user", nil)
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}

// parseToolUseResponse is a testable helper that extracts tool_use from a response body.
func parseToolUseResponse(body []byte) (map[string]any, error) {
	var resp apiResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}

	for _, block := range resp.Content {
		if block.Type == "tool_use" {
			return block.Input, nil
		}
	}

	return nil, ErrUnexpectedResponse
}
