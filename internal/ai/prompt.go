package ai

import (
	"encoding/json"
	"fmt"
	"strings"

	"react-go-workflow/ent"
)

// BuildSystemPrompt creates the system prompt with a catalog of available step types.
func BuildSystemPrompt(stepTypes []*ent.StepType, secretKeys []string) string {
	var b strings.Builder

	b.WriteString(`You are a workflow builder assistant. You create automated workflows from natural language descriptions.

You have access to the following step types. Use ONLY these types — do not invent new ones.

## Available Step Types

`)

	for _, st := range stepTypes {
		fmt.Fprintf(&b, "### %s (%s) — category: %s\n", st.DisplayName, st.Name, st.Category)
		fmt.Fprintf(&b, "%s\n", st.Description)

		if st.ConfigSchema != nil {
			if props, ok := st.ConfigSchema["properties"].(map[string]any); ok {
				b.WriteString("Config fields:\n")
				for fieldName, fieldDef := range props {
					if fd, ok := fieldDef.(map[string]any); ok {
						desc := ""
						if d, ok := fd["description"].(string); ok {
							desc = " — " + d
						}
						ftype := "string"
						if t, ok := fd["type"].(string); ok {
							ftype = t
						}
						fmt.Fprintf(&b, "  - %s (%s)%s\n", fieldName, ftype, desc)
						if enumVals, ok := fd["enum"]; ok {
							raw, _ := json.Marshal(enumVals)
							fmt.Fprintf(&b, "    enum: %s\n", string(raw))
						}
					}
				}
			}
			// Document condition step outputs
			if outputs, ok := st.ConfigSchema["outputs"]; ok {
				raw, _ := json.Marshal(outputs)
				fmt.Fprintf(&b, "Outputs (branches): %s\n", string(raw))
			}
		}

		if st.OutputSchema != nil {
			raw, _ := json.Marshal(st.OutputSchema)
			fmt.Fprintf(&b, "Output schema: %s\n", string(raw))
		}

		b.WriteString("\n")
	}

	if len(secretKeys) > 0 {
		b.WriteString("## Available Secrets\n\n")
		b.WriteString("The following secrets are configured and can be referenced with {{secrets.<key>}}:\n")
		for _, key := range secretKeys {
			fmt.Fprintf(&b, "- %s\n", key)
		}
		b.WriteString("\nOnly use secrets from this list. Do NOT reference secrets that don't exist.\n\n")
	} else {
		b.WriteString("## Secrets\n\nNo secrets are currently configured. Do NOT use {{secrets.<key>}} references. If authentication is needed, use placeholder values and instruct the user to configure them.\n\n")
	}

	b.WriteString(`## Expression Syntax

Steps can reference data from previous steps using template expressions:
- {{steps.<step_name>.output.<field>}} — reference a field from a previous step's output
- {{steps.<step_name>.output.body.<field>}} — reference a nested field (common for HTTP responses)
- {{secrets.<key>}} — reference a stored secret (e.g. {{secrets.API_KEY}})
- {{workflow.input.<field>}} — reference workflow input data (requires the field to be declared in input_schema)

When using {{workflow.input.<field>}} references, you MUST also include an input_schema that declares those fields. The input_schema is a JSON Schema object describing the expected input.

Examples:
- {{steps.fetch_users.output.body}} — the full response body from a step named "fetch_users"
- {{steps.fetch_users.output.status}} — the HTTP status code
- {{steps.check_status.output.result}} — boolean result from a condition step

## Rules

1. Use descriptive step names in snake_case (e.g. "fetch_orders", "check_status", "send_notification").
2. Wire data between steps using the expression syntax above. Reference steps by their name.
3. For condition steps, create edges with source_output "true" or "false" to indicate which branch.
4. Only use step types from the catalog above.
5. Create a practical, working workflow that accomplishes the user's goal.
6. Keep workflows simple — use the minimum number of steps needed.
7. If the user's request is vague or ambiguous, use the ask_questions tool FIRST to clarify before generating. Ask 2-4 focused questions. Do NOT ask questions if the request is clear enough to build a reasonable workflow.
8. Expressions ONLY support dot-path navigation into maps/objects. Do NOT use JavaScript, function calls, property accessors like .length, .toString(), or array indexing like [0]. Examples of INVALID expressions: {{new Date()}}, {{Math.random()}}, {{steps.x.output.items.length}}, {{steps.x.output.items[0]}}. To get an array count, use the filter step's output.count or a transform step.
9. When the user's request needs an external API but doesn't specify one, use real free mock APIs instead of placeholder URLs. Good options:
   - https://jsonplaceholder.typicode.com/posts (list posts), /posts/1 (single post), /users, /todos
   - https://httpbin.org/get, /post, /status/200, /delay/1
   - https://dummyjson.com/products, /users, /posts
   Never use example.com, api.example.com, or other non-functional placeholder domains.
`)

	return b.String()
}

