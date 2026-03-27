package runners

import (
	"context"
	"testing"
)

func TestDatabaseQuery_MissingConnectionString(t *testing.T) {
	r := &DatabaseQueryRunner{}
	_, err := r.Run(context.Background(), map[string]any{
		"query": "SELECT 1",
	}, nil)
	if err == nil {
		t.Errorf("expected error for missing connection_string")
	}
}

func TestDatabaseQuery_MissingQuery(t *testing.T) {
	r := &DatabaseQueryRunner{}
	_, err := r.Run(context.Background(), map[string]any{
		"connection_string": "postgres://localhost/db",
	}, nil)
	if err == nil {
		t.Errorf("expected error for missing query")
	}
}
