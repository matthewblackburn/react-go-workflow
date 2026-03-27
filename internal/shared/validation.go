package shared

// FieldErrors collects field-level validation errors.
type FieldErrors map[string]string

// Add records a validation error for a field.
func (fe FieldErrors) Add(field, message string) {
	fe[field] = message
}

// Err returns an *APIError if there are any errors, or nil.
func (fe FieldErrors) Err() error {
	if len(fe) == 0 {
		return nil
	}
	return ErrValidation.WithDetails(fe)
}

// ValidateRequired checks that a string value is non-empty.
func ValidateRequired(errs FieldErrors, field, value string) {
	if value == "" {
		errs.Add(field, "this field is required")
	}
}

// ValidateMaxLen checks that a string value does not exceed max characters.
func ValidateMaxLen(errs FieldErrors, field, value string, max int) {
	if len(value) > max {
		errs.Add(field, "must be at most "+itoa(max)+" characters")
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := [20]byte{}
	pos := len(buf)
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[pos:])
}
