package runners

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHTTPRequest_MissingURL(t *testing.T) {
	r := &HTTPRequestRunner{}
	_, err := r.Run(context.Background(), map[string]any{}, nil)
	if err == nil {
		t.Errorf("expected error for missing URL")
	}
}

func TestHTTPRequest_GETReturnsJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer srv.Close()

	r := &HTTPRequestRunner{}
	out, err := r.Run(context.Background(), map[string]any{
		"url":    srv.URL,
		"method": "GET",
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if out["status"] != 200 {
		t.Errorf("status = %v, want 200", out["status"])
	}
	body, ok := out["body"].(map[string]any)
	if !ok {
		t.Errorf("body is not map[string]any: %T", out["body"])
		return
	}
	if body["ok"] != true {
		t.Errorf("body[ok] = %v, want true", body["ok"])
	}
}

func TestHTTPRequest_POSTWithBody(t *testing.T) {
	var receivedMethod string
	var receivedBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		b := make([]byte, 1024)
		n, _ := r.Body.Read(b)
		receivedBody = string(b[:n])
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"received":true}`)
	}))
	defer srv.Close()

	runner := &HTTPRequestRunner{}
	out, err := runner.Run(context.Background(), map[string]any{
		"url":    srv.URL,
		"method": "POST",
		"body":   `{"key":"value"}`,
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if receivedMethod != "POST" {
		t.Errorf("method = %q, want POST", receivedMethod)
	}
	if receivedBody != `{"key":"value"}` {
		t.Errorf("body = %q, want {\"key\":\"value\"}", receivedBody)
	}
	if out["status"] != 200 {
		t.Errorf("status = %v, want 200", out["status"])
	}
}

func TestHTTPRequest_CustomHeaders(t *testing.T) {
	var gotHeader string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("X-Custom")
		fmt.Fprint(w, `{}`)
	}))
	defer srv.Close()

	runner := &HTTPRequestRunner{}
	_, err := runner.Run(context.Background(), map[string]any{
		"url": srv.URL,
		"headers": map[string]any{
			"X-Custom": "my-value",
		},
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if gotHeader != "my-value" {
		t.Errorf("X-Custom header = %q, want %q", gotHeader, "my-value")
	}
}

func TestHTTPRequest_BearerAuth(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		fmt.Fprint(w, `{}`)
	}))
	defer srv.Close()

	runner := &HTTPRequestRunner{}
	_, err := runner.Run(context.Background(), map[string]any{
		"url":        srv.URL,
		"auth_type":  "bearer",
		"auth_value": "tok123",
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if gotAuth != "Bearer tok123" {
		t.Errorf("Authorization = %q, want %q", gotAuth, "Bearer tok123")
	}
}

func TestHTTPRequest_BasicAuth(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		fmt.Fprint(w, `{}`)
	}))
	defer srv.Close()

	runner := &HTTPRequestRunner{}
	_, err := runner.Run(context.Background(), map[string]any{
		"url":        srv.URL,
		"auth_type":  "basic",
		"auth_value": "dXNlcjpwYXNz",
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if gotAuth != "Basic dXNlcjpwYXNz" {
		t.Errorf("Authorization = %q, want %q", gotAuth, "Basic dXNlcjpwYXNz")
	}
}

func TestHTTPRequest_NonJSONResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, "hello plain text")
	}))
	defer srv.Close()

	runner := &HTTPRequestRunner{}
	out, err := runner.Run(context.Background(), map[string]any{
		"url": srv.URL,
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	body, ok := out["body"].(string)
	if !ok {
		t.Errorf("body should be string for non-JSON response, got %T", out["body"])
		return
	}
	if body != "hello plain text" {
		t.Errorf("body = %q, want %q", body, "hello plain text")
	}
}

func TestHTTPRequest_DefaultMethodIsGET(t *testing.T) {
	var gotMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		fmt.Fprint(w, `{}`)
	}))
	defer srv.Close()

	runner := &HTTPRequestRunner{}
	_, err := runner.Run(context.Background(), map[string]any{
		"url": srv.URL,
	}, nil)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
		return
	}
	if gotMethod != "GET" {
		t.Errorf("default method = %q, want GET", gotMethod)
	}
}
