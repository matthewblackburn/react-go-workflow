package shared

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWriteJSON_ContentTypeAndStatus(t *testing.T) {
	w := httptest.NewRecorder()
	WriteJSON(w, http.StatusCreated, map[string]string{"id": "123"})

	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want %d", w.Code, http.StatusCreated)
	}
}

func TestWriteJSON_Body(t *testing.T) {
	w := httptest.NewRecorder()
	WriteJSON(w, http.StatusOK, map[string]string{"name": "test"})

	var got map[string]string
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if got["name"] != "test" {
		t.Errorf("body name = %q, want %q", got["name"], "test")
	}
}

func TestWriteError_APIError(t *testing.T) {
	w := httptest.NewRecorder()
	WriteError(w, ErrNotFound)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
	var got APIError
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if got.Code != "NOT_FOUND" {
		t.Errorf("code = %q, want NOT_FOUND", got.Code)
	}
}

func TestWriteError_GenericError(t *testing.T) {
	w := httptest.NewRecorder()
	WriteError(w, errors.New("something broke"))

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
	var got APIError
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if got.Code != "INTERNAL_ERROR" {
		t.Errorf("code = %q, want INTERNAL_ERROR", got.Code)
	}
}

func TestWriteValidationError_ValidatorErrors(t *testing.T) {
	type input struct {
		Name string `validate:"required"`
	}
	err := validate.Struct(input{})
	if err == nil {
		t.Fatal("expected validation error")
	}

	w := httptest.NewRecorder()
	WriteValidationError(w, err)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	var got APIError
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if got.Code != "VALIDATION_ERROR" {
		t.Errorf("code = %q, want VALIDATION_ERROR", got.Code)
	}
	if got.Details["name"] != "this field is required" {
		t.Errorf("details[name] = %q, want 'this field is required'", got.Details["name"])
	}
}

func TestWriteValidationError_PlainError(t *testing.T) {
	w := httptest.NewRecorder()
	WriteValidationError(w, errors.New("bad input"))

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	var got APIError
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if got.Details["error"] != "bad input" {
		t.Errorf("details[error] = %q, want 'bad input'", got.Details["error"])
	}
}

func TestDecodeAndValidate_Valid(t *testing.T) {
	type input struct {
		Name string `json:"name" validate:"required"`
	}
	body := strings.NewReader(`{"name":"test"}`)
	r := httptest.NewRequest(http.MethodPost, "/", body)
	var dst input
	if err := DecodeAndValidate(r, &dst); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dst.Name != "test" {
		t.Errorf("Name = %q, want %q", dst.Name, "test")
	}
}

func TestDecodeAndValidate_InvalidJSON(t *testing.T) {
	body := strings.NewReader(`{invalid}`)
	r := httptest.NewRequest(http.MethodPost, "/", body)
	var dst struct {
		Name string `json:"name"`
	}
	err := DecodeAndValidate(r, &dst)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
	if !strings.Contains(err.Error(), "invalid JSON") {
		t.Errorf("error = %q, want it to contain 'invalid JSON'", err.Error())
	}
}

func TestDecodeAndValidate_ValidationFail(t *testing.T) {
	type input struct {
		Name string `json:"name" validate:"required"`
	}
	body := strings.NewReader(`{"name":""}`)
	r := httptest.NewRequest(http.MethodPost, "/", body)
	var dst input
	err := DecodeAndValidate(r, &dst)
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestQueryInt_Default(t *testing.T) {
	r := makeRequest(nil)
	got := QueryInt(r, "page", 5)
	if got != 5 {
		t.Errorf("QueryInt = %d, want 5", got)
	}
}

func TestQueryInt_Parsed(t *testing.T) {
	r := makeRequest(map[string]string{"page": "3"})
	got := QueryInt(r, "page", 5)
	if got != 3 {
		t.Errorf("QueryInt = %d, want 3", got)
	}
}

func TestQueryBool_TrueValues(t *testing.T) {
	for _, val := range []string{"true", "1"} {
		r := makeRequest(map[string]string{"active": val})
		if !QueryBool(r, "active") {
			t.Errorf("QueryBool(%q) = false, want true", val)
		}
	}
}

func TestQueryBool_FalseValues(t *testing.T) {
	for _, val := range []string{"false", "0", "", "yes"} {
		r := makeRequest(map[string]string{"active": val})
		if val == "" {
			r = makeRequest(nil)
		}
		if QueryBool(r, "active") {
			t.Errorf("QueryBool(%q) = true, want false", val)
		}
	}
}
