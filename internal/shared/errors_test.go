package shared

import (
	"net/http"
	"testing"
)

func TestHTTPStatus_NotFound(t *testing.T) {
	codes := []string{"NOT_FOUND", "WORKFLOW_NOT_FOUND", "STEP_NOT_FOUND", "STEP_TYPE_NOT_FOUND", "EDGE_NOT_FOUND", "EXECUTION_NOT_FOUND", "SECRET_NOT_FOUND"}
	for _, code := range codes {
		err := &APIError{Code: code, Message: "test"}
		got := HTTPStatus(err)
		if got != http.StatusNotFound {
			t.Errorf("HTTPStatus(%q) = %d, want %d", code, got, http.StatusNotFound)
		}
	}
}

func TestHTTPStatus_BadRequest(t *testing.T) {
	codes := []string{"VALIDATION_ERROR", "INVALID_ID", "INVALID_CURSOR", "INVALID_FILTER", "CYCLE_DETECTED"}
	for _, code := range codes {
		err := &APIError{Code: code, Message: "test"}
		got := HTTPStatus(err)
		if got != http.StatusBadRequest {
			t.Errorf("HTTPStatus(%q) = %d, want %d", code, got, http.StatusBadRequest)
		}
	}
}

func TestHTTPStatus_Conflict(t *testing.T) {
	codes := []string{"CONFLICT", "DUPLICATE_NAME", "DUPLICATE_SLUG", "DUPLICATE_KEY"}
	for _, code := range codes {
		err := &APIError{Code: code, Message: "test"}
		got := HTTPStatus(err)
		if got != http.StatusConflict {
			t.Errorf("HTTPStatus(%q) = %d, want %d", code, got, http.StatusConflict)
		}
	}
}

func TestHTTPStatus_UnknownCode(t *testing.T) {
	err := &APIError{Code: "SOMETHING_UNKNOWN", Message: "test"}
	got := HTTPStatus(err)
	if got != http.StatusInternalServerError {
		t.Errorf("HTTPStatus(unknown) = %d, want %d", got, http.StatusInternalServerError)
	}
}

func TestWithDetails_CopySemantics(t *testing.T) {
	original := &APIError{Code: "NOT_FOUND", Message: "resource not found"}
	details := map[string]string{"id": "123"}
	copy := original.WithDetails(details)

	if copy == original {
		t.Error("WithDetails should return a new pointer")
	}
	if copy.Code != original.Code {
		t.Errorf("Code = %q, want %q", copy.Code, original.Code)
	}
	if copy.Message != original.Message {
		t.Errorf("Message = %q, want %q", copy.Message, original.Message)
	}
	if copy.Details["id"] != "123" {
		t.Errorf("Details[id] = %q, want %q", copy.Details["id"], "123")
	}
	if original.Details != nil {
		t.Error("original Details should remain nil")
	}
}

func TestAPIError_ErrorReturnsMessage(t *testing.T) {
	err := &APIError{Code: "TEST", Message: "something went wrong"}
	if err.Error() != "something went wrong" {
		t.Errorf("Error() = %q, want %q", err.Error(), "something went wrong")
	}
}
