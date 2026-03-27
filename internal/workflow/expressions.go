package workflow

import (
	"net/http"

	"react-go-workflow/ent"
	"react-go-workflow/internal/shared"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ExpressionVariable represents a variable available for expression autocomplete.
type ExpressionVariable struct {
	Path        string `json:"path"`
	Description string `json:"description"`
	Type        string `json:"type,omitempty"`
}

// ExpressionsResponse is the response for the expressions endpoint.
type ExpressionsResponse struct {
	Variables []ExpressionVariable `json:"variables"`
}

// Expressions returns all available expression variables for a workflow.
// Used by the frontend for autocomplete when the user types {{.
func (h *Handler) Expressions(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	wf, err := h.service.GetFull(r.Context(), id)
	if err != nil {
		if ent.IsNotFound(err) {
			shared.WriteError(w, shared.ErrWorkflowNotFound)
			return
		}
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	var variables []ExpressionVariable

	// Workflow input
	variables = append(variables, ExpressionVariable{
		Path:        "workflow.input",
		Description: "The input data passed when this workflow starts",
		Type:        "object",
	})

	// Each step's output
	for _, step := range wf.Edges.Steps {
		basePath := "steps." + step.Name + ".output"
		variables = append(variables, ExpressionVariable{
			Path:        basePath,
			Description: "Output from \"" + step.Name + "\"",
			Type:        "object",
		})

		// If the step type has an output schema, enumerate its fields
		if step.Edges.StepType != nil && step.Edges.StepType.OutputSchema != nil {
			schema := step.Edges.StepType.OutputSchema
			if props, ok := schema["properties"].(map[string]any); ok {
				for fieldName, fieldDef := range props {
					desc := ""
					fieldType := "any"
					if fd, ok := fieldDef.(map[string]any); ok {
						if d, ok := fd["description"].(string); ok {
							desc = d
						}
						if t, ok := fd["type"].(string); ok {
							fieldType = t
						}
					}
					variables = append(variables, ExpressionVariable{
						Path:        basePath + "." + fieldName,
						Description: desc,
						Type:        fieldType,
					})
				}
			}
		}
	}

	// Secrets placeholder
	variables = append(variables, ExpressionVariable{
		Path:        "secrets.*",
		Description: "Reference a stored secret by name, e.g. secrets.API_KEY",
		Type:        "string",
	})

	// Env placeholder
	variables = append(variables, ExpressionVariable{
		Path:        "env.*",
		Description: "Reference an environment variable, e.g. env.APP_URL",
		Type:        "string",
	})

	shared.WriteJSON(w, http.StatusOK, ExpressionsResponse{Variables: variables})
}
