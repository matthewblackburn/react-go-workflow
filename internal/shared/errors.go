package shared

import "net/http"

// APIError represents a structured error response.
// Clients can rely on the Code field for programmatic handling.
type APIError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

// Error implements the error interface.
func (e *APIError) Error() string {
	return e.Message
}

// WithDetails returns a copy of the error with additional detail fields.
func (e *APIError) WithDetails(details map[string]string) *APIError {
	return &APIError{
		Code:    e.Code,
		Message: e.Message,
		Details: details,
	}
}

// HTTPStatus maps an APIError to the appropriate HTTP status code.
func HTTPStatus(err error) int {
	if apiErr, ok := err.(*APIError); ok {
		switch apiErr.Code {
		case "NOT_FOUND", "WORKFLOW_NOT_FOUND", "STEP_NOT_FOUND", "STEP_TYPE_NOT_FOUND", "EDGE_NOT_FOUND", "EXECUTION_NOT_FOUND", "SECRET_NOT_FOUND":
			return http.StatusNotFound
		case "VALIDATION_ERROR", "INVALID_ID", "INVALID_CURSOR", "INVALID_FILTER", "CYCLE_DETECTED":
			return http.StatusBadRequest
		case "CONFLICT", "DUPLICATE_NAME", "DUPLICATE_SLUG", "DUPLICATE_KEY":
			return http.StatusConflict
		case "PRECONDITION_FAILED":
			return http.StatusPreconditionFailed
		case "UNAUTHORIZED":
			return http.StatusUnauthorized
		case "FORBIDDEN":
			return http.StatusForbidden
		case "EXECUTION_SKIPPED":
			return http.StatusConflict
		default:
			return http.StatusInternalServerError
		}
	}
	return http.StatusInternalServerError
}

// Common error codes.
var (
	ErrNotFound          = &APIError{Code: "NOT_FOUND", Message: "resource not found"}
	ErrInvalidID         = &APIError{Code: "INVALID_ID", Message: "invalid resource ID format"}
	ErrValidation        = &APIError{Code: "VALIDATION_ERROR", Message: "validation failed"}
	ErrUnauthorized      = &APIError{Code: "UNAUTHORIZED", Message: "authentication required"}
	ErrForbidden         = &APIError{Code: "FORBIDDEN", Message: "insufficient permissions"}
	ErrInternal          = &APIError{Code: "INTERNAL_ERROR", Message: "an internal error occurred"}
	ErrWorkflowNotFound  = &APIError{Code: "WORKFLOW_NOT_FOUND", Message: "workflow not found"}
	ErrStepNotFound      = &APIError{Code: "STEP_NOT_FOUND", Message: "step not found"}
	ErrStepTypeNotFound  = &APIError{Code: "STEP_TYPE_NOT_FOUND", Message: "step type not found"}
	ErrEdgeNotFound      = &APIError{Code: "EDGE_NOT_FOUND", Message: "edge not found"}
	ErrExecutionNotFound = &APIError{Code: "EXECUTION_NOT_FOUND", Message: "execution not found"}
	ErrDuplicateName     = &APIError{Code: "DUPLICATE_NAME", Message: "name already exists"}
	ErrDuplicateSlug     = &APIError{Code: "DUPLICATE_SLUG", Message: "webhook slug already exists"}
	ErrCycleDetected     = &APIError{Code: "CYCLE_DETECTED", Message: "workflow contains a cycle"}
	ErrExecutionSkipped  = &APIError{Code: "EXECUTION_SKIPPED", Message: "execution skipped due to concurrency policy"}
	ErrInvalidCursor     = &APIError{Code: "INVALID_CURSOR", Message: "invalid pagination cursor"}
	ErrInvalidFilter     = &APIError{Code: "INVALID_FILTER", Message: "invalid filter value"}
	ErrSecretNotFound    = &APIError{Code: "SECRET_NOT_FOUND", Message: "secret not found"}
	ErrDuplicateKey      = &APIError{Code: "DUPLICATE_KEY", Message: "a secret with this key already exists"}
)
