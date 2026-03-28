package steptype

import (
	"context"
	"log/slog"

	"react-go-workflow/ent"
	entsteptype "react-go-workflow/ent/steptype"
)

// M is a shorthand for map[string]any to keep schema definitions readable.
type M = map[string]any

type seedType struct {
	Name         string
	DisplayName  string
	Category     entsteptype.Category
	Description  string
	Icon         string
	ConfigSchema M
	InputSchema  M
	OutputSchema M
}

var builtinTypes = []seedType{
	{
		Name: "http_request", DisplayName: "HTTP Request", Category: entsteptype.CategoryAction,
		Description: "Make an API call to any URL", Icon: "globe",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"url":    M{"type": "string", "title": "URL", "description": "The URL to send the request to", "placeholder": "https://api.example.com/data", "quickEdit": true},
				"method": M{"type": "string", "title": "Method", "enum": []string{"GET", "POST", "PUT", "PATCH", "DELETE"}, "default": "GET"},
				"headers": M{"type": "object", "title": "Headers", "description": "Key-value pairs to send as request headers",
					"additionalProperties": M{"type": "string"}},
				"body":      M{"type": "string", "title": "Body", "description": "Request body (for POST/PUT/PATCH)", "format": "json"},
			},
			"required": []string{"url", "method"},
		},
		InputSchema:  M{"type": "object", "description": "Any data to use in URL or body templates"},
		OutputSchema: M{"type": "object", "properties": M{"status": M{"type": "number"}, "headers": M{"type": "object"}, "body": M{"type": "any"}}},
	},
	{
		Name: "transform", DisplayName: "Transform Data", Category: entsteptype.CategoryAction,
		Description: "Map and reshape data from one format to another", Icon: "shuffle",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"mappings": M{"type": "object", "title": "Mappings", "description": "Map output field names to source expressions", "format": "json-builder",
					"additionalProperties": M{"type": "string"}},
			},
		},
		InputSchema:  M{"type": "object", "description": "Data from previous steps"},
		OutputSchema: M{"type": "object", "description": "Mapped output fields"},
	},
	{
		Name: "condition", DisplayName: "Condition", Category: entsteptype.CategoryLogic,
		Description: "Take different paths based on whether a condition is true or false", Icon: "git-branch",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"field":    M{"type": "string", "title": "Value to check", "description": "Expression for the value to evaluate, e.g. {{steps.fetch.output.status}}", "quickEdit": true},
				"operator": M{"type": "string", "title": "Operator", "enum": []string{"equals", "not_equals", "greater_than", "less_than", "contains", "not_contains", "is_empty", "is_not_empty"}, "default": "equals"},
				"value":    M{"type": "string", "title": "Compare to", "description": "The value to compare against"},
			},
			"required": []string{"field", "operator"},
			"outputs": []M{
				{"name": "true", "label": "Yes", "color": "#22c55e"},
				{"name": "false", "label": "No", "color": "#ef4444"},
			},
		},
		OutputSchema: M{"type": "object", "properties": M{"result": M{"type": "boolean", "description": "Whether the condition was true or false"}}},
	},
	{
		Name: "loop", DisplayName: "Loop", Category: entsteptype.CategoryLogic,
		Description: "Repeat actions for each item in a list", Icon: "repeat",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"source_array": M{"type": "string", "title": "List to loop over", "description": "Expression for the array, e.g. {{steps.fetch.output.body.items}}"},
				"item_variable": M{"type": "string", "title": "Item variable name", "description": "Name to reference each item as", "default": "item"},
			},
			"required": []string{"source_array"},
		},
		OutputSchema: M{"type": "object", "properties": M{"results": M{"type": "array", "description": "Results collected from each iteration"}}},
	},
	{
		Name: "delay", DisplayName: "Wait", Category: entsteptype.CategoryUtility,
		Description: "Pause the workflow for a set amount of time", Icon: "clock",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"duration_seconds": M{"type": "number", "title": "Wait time (seconds)", "description": "How long to pause before continuing", "default": 5, "minimum": 1, "maximum": 3600},
			},
			"required": []string{"duration_seconds"},
		},
	},
	{
		Name: "log", DisplayName: "Log Message", Category: entsteptype.CategoryUtility,
		Description: "Write a message to the execution log for debugging", Icon: "file-text",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"message": M{"type": "string", "title": "Message", "description": "The message to log. You can use expressions like {{steps.fetch.output.body}}", "quickEdit": true},
				"level":   M{"type": "string", "title": "Level", "enum": []string{"info", "warn", "error"}, "default": "info"},
			},
			"required": []string{"message"},
		},
	},
	{
		Name: "set_variable", DisplayName: "Set Variable", Category: entsteptype.CategoryUtility,
		Description: "Store a value that later steps can reference", Icon: "variable",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"variable_name": M{"type": "string", "title": "Variable name", "description": "A name for this variable so you can reference it later"},
				"value":         M{"type": "string", "title": "Value", "description": "The value to store. Can be an expression like {{steps.fetch.output.body.id}}", "format": "typed-value"},
			},
			"required": []string{"variable_name", "value"},
		},
		OutputSchema: M{"type": "object", "description": "The stored variable, accessible by its name"},
	},
	{
		Name: "send_email", DisplayName: "Send Email", Category: entsteptype.CategoryAction,
		Description: "Send an email notification to one or more recipients", Icon: "mail",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"to":      M{"type": "string", "title": "To", "description": "Email address(es), comma-separated"},
				"subject": M{"type": "string", "title": "Subject", "description": "Email subject line"},
				"body":    M{"type": "string", "title": "Body", "description": "Email body. Supports expressions.", "format": "textarea"},
				"smtp_host": M{"type": "string", "title": "SMTP Host", "description": "SMTP server address"},
				"smtp_port": M{"type": "number", "title": "SMTP Port", "default": 587},
				"smtp_user": M{"type": "string", "title": "SMTP Username"},
				"smtp_pass": M{"type": "string", "title": "SMTP Password", "description": "Use a secret: {{secrets.SMTP_PASSWORD}}", "format": "password"},
			},
			"required": []string{"to", "subject", "body"},
		},
		OutputSchema: M{"type": "object", "properties": M{"sent": M{"type": "boolean"}, "message_id": M{"type": "string"}}},
	},
	{
		Name: "database_query", DisplayName: "Database Query", Category: entsteptype.CategoryAction,
		Description: "Run a SQL query against a database and get results", Icon: "database",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"connection_string": M{"type": "string", "title": "Connection String", "description": "Database connection URL. Use a secret: {{secrets.DB_URL}}"},
				"query":             M{"type": "string", "title": "SQL Query", "description": "The SQL query to execute. Use $1, $2 for parameters.", "format": "sql"},
				"parameters": M{"type": "array", "title": "Parameters", "description": "Values for query placeholders ($1, $2, etc.)",
					"items": M{"type": "string"}},
			},
			"required": []string{"connection_string", "query"},
		},
		OutputSchema: M{"type": "object", "properties": M{"rows": M{"type": "array"}, "row_count": M{"type": "number"}}},
	},
	{
		Name: "webhook_response", DisplayName: "Webhook Response", Category: entsteptype.CategoryUtility,
		Description: "Send a response back to whoever triggered this workflow via webhook", Icon: "webhook",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"status_code": M{"type": "number", "title": "Status Code", "description": "HTTP status code to return", "default": 200},
				"headers":     M{"type": "object", "title": "Response Headers", "additionalProperties": M{"type": "string"}},
				"body":        M{"type": "string", "title": "Response Body", "description": "JSON body to return. Supports expressions.", "format": "json"},
			},
		},
	},
	{
		Name: "json_parse", DisplayName: "Parse JSON", Category: entsteptype.CategoryAction,
		Description: "Parse a JSON string into structured data you can work with", Icon: "braces",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"source": M{"type": "string", "title": "JSON String", "description": "Expression for the JSON string to parse, e.g. {{steps.fetch.output.body}}"},
			},
			"required": []string{"source"},
		},
		OutputSchema: M{"type": "object", "description": "The parsed JSON data", "dynamicOutput": true},
	},
	{
		Name: "filter", DisplayName: "Filter List", Category: entsteptype.CategoryLogic,
		Description: "Keep only the items in a list that match your condition", Icon: "filter",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"source_array": M{"type": "string", "title": "List to filter", "description": "Expression for the array to filter"},
				"field":        M{"type": "string", "title": "Field to check", "description": "Which field on each item to evaluate"},
				"operator":     M{"type": "string", "title": "Operator", "enum": []string{"equals", "not_equals", "greater_than", "less_than", "contains", "is_empty", "is_not_empty"}, "default": "equals"},
				"value":        M{"type": "string", "title": "Compare to", "description": "The value to compare against"},
			},
			"required": []string{"source_array", "field", "operator"},
		},
		OutputSchema: M{"type": "object", "properties": M{"items": M{"type": "array"}, "count": M{"type": "number"}}},
	},
	{
		Name: "sub_workflow", DisplayName: "Reusable Block", Category: entsteptype.CategoryAction,
		Description: "Run another saved workflow as a single step in this one", Icon: "blocks",
		ConfigSchema: M{
			"type": "object",
			"properties": M{
				"workflow_id":   M{"type": "string", "title": "Workflow to run", "description": "Select an existing workflow", "format": "workflow-picker"},
				"input_mapping": M{"type": "object", "title": "Inputs", "description": "Map values into the sub-workflow's inputs", "additionalProperties": M{"type": "string"}},
			},
			"required": []string{"workflow_id"},
		},
		InputSchema:  M{"type": "object", "description": "Passed from parent workflow"},
		OutputSchema: M{"type": "object", "description": "Whatever the sub-workflow produces as output"},
	},
}

