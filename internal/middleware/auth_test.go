package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"react-go-workflow/internal/shared"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-key-for-testing"

func makeToken(t *testing.T, secret string, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	return signed
}

func makeAuthMiddleware() func(http.Handler) http.Handler {
	return RequireAuth(JWTConfig{Secret: testSecret})
}

func TestRequireAuth_ValidToken(t *testing.T) {
	tokenStr := makeToken(t, testSecret, jwt.MapClaims{
		"sub":   float64(42),
		"roles": []any{"admin", "editor"},
		"exp":   float64(time.Now().Add(time.Hour).Unix()),
	})

	var calledWith AuthContext
	handler := makeAuthMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calledWith = AuthFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer "+tokenStr)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if calledWith.UserID != "42" {
		t.Errorf("UserID = %s, want 42", calledWith.UserID)
	}
	if len(calledWith.Roles) != 2 || calledWith.Roles[0] != "admin" {
		t.Errorf("Roles = %v, want [admin editor]", calledWith.Roles)
	}
}

func TestRequireAuth_ExpiredToken(t *testing.T) {
	tokenStr := makeToken(t, testSecret, jwt.MapClaims{
		"sub": float64(1),
		"exp": float64(time.Now().Add(-time.Hour).Unix()),
	})

	handler := makeAuthMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called for expired token")
	}))

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer "+tokenStr)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuth_MissingHeader(t *testing.T) {
	handler := makeAuthMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called without auth header")
	}))

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	var got shared.APIError
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if got.Code != "UNAUTHORIZED" {
		t.Errorf("code = %q, want UNAUTHORIZED", got.Code)
	}
}

func TestRequireAuth_MalformedHeader(t *testing.T) {
	handler := makeAuthMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with malformed header")
	}))

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "NotBearer some-token")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuth_WrongSecret(t *testing.T) {
	tokenStr := makeToken(t, "wrong-secret", jwt.MapClaims{
		"sub": float64(1),
		"exp": float64(time.Now().Add(time.Hour).Unix()),
	})

	handler := makeAuthMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with wrong secret")
	}))

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer "+tokenStr)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}
