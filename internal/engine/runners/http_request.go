package runners

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type HTTPRequestRunner struct{}

func (r *HTTPRequestRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	url, _ := config["url"].(string)
	method, _ := config["method"].(string)
	if url == "" {
		return nil, fmt.Errorf("url is required")
	}
	if method == "" {
		method = "GET"
	}

	// Build request body
	var bodyReader io.Reader
	if body, ok := config["body"].(string); ok && body != "" {
		bodyReader = strings.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	// Set headers
	if headers, ok := config["headers"].(map[string]any); ok {
		for k, v := range headers {
			req.Header.Set(k, fmt.Sprintf("%v", v))
		}
	}

	if req.Header.Get("Content-Type") == "" && bodyReader != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	// Execute
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	// Parse body as JSON if possible
	var parsedBody any
	if err := json.Unmarshal(respBody, &parsedBody); err != nil {
		parsedBody = string(respBody)
	}

	// Collect response headers
	respHeaders := make(map[string]any)
	for k, v := range resp.Header {
		if len(v) == 1 {
			respHeaders[k] = v[0]
		} else {
			respHeaders[k] = v
		}
	}

	_ = bytes.NewReader(nil) // satisfy import

	return map[string]any{
		"status":  resp.StatusCode,
		"headers": respHeaders,
		"body":    parsedBody,
	}, nil
}
