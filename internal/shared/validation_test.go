package shared

import (
	"testing"
)

func TestFieldErrors_AddAndRetrieve(t *testing.T) {
	errs := FieldErrors{}
	errs.Add("name", "is required")
	if errs["name"] != "is required" {
		t.Errorf("errs[name] = %q, want %q", errs["name"], "is required")
	}
}

func TestFieldErrors_ErrNilWhenEmpty(t *testing.T) {
	errs := FieldErrors{}
	if errs.Err() != nil {
		t.Error("Err() should return nil when empty")
	}
}

func TestFieldErrors_ErrReturnsAPIError(t *testing.T) {
	errs := FieldErrors{}
	errs.Add("name", "is required")
	err := errs.Err()
	if err == nil {
		t.Fatal("Err() should return non-nil when non-empty")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("Err() returned %T, want *APIError", err)
	}
	if apiErr.Code != "VALIDATION_ERROR" {
		t.Errorf("Code = %q, want VALIDATION_ERROR", apiErr.Code)
	}
	if apiErr.Details["name"] != "is required" {
		t.Errorf("Details[name] = %q, want %q", apiErr.Details["name"], "is required")
	}
}

func TestValidateRequired(t *testing.T) {
	errs := FieldErrors{}
	ValidateRequired(errs, "name", "")
	if errs["name"] != "this field is required" {
		t.Errorf("errs[name] = %q, want 'this field is required'", errs["name"])
	}

	errs2 := FieldErrors{}
	ValidateRequired(errs2, "name", "hello")
	if len(errs2) != 0 {
		t.Errorf("expected no errors for non-empty value, got %v", errs2)
	}
}

func TestValidateMaxLen(t *testing.T) {
	errs := FieldErrors{}
	ValidateMaxLen(errs, "name", "abcdef", 3)
	if errs["name"] == "" {
		t.Error("expected error for value exceeding max length")
	}

	errs2 := FieldErrors{}
	ValidateMaxLen(errs2, "name", "abc", 3)
	if len(errs2) != 0 {
		t.Errorf("expected no errors for value within max length, got %v", errs2)
	}
}
