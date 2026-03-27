package workflow

import (
	"context"

	"react-go-workflow/ent"
	"react-go-workflow/ent/canvasnote"
	"react-go-workflow/ent/edge"
	"react-go-workflow/ent/step"
	"react-go-workflow/ent/stepexecution"
	entworkflow "react-go-workflow/ent/workflow"

	"github.com/google/uuid"
)

type Repository struct {
	client *ent.Client
}

func NewRepository(client *ent.Client) *Repository {
	return &Repository{client: client}
}

func (r *Repository) List(ctx context.Context) ([]*ent.Workflow, error) {
	return r.client.Workflow.Query().
		Order(ent.Desc(entworkflow.FieldDateCreated)).
		All(ctx)
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*ent.Workflow, error) {
	return r.client.Workflow.Get(ctx, id)
}

// GetFull returns a workflow with all steps, edges, and canvas notes eager-loaded.
func (r *Repository) GetFull(ctx context.Context, id uuid.UUID) (*ent.Workflow, error) {
	return r.client.Workflow.Query().
		Where(entworkflow.ID(id)).
		WithSteps(func(q *ent.StepQuery) {
			q.WithStepType()
		}).
		WithEdges().
		WithCanvasNotes().
		WithNotificationSettings().
		Only(ctx)
}

func (r *Repository) Create(ctx context.Context, wf *ent.Workflow) (*ent.Workflow, error) {
	builder := r.client.Workflow.Create().
		SetName(wf.Name).
		SetStatus(wf.Status).
		SetConcurrency(wf.Concurrency)

	if wf.Description != "" {
		builder.SetDescription(wf.Description)
	}
	if wf.TriggerConfig != nil {
		builder.SetTriggerConfig(wf.TriggerConfig)
	}
	if wf.InputSchema != nil {
		builder.SetInputSchema(wf.InputSchema)
	}
	if wf.OutputSchema != nil {
		builder.SetOutputSchema(wf.OutputSchema)
	}
	if wf.WebhookSlug != nil {
		builder.SetWebhookSlug(*wf.WebhookSlug)
	}
	if wf.TimeoutSeconds != nil {
		builder.SetTimeoutSeconds(*wf.TimeoutSeconds)
	}

	return builder.Save(ctx)
}

func (r *Repository) Update(ctx context.Context, id uuid.UUID, wf *ent.Workflow) (*ent.Workflow, error) {
	builder := r.client.Workflow.UpdateOneID(id)

	if wf.Name != "" {
		builder.SetName(wf.Name)
	}
	if wf.Description != "" {
		builder.SetDescription(wf.Description)
	}
	if wf.Status != "" {
		builder.SetStatus(wf.Status)
	}
	if wf.TriggerConfig != nil {
		builder.SetTriggerConfig(wf.TriggerConfig)
	}
	if wf.Concurrency != "" {
		builder.SetConcurrency(wf.Concurrency)
	}
	if wf.TimeoutSeconds != nil {
		builder.SetTimeoutSeconds(*wf.TimeoutSeconds)
	}
	if wf.WebhookSlug != nil {
		builder.SetWebhookSlug(*wf.WebhookSlug)
	}
	if wf.InputSchema != nil {
		if len(wf.InputSchema) == 0 {
			builder.ClearInputSchema()
		} else {
			builder.SetInputSchema(wf.InputSchema)
		}
	}
	if wf.OutputSchema != nil {
		if len(wf.OutputSchema) == 0 {
			builder.ClearOutputSchema()
		} else {
			builder.SetOutputSchema(wf.OutputSchema)
		}
	}

	return builder.Save(ctx)
}

func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
	// Delete edges, steps, canvas notes, then workflow (cascade)
	tx, err := r.client.Tx(ctx)
	if err != nil {
		return err
	}

	_, err = tx.Edge.Delete().Where(edge.WorkflowID(id)).Exec(ctx)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	_, err = tx.Step.Delete().Where(step.WorkflowID(id)).Exec(ctx)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	_, err = tx.CanvasNote.Delete().Where(canvasnote.WorkflowID(id)).Exec(ctx)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	err = tx.Workflow.DeleteOneID(id).Exec(ctx)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

// SaveCanvas performs a bulk upsert of steps, edges, and canvas notes for a workflow.
func (r *Repository) SaveCanvas(ctx context.Context, workflowID uuid.UUID, steps []ent.Step, edges []ent.Edge, notes []ent.CanvasNote) error {
	tx, err := r.client.Tx(ctx)
	if err != nil {
		return err
	}

	// Delete existing edges, step executions, steps, notes
	if _, err := tx.Edge.Delete().Where(edge.WorkflowID(workflowID)).Exec(ctx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.StepExecution.Delete().Where(
		stepexecution.HasStepWith(step.WorkflowID(workflowID)),
	).Exec(ctx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.Step.Delete().Where(step.WorkflowID(workflowID)).Exec(ctx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.CanvasNote.Delete().Where(canvasnote.WorkflowID(workflowID)).Exec(ctx); err != nil {
		_ = tx.Rollback()
		return err
	}

	// Re-create steps
	for _, s := range steps {
		builder := tx.Step.Create().
			SetID(s.ID).
			SetWorkflowID(workflowID).
			SetStepTypeID(s.StepTypeID).
			SetName(s.Name).
			SetPositionX(s.PositionX).
			SetPositionY(s.PositionY).
			SetTimeoutSeconds(s.TimeoutSeconds).
			SetRetryCount(s.RetryCount).
			SetRetryBackoff(s.RetryBackoff).
			SetRetryDelayMs(s.RetryDelayMs)

		if s.Description != "" {
			builder.SetDescription(s.Description)
		}
		if s.Config != nil {
			builder.SetConfig(s.Config)
		}
		if s.InputMapping != nil {
			builder.SetInputMapping(s.InputMapping)
		}

		if _, err := builder.Save(ctx); err != nil {
			_ = tx.Rollback()
			return err
		}
	}

	// Re-create edges
	for _, e := range edges {
		builder := tx.Edge.Create().
			SetID(e.ID).
			SetWorkflowID(workflowID).
			SetSourceStepID(e.SourceStepID).
			SetTargetStepID(e.TargetStepID).
			SetEdgeType(e.EdgeType)

		if e.SourceOutput != "" {
			builder.SetSourceOutput(e.SourceOutput)
		}
		if e.TargetInput != "" {
			builder.SetTargetInput(e.TargetInput)
		}
		if e.Condition != nil {
			builder.SetCondition(e.Condition)
		}

		if _, err := builder.Save(ctx); err != nil {
			_ = tx.Rollback()
			return err
		}
	}

	// Re-create canvas notes
	for _, n := range notes {
		builder := tx.CanvasNote.Create().
			SetID(n.ID).
			SetWorkflowID(workflowID).
			SetPositionX(n.PositionX).
			SetPositionY(n.PositionY).
			SetWidth(n.Width).
			SetHeight(n.Height).
			SetColor(n.Color)

		if n.Content != "" {
			builder.SetContent(n.Content)
		}

		if _, err := builder.Save(ctx); err != nil {
			_ = tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}
