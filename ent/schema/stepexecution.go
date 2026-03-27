package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type StepExecution struct {
	ent.Schema
}

func (StepExecution) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.UUID("workflow_execution_id", uuid.UUID{}),
		field.UUID("step_id", uuid.UUID{}),
		field.Enum("status").
			Values("pending", "running", "completed", "failed", "skipped").
			Default("pending"),
		field.JSON("input", map[string]any{}).
			Optional(),
		field.JSON("output", map[string]any{}).
			Optional(),
		field.String("error").
			MaxLen(5000).
			Optional(),
		field.Int("attempt").
			Default(1),
		field.Time("started_at").
			Optional().
			Nillable(),
		field.Time("completed_at").
			Optional().
			Nillable(),
	}
}

func (StepExecution) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (StepExecution) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("workflow_execution", WorkflowExecution.Type).
			Ref("step_executions").
			Field("workflow_execution_id").
			Required().
			Unique(),
		edge.From("step", Step.Type).
			Ref("step_executions").
			Field("step_id").
			Required().
			Unique(),
	}
}
