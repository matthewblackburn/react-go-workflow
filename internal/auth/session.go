package auth

import (
	"context"
	"net/http"

	"react-go-workflow/internal/middleware"

	"github.com/supertokens/supertokens-golang/recipe/session"
	"github.com/supertokens/supertokens-golang/recipe/session/sessmodels"
)

// RequireSession returns Chi-compatible middleware that verifies Supertokens
// sessions and injects an AuthContext for backward compatibility with existing handlers.
//
//	Request → VerifySession (JWT check, local) → AuthContext{UserID} → Handler
func RequireSession() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session.VerifySession(nil, func(w http.ResponseWriter, r *http.Request) {
				sess := session.GetSessionFromRequestContext(r.Context())
				if sess == nil {
					w.WriteHeader(http.StatusUnauthorized)
					return
				}

				userID := sess.GetUserID()
				authCtx := middleware.AuthContext{
					UserID: userID,
					Roles:  []string{"user"},
				}

				ctx := context.WithValue(r.Context(), middleware.AuthContextKey(), authCtx)
				next.ServeHTTP(w, r.WithContext(ctx))
			}).ServeHTTP(w, r)
		})
	}
}

// OptionalSession extracts session if present but doesn't require it.
func OptionalSession() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sessionRequired := false
			session.VerifySession(&sessmodels.VerifySessionOptions{
				SessionRequired: &sessionRequired,
			}, func(w http.ResponseWriter, r *http.Request) {
				sess := session.GetSessionFromRequestContext(r.Context())
				if sess != nil {
					userID := sess.GetUserID()
					authCtx := middleware.AuthContext{
						UserID: userID,
						Roles:  []string{"user"},
					}
					ctx := context.WithValue(r.Context(), middleware.AuthContextKey(), authCtx)
					r = r.WithContext(ctx)
				}
				next.ServeHTTP(w, r)
			}).ServeHTTP(w, r)
		})
	}
}
