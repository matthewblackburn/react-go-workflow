package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	anthropicAPIURL = "https://api.anthropic.com/v1/messages"
	anthropicModel  = "claude-sonnet-4-20250514"
	clientTimeout   = 55 * time.Second
)

var (
	ErrTimeout           = errors.New("ai service timeout")
	ErrServiceUnavailable = errors.New("ai service unavailable")
	ErrUnexpectedResponse = errors.New("unexpected ai response")
)

// Client is a thin HTTP client for the Anthropic Messages API.
type Client struct {
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new Anthropic API client.
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: clientTimeout,
		},
	}
}

// Message represents a message in the conversation.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Tool represents a tool definition for structured output.
type Tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

type apiRequest struct {
	Model      string         `json:"model"`
	MaxTokens  int            `json:"max_tokens"`
	System     string         `json:"system,omitempty"`
	Messages   []Message      `json:"messages"`
	Tools      []Tool         `json:"tools,omitempty"`
	ToolChoice map[string]any `json:"tool_choice,omitempty"`
}

type apiResponse struct {
	Content []contentBlock `json:"content"`
	Error   *apiError      `json:"error,omitempty"`
}

type contentBlock struct {
	Type  string         `json:"type"`
	Name  string         `json:"name,omitempty"`
	Input map[string]any `json:"input,omitempty"`
}

type apiError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// CreateMessage sends a message to the Claude API and returns the tool_use result.
// It expects the model to respond with a tool call matching the provided tool.
func (c *Client) CreateMessage(ctx context.Context, systemPrompt string, userMessage string, tools []Tool) (map[string]any, error) {
	reqBody := apiRequest{
		Model:     anthropicModel,
		MaxTokens: 4096,
		System:    systemPrompt,
		Messages: []Message{
			{Role: "user", Content: userMessage},
		},
		Tools: tools,
	}

	// Force tool use when tools are provided
	if len(tools) > 0 {
		reqBody.ToolChoice = map[string]any{"type": "any"}
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicAPIURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded) {
			return nil, ErrTimeout
		}
		return nil, fmt.Errorf("%w: %v", ErrServiceUnavailable, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: failed to read response", ErrServiceUnavailable)
	}

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == 529 {
			return nil, fmt.Errorf("%w: Claude is temporarily overloaded, please try again in a moment", ErrServiceUnavailable)
		}
		if resp.StatusCode == 429 {
			return nil, fmt.Errorf("%w: rate limit exceeded, please wait a moment and try again", ErrServiceUnavailable)
		}
		return nil, fmt.Errorf("%w: status %d: %s", ErrServiceUnavailable, resp.StatusCode, string(respBody))
	}

	var apiResp apiResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("%w: failed to parse response", ErrUnexpectedResponse)
	}

	// Extract the tool_use content block
	for _, block := range apiResp.Content {
		if block.Type == "tool_use" {
			return block.Input, nil
		}
	}

	return nil, fmt.Errorf("%w: no tool_use block in response", ErrUnexpectedResponse)
}