const diagnosisSystemPrompt = `You are a workflow debugging assistant. When a workflow execution fails, you analyze the error message, step configurations, and step results to diagnose the problem.

Keep your language simple and non-technical where possible. The user may not be a developer.

IMPORTANT: The expression system ONLY supports these dot-path references:
- {{steps.<step_name>.output.<field>}} — data from a previous step
- {{workflow.input.<field>}} — workflow input (must be declared in input_schema)
- {{secrets.<key>}} — stored secrets
- {{env.<key>}} — environment variables

There are NO built-in functions (no now(), no Date(), no Math, no string functions). If a workflow needs a computed value like the current timestamp, the correct fix is to use an HTTP request step, a set_variable step with a literal value, or handle it in the external API being called. Do NOT suggest expressions or functions that don't exist.`

// BuildDiagnoseTool returns the tool definition for structured diagnosis output.
func BuildDiagnoseTool() Tool {
	return Tool{
		Name:        "diagnose_error",
		Description: "Provide a diagnosis and suggestion for a failed workflow execution.",
		InputSchema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"diagnosis", "suggestion", "is_user_error"},
			"properties": map[string]any{
				"diagnosis": map[string]any{
					"type":        "string",
					"description": "A clear, concise explanation of what went wrong (1-2 sentences)",
				},
				"suggestion": map[string]any{
					"type":        "string",
					"description": "A specific, actionable fix the user can apply (1-2 sentences)",
				},
				"is_user_error": map[string]any{
					"type":        "boolean",
					"description": "true if the user needs to fix their workflow config, false if it's a system/infrastructure issue",
				},
			},
		},
	}
}

func buildDiagnosePrompt(req diagnoseRequest) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Workflow execution failed with error:\n%s\n\n", req.Error)

	if len(req.Steps) > 0 {
		b.WriteString("Workflow steps:\n")
		for _, step := range req.Steps {
			raw, _ := json.Marshal(step.Config)
			fmt.Fprintf(&b, "- %s (type: %s) config: %s\n", step.Name, step.StepType, string(raw))
		}
		b.WriteString("\n")
	}

	if len(req.StepResults) > 0 {
		b.WriteString("Step results:\n")
		for name, result := range req.StepResults {
			if result.Error != "" {
				fmt.Fprintf(&b, "- %s: %s (error: %s)\n", name, result.Status, result.Error)
			} else {
				fmt.Fprintf(&b, "- %s: %s\n", name, result.Status)
			}
		}
	}

	return b.String()
}

// BuildAskQuestionsTool returns the tool for asking clarifying questions.
func BuildAskQuestionsTool() Tool {
	return Tool{
		Name:        "ask_questions",
		Description: "Ask the user clarifying questions before generating a workflow. Use this when the request is vague or ambiguous.",
		InputSchema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"questions"},
			"properties": map[string]any{
				"questions": map[string]any{
					"type":        "array",
					"description": "2-4 focused clarifying questions",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
		},
	}
}

// BuildToolSchema returns the strict tool definition for structured workflow output.
func BuildToolSchema() Tool {
	return Tool{
		Name:        "create_workflow",
		Description: "Create a workflow with steps and edges based on the user's description.",
		InputSchema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"steps", "edges", "summary"},
			"properties": map[string]any{
				"input_schema": map[string]any{
					"type":        "object",
					"description": "JSON Schema describing the workflow's expected input fields. Required when steps reference {{workflow.input.<field>}}. Example: {\"type\":\"object\",\"properties\":{\"order_id\":{\"type\":\"string\",\"description\":\"The order ID to process\"}},\"required\":[\"order_id\"]}",
				},
				"steps": map[string]any{
					"type":        "array",
					"description": "The steps in the workflow",
					"items": map[string]any{
						"type":                 "object",
						"additionalProperties": false,
						"required":             []string{"name", "step_type", "config"},
						"properties": map[string]any{
							"name": map[string]any{
								"type":        "string",
								"description": "Unique descriptive name in snake_case (e.g. fetch_orders)",
							},
							"step_type": map[string]any{
								"type":        "string",
								"description": "The step type name from the catalog (e.g. http_request, condition)",
							},
							"description": map[string]any{
								"type":        "string",
								"description": "Brief description of what this step does",
							},
							"config": map[string]any{
								"type":        "object",
								"description": "Step configuration matching the step type's config schema",
							},
						},
					},
				},
				"edges": map[string]any{
					"type":        "array",
					"description": "Connections between steps defining execution order and data flow",
					"items": map[string]any{
						"type":                 "object",
						"additionalProperties": false,
						"required":             []string{"source_step_name", "target_step_name", "edge_type"},
						"properties": map[string]any{
							"source_step_name": map[string]any{
								"type":        "string",
								"description": "Name of the source step",
							},
							"target_step_name": map[string]any{
								"type":        "string",
								"description": "Name of the target step",
							},
							"source_output": map[string]any{
								"type":        "string",
								"description": "For condition steps: 'true' or 'false' to indicate which branch",
								"enum":        []string{"true", "false"},
							},
							"edge_type": map[string]any{
								"type":        "string",
								"description": "Type of edge: 'normal' for success path, 'error' for error handling",
								"enum":        []string{"normal", "error"},
							},
						},
					},
				},
				"summary": map[string]any{
					"type":        "string",
					"description": "A brief human-readable summary of the workflow that was created",
				},
			},
		},
	}
}
