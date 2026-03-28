package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"

	"react-go-workflow/ent"
	"react-go-workflow/internal/shared"

	"github.com/google/uuid"
)

// Handler handles AI workflow generation requests.
type Handler struct {
	client    *Client
	entClient *ent.Client
	apiKey    string
	stepTypes []*ent.StepType
	// stepTypesByName maps step type name (e.g. "http_request") to the ent entity.
	stepTypesByName map[string]*ent.StepType
}

// NewHandler creates a new AI handler, loading and caching step types at init time.
func NewHandler(entClient *ent.Client, apiKey string) *Handler {
	h := &Handler{
		entClient:       entClient,
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
	Prompt          string           `json:"prompt" validate:"required,max=5000"`
	History         []historyMessage `json:"history,omitempty"`
	CurrentWorkflow *currentWorkflow `json:"current_workflow,omitempty"`
}

type currentWorkflow struct {
	Steps []currentStep `json:"steps"`
	Edges []currentEdge `json:"edges"`
}

type currentStep struct {
	Name     string         `json:"name"`
	StepType string         `json:"step_type"`
	Config   map[string]any `json:"config"`
}

type currentEdge struct {
	SourceStepName string `json:"source_step_name"`
	TargetStepName string `json:"target_step_name"`
	EdgeType       string `json:"edge_type"`
}

type historyMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
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
	Steps          []responseStep  `json:"steps"`
	Edges          []generatedEdge `json:"edges"`
	Summary        string          `json:"summary"`
	MissingSecrets []string        `json:"missing_secrets,omitempty"`
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

	// Load available secret keys (not values) for the prompt
	var secretKeys []string
	if secrets, err := h.entClient.Secret.Query().All(r.Context()); err == nil {
		for _, s := range secrets {
			secretKeys = append(secretKeys, s.Key)
		}
	}

	// Build system prompt and tools
	systemPrompt := BuildSystemPrompt(h.stepTypes, secretKeys)
	tools := []Tool{BuildAskQuestionsTool(), BuildToolSchema()}

	// Build messages from history + current prompt
	var messages []Message
	for _, m := range req.History {
		messages = append(messages, Message{Role: m.Role, Content: m.Content})
	}

	// Include current workflow context if present
	userPrompt := req.Prompt
	if req.CurrentWorkflow != nil && len(req.CurrentWorkflow.Steps) > 0 {
		workflowJSON, _ := json.Marshal(req.CurrentWorkflow)
		userPrompt = fmt.Sprintf("%s\n\n[Current workflow on canvas — this is the user's existing workflow for context. Do not critique its structure unless asked. If asked to modify it, use create_workflow to output the full updated workflow.]\n%s", req.Prompt, string(workflowJSON))
	}
	messages = append(messages, Message{Role: "user", Content: userPrompt})

	// Call Claude API
	result, toolName, err := h.client.CreateMessageWithHistory(r.Context(), systemPrompt, messages, tools)
	if err != nil {
		slog.Error("AI generation failed", "error", err)
		if errors.Is(err, ErrTimeout) {
			shared.WriteJSON(w, http.StatusGatewayTimeout, ErrAITimeout)
			return
		}
		shared.WriteJSON(w, http.StatusBadGateway, &shared.APIError{
			Code:    "AI_UNAVAILABLE",
			Message: err.Error(),
		})
		return
	}

	// If the AI asked questions instead of generating, return them
	if toolName == "ask_questions" {
		questionsRaw, _ := json.Marshal(result)
		var qResult struct {
			Questions []string `json:"questions"`
		}
		json.Unmarshal(questionsRaw, &qResult)
		shared.WriteJSON(w, http.StatusOK, map[string]any{
			"type":      "questions",
			"questions": qResult.Questions,
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
	existingSecrets := make(map[string]bool, len(secretKeys))
	for _, k := range secretKeys {
		existingSecrets[k] = true
	}
	resp, err := h.enrichResult(toolResult, existingSecrets)
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

	result, _, err := h.client.CreateMessage(r.Context(), diagnosisSystemPrompt, prompt, []Tool{tool})
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
func (h *Handler) enrichResult(result aiToolResult, existingSecrets map[string]bool) (*generateResponse, error) {
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

	// Scan all step configs for {{secrets.X}} references and find missing ones
	secretRefRegex := regexp.MustCompile(`\{\{secrets\.([^}]+)\}\}`)
	missingSet := make(map[string]bool)
	for _, step := range result.Steps {
		scanForSecrets(step.Config, secretRefRegex, existingSecrets, missingSet)
	}
	var missingSecrets []string
	for k := range missingSet {
		missingSecrets = append(missingSecrets, k)
	}

	return &generateResponse{
		Steps:          responseSteps,
		Edges:          result.Edges,
		Summary:        result.Summary,
		InputSchema:    result.InputSchema,
		MissingSecrets: missingSecrets,
	}, nil
}

func scanForSecrets(v any, re *regexp.Regexp, existing map[string]bool, missing map[string]bool) {
	switch val := v.(type) {
	case string:
		for _, match := range re.FindAllStringSubmatch(val, -1) {
			if len(match) > 1 && !existing[match[1]] {
				missing[match[1]] = true
			}
		}
	case map[string]any:
		for _, child := range val {
			scanForSecrets(child, re, existing, missing)
		}
	case []any:
		for _, item := range val {
			scanForSecrets(item, re, existing, missing)
		}
	}
}
