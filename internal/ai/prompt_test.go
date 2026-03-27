package ai

import (
	"encoding/json"
	"strings"
	"testing"

	"react-go-workflow/ent"
	"react-go-workflow/ent/steptype"
)

func TestBuildSystemPrompt_IncludesAllStepTypes(t *testing.T) {
	stepTypes := []*ent.StepType{
		{
			Name:        "http_request",
			DisplayName: "HTTP Request",
			Category:    steptype.CategoryAction,
			Description: "Make an API call",
			ConfigSchema: map[string]any{
				"properties": map[string]any{
					"url":    map[string]any{"type": "string", "description": "The URL"},
					"method": map[string]any{"type": "string", "enum": []string{"GET", "POST"}},
				},
			},
			OutputSchema: map[string]any{"type": "object"},
		},
		{
			Name:        "condition",
			DisplayName: "Condition",
			Category:    steptype.CategoryLogic,
			Description: "Branch based on condition",
			ConfigSchema: map[string]any{
				"properties": map[string]any{
					"field":    map[string]any{"type": "string"},
					"operator": map[string]any{"type": "string"},
				},
				"outputs": []map[string]any{
					{"name": "true", "label": "Yes"},
					{"name": "false", "label": "No"},
				},
			},
		},
	}

	prompt := BuildSystemPrompt(stepTypes)

	// Should include step type names and descriptions
	if !strings.Contains(prompt, "http_request") {
		t.Error("prompt should contain http_request")
	}
	if !strings.Contains(prompt, "condition") {
		t.Error("prompt should contain condition")
	}
	if !strings.Contains(prompt, "Make an API call") {
		t.Error("prompt should contain step description")
	}

	// Should include expression syntax docs
	if !strings.Contains(prompt, "{{steps.") {
		t.Error("prompt should document expression syntax")
	}

	// Should include config field info
	if !strings.Contains(prompt, "url") {
		t.Error("prompt should include config field names")
	}

	// Should include outputs for branching steps
	if !strings.Contains(prompt, "Outputs") || !strings.Contains(prompt, "branches") {
		t.Error("prompt should document branching outputs")
	}
}

func TestBuildToolSchema_Structure(t *testing.T) {
	tool := BuildToolSchema()

	if tool.Name != "create_workflow" {
		t.Errorf("expected tool name create_workflow, got %s", tool.Name)
	}

	schema := tool.InputSchema
	if schema["type"] != "object" {
		t.Error("schema type should be object")
	}

	// Check additionalProperties is false (strict schema)
	if schema["additionalProperties"] != false {
		t.Error("schema should have additionalProperties: false")
	}

	// Check required fields
	required, ok := schema["required"].([]string)
	if !ok {
		t.Fatal("required should be a string array")
	}
	requiredSet := map[string]bool{}
	for _, r := range required {
		requiredSet[r] = true
	}
	if !requiredSet["steps"] || !requiredSet["edges"] || !requiredSet["summary"] {
		t.Error("required should include steps, edges, summary")
	}

	// Check step items have required fields
	props := schema["properties"].(map[string]any)
	steps := props["steps"].(map[string]any)
	stepItems := steps["items"].(map[string]any)
	stepRequired, _ := stepItems["required"].([]string)
	stepReqSet := map[string]bool{}
	for _, r := range stepRequired {
		stepReqSet[r] = true
	}
	if !stepReqSet["name"] || !stepReqSet["step_type"] || !stepReqSet["config"] {
		t.Error("step items should require name, step_type, config")
	}

	// Check edge_type has enum constraint
	edges := props["edges"].(map[string]any)
	edgeItems := edges["items"].(map[string]any)
	edgeProps := edgeItems["properties"].(map[string]any)
	edgeType := edgeProps["edge_type"].(map[string]any)
	if edgeType["enum"] == nil {
		t.Error("edge_type should have enum constraint")
	}

	// Validate the full schema is valid JSON
	_, err := json.Marshal(tool.InputSchema)
	if err != nil {
		t.Fatalf("tool schema should be valid JSON: %v", err)
	}
}
