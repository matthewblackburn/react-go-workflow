package shared

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

// WriteJSON writes a JSON response.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

// WriteError writes a structured error response using the APIError format.
func WriteError(w http.ResponseWriter, err error) {
	if apiErr, ok := err.(*APIError); ok {
		WriteJSON(w, HTTPStatus(apiErr), apiErr)
		return
	}

	slog.Error("unhandled error", "error", err)
	WriteJSON(w, http.StatusInternalServerError, ErrInternal)
}

// WriteValidationError writes a structured validation error response.
func WriteValidationError(w http.ResponseWriter, err error) {
	details := make(map[string]string)

	if validationErrs, ok := err.(validator.ValidationErrors); ok {
		for _, fe := range validationErrs {
			field := toSnakeCase(fe.Field())
			details[field] = validationMessage(fe)
		}
	} else {
		details["error"] = err.Error()
	}

	WriteJSON(w, http.StatusBadRequest, &APIError{
		Code:    "VALIDATION_ERROR",
		Message: "validation failed",
		Details: details,
	})
}

// DecodeAndValidate decodes a JSON request body and validates it.
func DecodeAndValidate(r *http.Request, dst any) error {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	if err := validate.Struct(dst); err != nil {
		return err
	}
	return nil
}

// QueryInt reads an integer query parameter with a default value.
func QueryInt(r *http.Request, key string, defaultVal int) int {
	s := r.URL.Query().Get(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return defaultVal
	}
	return v
}

// QueryString reads a string query parameter, returning nil if absent.
func QueryString(r *http.Request, key string) *string {
	s := r.URL.Query().Get(key)
	if s == "" {
		return nil
	}
	return &s
}

// QueryBool reads a boolean query parameter.
func QueryBool(r *http.Request, key string) bool {
	s := r.URL.Query().Get(key)
	return s == "true" || s == "1"
}

func toSnakeCase(s string) string {
	var result strings.Builder
	for i, r := range s {
		if r >= 'A' && r <= 'Z' {
			if i > 0 {
				result.WriteByte('_')
			}
			result.WriteRune(r + 32)
		} else {
			result.WriteRune(r)
		}
	}
	return result.String()
}

func validationMessage(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "this field is required"
	case "uuid":
		return "must be a valid UUID"
	case "max":
		return fmt.Sprintf("must be at most %s", fe.Param())
	case "min":
		return fmt.Sprintf("must be at least %s", fe.Param())
	case "gt":
		return fmt.Sprintf("must be greater than %s", fe.Param())
	case "oneof":
		return fmt.Sprintf("must be one of: %s", fe.Param())
	case "email":
		return "must be a valid email address"
	case "url":
		return "must be a valid URL"
	default:
		return fmt.Sprintf("failed validation: %s", fe.Tag())
	}
}
