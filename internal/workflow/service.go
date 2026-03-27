package workflow

import (
	"context"

	"react-go-workflow/ent"

	"github.com/google/uuid"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) List(ctx context.Context) ([]*ent.Workflow, error) {
	return s.repo.List(ctx)
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*ent.Workflow, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *Service) GetFull(ctx context.Context, id uuid.UUID) (*ent.Workflow, error) {
	return s.repo.GetFull(ctx, id)
}

func (s *Service) Create(ctx context.Context, wf *ent.Workflow) (*ent.Workflow, error) {
	return s.repo.Create(ctx, wf)
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, wf *ent.Workflow) (*ent.Workflow, error) {
	return s.repo.Update(ctx, id, wf)
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}

func (s *Service) SaveCanvas(ctx context.Context, workflowID uuid.UUID, steps []ent.Step, edges []ent.Edge, notes []ent.CanvasNote) error {
	return s.repo.SaveCanvas(ctx, workflowID, steps, edges, notes)
}

// Clone duplicates a workflow with all its steps, edges, and canvas notes.
func (s *Service) Clone(ctx context.Context, id uuid.UUID) (*ent.Workflow, error) {
	source, err := s.repo.GetFull(ctx, id)
	if err != nil {
		return nil, err
	}

	// Create new workflow
	cloned := &ent.Workflow{
		Name:           "Copy of " + source.Name,
		Description:    source.Description,
		Status:         "draft",
		TriggerConfig:  source.TriggerConfig,
		InputSchema:    source.InputSchema,
		OutputSchema:   source.OutputSchema,
		Concurrency:    source.Concurrency,
		TimeoutSeconds: source.TimeoutSeconds,
	}

	newWf, err := s.repo.Create(ctx, cloned)
	if err != nil {
		return nil, err
	}

	// Map old step IDs to new step IDs
	stepIDMap := make(map[uuid.UUID]uuid.UUID)
	var steps []ent.Step
	for _, oldStep := range source.Edges.Steps {
		newID := uuid.New()
		stepIDMap[oldStep.ID] = newID
		steps = append(steps, ent.Step{
			ID:            newID,
			StepTypeID:    oldStep.StepTypeID,
			Name:          oldStep.Name,
			Description:   oldStep.Description,
			Config:        oldStep.Config,
			PositionX:     oldStep.PositionX,
			PositionY:     oldStep.PositionY,
			InputMapping:  oldStep.InputMapping,
			TimeoutSeconds: oldStep.TimeoutSeconds,
			RetryCount:    oldStep.RetryCount,
			RetryBackoff:  oldStep.RetryBackoff,
			RetryDelayMs:  oldStep.RetryDelayMs,
		})
	}

	var edges []ent.Edge
	for _, oldEdge := range source.Edges.Edges {
		edges = append(edges, ent.Edge{
			ID:           uuid.New(),
			SourceStepID: stepIDMap[oldEdge.SourceStepID],
			TargetStepID: stepIDMap[oldEdge.TargetStepID],
			SourceOutput: oldEdge.SourceOutput,
			TargetInput:  oldEdge.TargetInput,
			EdgeType:     oldEdge.EdgeType,
			Condition:    oldEdge.Condition,
		})
	}

	var notes []ent.CanvasNote
	for _, oldNote := range source.Edges.CanvasNotes {
		notes = append(notes, ent.CanvasNote{
			ID:        uuid.New(),
			Content:   oldNote.Content,
			Color:     oldNote.Color,
			PositionX: oldNote.PositionX,
			PositionY: oldNote.PositionY,
			Width:     oldNote.Width,
			Height:    oldNote.Height,
		})
	}

	if err := s.repo.SaveCanvas(ctx, newWf.ID, steps, edges, notes); err != nil {
		return nil, err
	}

	return s.repo.GetFull(ctx, newWf.ID)
}
