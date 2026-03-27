package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type Step struct {
	ent.Schema
}

func (Step) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.UUID("workflow_id", uuid.UUID{}),
		field.UUID("step_type_id", uuid.UUID{}),
		field.String("name").
			NotEmpty().
			MaxLen(255),
		field.String("description").
			MaxLen(1000).
			Optional(),
		field.JSON("config", map[string]any{}).
			Optional(),
		field.Float("position_x").
			Default(0),
		field.Float("position_y").
			Default(0),
		field.JSON("input_mapping", map[string]any{}).
			Optional(),
		field.Int("timeout_seconds").
			Default(30),
		field.Int("retry_count").
			Default(0),
		field.Enum("retry_backoff").
			Values("none", "fixed", "exponential").
			Default("none"),
		field.Int("retry_delay_ms").
			Default(1000),
	}
}

func (Step) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (Step) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("workflow", Workflow.Type).
			Ref("steps").
			Field("workflow_id").
			Required().
			Unique(),
		edge.From("step_type", StepType.Type).
			Ref("steps").
			Field("step_type_id").
			Required().
			Unique(),
		edge.To("source_edges", Edge.Type),
		edge.To("target_edges", Edge.Type),
		edge.To("step_executions", StepExecution.Type),
	}
}
