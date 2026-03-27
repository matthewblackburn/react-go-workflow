package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"react-go-workflow/ent"
	"react-go-workflow/internal/shared"

	"github.com/google/uuid"
)

// Handler handles AI workflow generation requests.
type Handler struct {
	client    *Client
	apiKey    string
	stepTypes []*ent.StepType
	// stepTypesByName maps step type name (e.g. "http_request") to the ent entity.
	stepTypesByName map[string]*ent.StepType
}

// NewHandler creates a new AI handler, loading and caching step types at init time.
func NewHandler(entClient *ent.Client, apiKey string) *Handler {
	h := &Handler{
		apiKey:          apiKey,
		stepTypesByName: make(map[string]*ent.StepType),
	}

	if apiKey != "" {
		h.client = NewClient(apiKey)
	}

	// Cache step types at startup — they only change on server restart (seed).
	ctx := context.Background()
	stepTypes, err := entClient.StepType.Query().All(ctx)
	if err != nil {
		slog.Error("failed to load step types for AI handler", "error", err)
	} else {
		h.stepTypes = stepTypes
		for _, st := range stepTypes {
			h.stepTypesByName[st.Name] = st
		}
	}

	return h
}

type generateRequest struct {
	Prompt string `json:"prompt" validate:"required,max=5000"`
}

type diagnoseRequest struct {
	Error       string                    `json:"error" validate:"required,max=5000"`
	Steps       []diagnoseStep            `json:"steps"`
	StepResults map[string]diagnoseResult `json:"step_results,omitempty"`
}

type diagnoseStep struct {
	Name     string         `json:"name"`
	StepType string         `json:"step_type"`
	Config   map[string]any `json:"config"`
}