// SeedBuiltinTypes creates built-in step types if they don't already exist.
// If a type exists but has no config_schema, it will be updated with the schema.
func SeedBuiltinTypes(ctx context.Context, client *ent.Client) error {
	for _, bt := range builtinTypes {
		existing, err := client.StepType.Query().
			Where(entsteptype.Name(bt.Name)).
			Only(ctx)

		if err != nil && !ent.IsNotFound(err) {
			return err
		}

		if existing != nil {
			// Always update schemas, description, and icon to pick up seed changes
			upd := existing.Update().
				SetDescription(bt.Description).
				SetIcon(bt.Icon)
			if bt.ConfigSchema != nil {
				upd.SetConfigSchema(bt.ConfigSchema)
			}
			if bt.InputSchema != nil {
				upd.SetInputSchema(bt.InputSchema)
			}
			if bt.OutputSchema != nil {
				upd.SetOutputSchema(bt.OutputSchema)
			}
			if _, err = upd.Save(ctx); err != nil {
				return err
			}
			continue
		}

		builder := client.StepType.Create().
			SetName(bt.Name).
			SetDisplayName(bt.DisplayName).
			SetCategory(bt.Category).
			SetDescription(bt.Description).
			SetIcon(bt.Icon)

		if bt.ConfigSchema != nil {
			builder.SetConfigSchema(bt.ConfigSchema)
		}
		if bt.InputSchema != nil {
			builder.SetInputSchema(bt.InputSchema)
		}
		if bt.OutputSchema != nil {
			builder.SetOutputSchema(bt.OutputSchema)
		}

		if _, err := builder.Save(ctx); err != nil {
			return err
		}
		slog.Info("seeded step type", "name", bt.Name)
	}
	return nil
}
