package trigger

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// helper to create a request with chi URL params
func newRequestWithChiParam(method, path, paramName, paramValue string, body string) *http.Request {
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(paramName, paramValue)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	return req
}

func TestManualHandler_InvalidID(t *testing.T) {
	h := NewManualHandler(nil) // executor is nil — we expect to fail before reaching it

	req := newRequestWithChiParam("POST", "/execute/not-a-uuid", "id", "not-a-uuid", "")
	w := httptest.NewRecorder()

	h.Execute(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["code"] != "INVALID_ID" {
		t.Errorf("expected error code INVALID_ID, got %v", resp["code"])
	}
}

func TestManualHandler_MissingBodyAccepted(t *testing.T) {
	// With a valid UUID but nil executor, the handler will parse the UUID successfully
	// and then panic or fail when calling executor.Execute.
	// This test verifies that the body parsing step does NOT produce an error —
	// the handler accepts a missing/empty body.
	//
	// We cannot fully test the success path without a real executor, so we just
	// verify we get past the ID validation and body decode steps.
	// The executor.Execute call will panic since executor is nil.
	// We use recover to confirm we got past validation.

	h := NewManualHandler(nil)

	validUUID := "550e8400-e29b-41d4-a716-446655440000"
	req := newRequestWithChiParam("POST", "/execute/"+validUUID, "id", validUUID, "")
	w := httptest.NewRecorder()

	func() {
		defer func() {
			r := recover()
			if r == nil {
				// No panic means executor was somehow not nil or something unexpected
				// Check if we got an error response instead
				if w.Code == http.StatusBadRequest {
					t.Error("got 400 — body parsing should not fail on empty body")
				}
			}
			// A panic here is expected because executor is nil.
			// The important thing is we did NOT get a 400 from body validation.
		}()
		h.Execute(w, req)
	}()

	// If we reached here without a 400, body parsing was fine
	if w.Code == http.StatusBadRequest {
		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		t.Errorf("unexpected 400 response: %v", resp)
	}
}