type diagnoseResult struct {
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

type diagnoseResponse struct {
	Diagnosis  string `json:"diagnosis"`
	Suggestion string `json:"suggestion"`
	IsUserError bool  `json:"is_user_error"`
}

// generatedStep is a step returned by the LLM.
type generatedStep struct {
	Name        string         `json:"name"`
	StepType    string         `json:"step_type"`
	Description string         `json:"description,omitempty"`
	Config      map[string]any `json:"config"`
}

// generatedEdge is an edge returned by the LLM.
type generatedEdge struct {
	SourceStepName string `json:"source_step_name"`
	TargetStepName string `json:"target_step_name"`
	SourceOutput   string `json:"source_output,omitempty"`
	EdgeType       string `json:"edge_type"`
}

// aiToolResult is the parsed tool_use output from the LLM.
type aiToolResult struct {
	Steps       []generatedStep `json:"steps"`
	Edges       []generatedEdge `json:"edges"`
	Summary     string          `json:"summary"`
	InputSchema map[string]any  `json:"input_schema,omitempty"`
}

// responseStep is a step in the API response, enriched with IDs.
type responseStep struct {
	ID          string         `json:"id"`
	StepType    string         `json:"step_type"`
	StepTypeID  string         `json:"step_type_id"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Config      map[string]any `json:"config"`
}

type generateResponse struct {
	Steps       []responseStep  `json:"steps"`
	Edges       []generatedEdge `json:"edges"`
	Summary     string          `json:"summary"`
	InputSchema map[string]any  `json:"input_schema,omitempty"`
}

var (
	ErrAINotConfigured = &shared.APIError{Code: "AI_NOT_CONFIGURED", Message: "AI workflow generation is not configured"}
	ErrAIUnavailable   = &shared.APIError{Code: "AI_UNAVAILABLE", Message: "AI service is currently unavailable"}
	ErrAITimeout       = &shared.APIError{Code: "AI_TIMEOUT", Message: "AI service timed out"}
	ErrAIInvalidResult = &shared.APIError{Code: "AI_INVALID_RESULT", Message: "AI generated an invalid workflow"}
)

// GenerateWorkflow handles POST /v1/ai/generate-workflow.
func (h *Handler) GenerateWorkflow(w http.ResponseWriter, r *http.Request) {
	// Guard: API key must be configured
	if h.apiKey == "" {
		shared.WriteJSON(w, http.StatusServiceUnavailable, ErrAINotConfigured)
		return
	}

	// Decode and validate request
	var req generateRequest
	if err := shared.DecodeAndValidate(r, &req); err != nil {
		shared.WriteValidationError(w, err)
		return
	}

	// Build system prompt and tool schema
	systemPrompt := BuildSystemPrompt(h.stepTypes)
	tool := BuildToolSchema()

	// Call Claude API
	result, err := h.client.CreateMessage(r.Context(), systemPrompt, req.Prompt, []Tool{tool})
	if err != nil {
		slog.Error("AI generation failed", "error", err)
		if errors.Is(err, ErrTimeout) {
			shared.WriteJSON(w, http.StatusGatewayTimeout, ErrAITimeout)
			return
		}
		// Pass the specific error message to the frontend
		shared.WriteJSON(w, http.StatusBadGateway, &shared.APIError{
			Code:    "AI_UNAVAILABLE",
			Message: err.Error(),
		})
		return
	}

	// Parse tool_use result into typed struct
	resultJSON, err := json.Marshal(result)
	if err != nil {
		slog.Error("failed to marshal AI result", "error", err)
		shared.WriteJSON(w, http.StatusBadGateway, ErrAIUnavailable)
		return
	}

	var toolResult aiToolResult
	if err := json.Unmarshal(resultJSON, &toolResult); err != nil {
		slog.Error("failed to parse AI tool result", "error", err)
		shared.WriteJSON(w, http.StatusBadGateway, &shared.APIError{
			Code:    "AI_PARSE_ERROR",
			Message: "failed to parse AI response",
		})
		return
	}

	// Validate and enrich
	resp, err := h.enrichResult(toolResult)
	if err != nil {
		shared.WriteError(w, err)
		return
	}

	shared.WriteJSON(w, http.StatusOK, resp)
}

// DiagnoseExecution handles POST /v1/ai/diagnose-execution.
func (h *Handler) DiagnoseExecution(w http.ResponseWriter, r *http.Request) {
	if h.apiKey == "" {
		shared.WriteJSON(w, http.StatusServiceUnavailable, ErrAINotConfigured)
		return
	}

	var req diagnoseRequest
	if err := shared.DecodeAndValidate(r, &req); err != nil {
		shared.WriteValidationError(w, err)
		return
	}

	prompt := buildDiagnosePrompt(req)
	tool := BuildDiagnoseTool()

	result, err := h.client.CreateMessage(r.Context(), diagnosisSystemPrompt, prompt, []Tool{tool})
	if err != nil {
		slog.Error("AI diagnosis failed", "error", err)
		shared.WriteJSON(w, http.StatusBadGateway, ErrAIUnavailable)
		return
	}

	// The response is a text message, not tool_use. Extract from the result.
	diagnosis := ""
	suggestion := ""
	isUserError := true

	if d, ok := result["diagnosis"].(string); ok {
		diagnosis = d
	}
	if s, ok := result["suggestion"].(string); ok {
		suggestion = s
	}
	if u, ok := result["is_user_error"].(bool); ok {
		isUserError = u
	}

	shared.WriteJSON(w, http.StatusOK, diagnoseResponse{
		Diagnosis:   diagnosis,
		Suggestion:  suggestion,
		IsUserError: isUserError,
	})
}

// enrichResult validates the AI output, assigns UUIDs, and resolves step type IDs.
func (h *Handler) enrichResult(result aiToolResult) (*generateResponse, error) {
	if len(result.Steps) == 0 {
		return nil, ErrAIInvalidResult.WithDetails(map[string]string{
			"steps": "no steps were generated",
		})
	}

	// Validate step types and build name→ID map
	stepNameToID := make(map[string]string, len(result.Steps))
	invalidTypes := make(map[string]string)
	responseSteps := make([]responseStep, 0, len(result.Steps))

	for _, step := range result.Steps {
		st, ok := h.stepTypesByName[step.StepType]
		if !ok {
			invalidTypes[step.Name] = fmt.Sprintf("unknown step type: %s", step.StepType)
			continue
		}

		id := uuid.New().String()
		stepNameToID[step.Name] = id
		responseSteps = append(responseSteps, responseStep{
			ID:          id,
			StepType:    step.StepType,
			StepTypeID:  st.ID.String(),
			Name:        step.Name,
			Description: step.Description,
			Config:      step.Config,
		})
	}

	if len(invalidTypes) > 0 {
		return nil, ErrAIInvalidResult.WithDetails(invalidTypes)
	}

	// Validate edge references
	invalidEdges := make(map[string]string)
	for i, edge := range result.Edges {
		if _, ok := stepNameToID[edge.SourceStepName]; !ok {
			invalidEdges[fmt.Sprintf("edge_%d_source", i)] = fmt.Sprintf("references unknown step: %s", edge.SourceStepName)
		}
		if _, ok := stepNameToID[edge.TargetStepName]; !ok {
			invalidEdges[fmt.Sprintf("edge_%d_target", i)] = fmt.Sprintf("references unknown step: %s", edge.TargetStepName)
		}
	}

	if len(invalidEdges) > 0 {
		return nil, ErrAIInvalidResult.WithDetails(invalidEdges)
	}

	return &generateResponse{
		Steps:       responseSteps,
		Edges:       result.Edges,
		Summary:     result.Summary,
		InputSchema: result.InputSchema,
	}, nil
}
