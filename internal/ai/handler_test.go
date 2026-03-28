package ai

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"react-go-workflow/ent"
	"react-go-workflow/ent/steptype"

	"github.com/google/uuid"
)

func newTestHandler() *Handler {
	st1 := &ent.StepType{
		ID:          uuid.New(),
		Name:        "http_request",
		DisplayName: "HTTP Request",
		Category:    steptype.CategoryAction,
		Description: "Make an API call",
	}
	st2 := &ent.StepType{
		ID:          uuid.New(),
		Name:        "condition",
		DisplayName: "Condition",
		Category:    steptype.CategoryLogic,
		Description: "Branch logic",
	}
	st3 := &ent.StepType{
		ID:          uuid.New(),
		Name:        "database_query",
		DisplayName: "Database Query",
		Category:    steptype.CategoryAction,
		Description: "Run SQL query",
	}

	return &Handler{
		apiKey:          "test-key",
		client:          NewClient("test-key"),
		stepTypes:       []*ent.StepType{st1, st2, st3},
		stepTypesByName: map[string]*ent.StepType{"http_request": st1, "condition": st2, "database_query": st3},
	}
}

func TestGenerateWorkflow_NoAPIKey(t *testing.T) {
	h := &Handler{
		apiKey:          "",
		stepTypesByName: map[string]*ent.StepType{},
	}

	body := `{"prompt": "test"}`
	r := httptest.NewRequest(http.MethodPost, "/v1/ai/generate-workflow", bytes.NewBufferString(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.GenerateWorkflow(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}

	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["code"] != "AI_NOT_CONFIGURED" {
		t.Errorf("expected AI_NOT_CONFIGURED, got %v", resp["code"])
	}
}

func TestGenerateWorkflow_EmptyPrompt(t *testing.T) {
	h := newTestHandler()

	body := `{"prompt": ""}`
	r := httptest.NewRequest(http.MethodPost, "/v1/ai/generate-workflow", bytes.NewBufferString(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.GenerateWorkflow(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGenerateWorkflow_InvalidJSON(t *testing.T) {
	h := newTestHandler()

	r := httptest.NewRequest(http.MethodPost, "/v1/ai/generate-workflow", bytes.NewBufferString("not json"))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.GenerateWorkflow(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestEnrichResult_ValidResult(t *testing.T) {
	h := newTestHandler()

	result := aiToolResult{
		Steps: []generatedStep{
			{Name: "fetch_data", StepType: "http_request", Config: map[string]any{"url": "https://api.example.com"}},
			{Name: "save_data", StepType: "database_query", Config: map[string]any{"query": "INSERT INTO..."}},
		},
		Edges: []generatedEdge{
			{SourceStepName: "fetch_data", TargetStepName: "save_data", EdgeType: "normal"},
		},
		Summary: "Fetches data and saves to database",
	}

	resp, err := h.enrichResult(result, map[string]bool{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(resp.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(resp.Steps))
	}

	// Check UUIDs were assigned
	for _, step := range resp.Steps {
		if step.ID == "" {
			t.Error("step should have a UUID assigned")
		}
		if step.StepTypeID == "" {
			t.Error("step should have a step_type_id resolved")
		}
	}

	// Check step_type is preserved
	if resp.Steps[0].StepType != "http_request" {
		t.Errorf("expected step_type=http_request, got %s", resp.Steps[0].StepType)
	}

	if resp.Summary != "Fetches data and saves to database" {
		t.Errorf("unexpected summary: %s", resp.Summary)
	}
}

func TestEnrichResult_UnknownStepType(t *testing.T) {
	h := newTestHandler()

	result := aiToolResult{
		Steps: []generatedStep{
			{Name: "bad_step", StepType: "nonexistent_type", Config: map[string]any{}},
		},
		Edges:   []generatedEdge{},
		Summary: "Bad workflow",
	}

	_, err := h.enrichResult(result, map[string]bool{})
	if err == nil {
		t.Fatal("expected error for unknown step type")
	}
}

func TestEnrichResult_BadEdgeReference(t *testing.T) {
	h := newTestHandler()

	result := aiToolResult{
		Steps: []generatedStep{
			{Name: "fetch_data", StepType: "http_request", Config: map[string]any{}},
		},
		Edges: []generatedEdge{
			{SourceStepName: "fetch_data", TargetStepName: "nonexistent_step", EdgeType: "normal"},
		},
		Summary: "Bad edges",
	}

	_, err := h.enrichResult(result, map[string]bool{})
	if err == nil {
		t.Fatal("expected error for bad edge reference")
	}
}

func TestEnrichResult_EmptySteps(t *testing.T) {
	h := newTestHandler()

	result := aiToolResult{
		Steps:   []generatedStep{},
		Edges:   []generatedEdge{},
		Summary: "Empty",
	}

	_, err := h.enrichResult(result, map[string]bool{})
	if err == nil {
		t.Fatal("expected error for empty steps")
	}
}
