package testutil

import (
	"context"
	"net/http"
	"testing"

	"react-go-workflow/ent"
	"react-go-workflow/ent/enttest"

	"github.com/go-chi/chi/v5"
	_ "github.com/mattn/go-sqlite3"
)

// NewTestClient creates an ent client backed by an in-memory SQLite database.
// The schema is auto-migrated on creation.
func NewTestClient(t testing.TB) *ent.Client {
	return enttest.Open(t, "sqlite3", "file:ent?mode=memory&_fk=1")
}

// ChiContext injects chi URL params into the request context so that
// chi.URLParam works in handler tests without a real router.
func ChiContext(r *http.Request, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// Ctx returns a background context for use in test helpers.
func Ctx() context.Context {
	return context.Background()
}
