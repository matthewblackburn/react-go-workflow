package database

import (
	"database/sql"
	"net/http"

	"react-go-workflow/internal/shared"
)

type Handler struct {
	db *sql.DB
}

func NewHandler(db *sql.DB) *Handler {
	return &Handler{db: db}
}

// ListTables returns the names of all user tables in the public schema.
func (h *Handler) ListTables(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(),
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public'
		 AND table_type = 'BASE TABLE'
		 ORDER BY table_name`)
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			shared.WriteError(w, shared.ErrInternal)
			return
		}
		tables = append(tables, name)
	}

	shared.WriteJSON(w, http.StatusOK, map[string]any{"data": tables})
}
