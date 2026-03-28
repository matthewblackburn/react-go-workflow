package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"react-go-workflow/internal/shared"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const authCtxKey contextKey = "auth_context"

// AuthContextKey returns the context key for AuthContext (used by auth package).
func AuthContextKey() contextKey {
	return authCtxKey
}

// AuthContext holds the authenticated user's identity and permissions.
type AuthContext struct {
	UserID string
	Roles  []string
}

// HasPermission checks if the user has a specific permission.
func (a AuthContext) HasPermission(permission string) bool {
	for _, role := range a.Roles {
		if role == permission || role == "admin" {
			return true
		}
	}
	return false
}

// AuthFromContext retrieves the AuthContext from the request context.
func AuthFromContext(ctx context.Context) AuthContext {
	if auth, ok := ctx.Value(authCtxKey).(AuthContext); ok {
		return auth
	}
	return AuthContext{}
}

// JWTConfig holds the configuration for JWT validation.
type JWTConfig struct {
	Secret string
}

// RequireAuth returns middleware that validates JWTs and injects AuthContext.
func RequireAuth(cfg JWTConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				shared.WriteJSON(w, http.StatusUnauthorized, shared.ErrUnauthorized)
				return
			}

			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				shared.WriteJSON(w, http.StatusUnauthorized, shared.ErrUnauthorized)
				return
			}

			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(cfg.Secret), nil
			})
			if err != nil || !token.Valid {
				shared.WriteJSON(w, http.StatusUnauthorized, shared.ErrUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				shared.WriteJSON(w, http.StatusUnauthorized, shared.ErrUnauthorized)
				return
			}

			userID, ok := getStringClaim(claims, "sub")
			if !ok {
				shared.WriteJSON(w, http.StatusUnauthorized, shared.ErrUnauthorized)
				return
			}

			roles := getStringSliceClaim(claims, "roles")

			authCtx := AuthContext{
				UserID: userID,
				Roles:  roles,
			}

			ctx := context.WithValue(r.Context(), authCtxKey, authCtx)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequirePermission returns middleware that checks for a specific permission.
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := AuthFromContext(r.Context())
			if !auth.HasPermission(permission) {
				shared.WriteJSON(w, http.StatusForbidden, shared.ErrForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func getStringClaim(claims jwt.MapClaims, key string) (string, bool) {
	val, ok := claims[key]
	if !ok {
		return "", false
	}
	switch v := val.(type) {
	case string:
		return v, true
	case float64:
		return fmt.Sprintf("%d", int(v)), true
	default:
		return fmt.Sprintf("%v", v), true
	}
}

func getStringSliceClaim(claims jwt.MapClaims, key string) []string {
	val, ok := claims[key]
	if !ok {
		return nil
	}
	switch v := val.(type) {
	case []any:
		result := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
		return result
	case []string:
		return v
	default:
		return nil
	}
}
