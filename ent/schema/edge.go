package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	entedge "entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type Edge struct {
	ent.Schema
}

func (Edge) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.UUID("workflow_id", uuid.UUID{}),
		field.UUID("source_step_id", uuid.UUID{}),
		field.UUID("target_step_id", uuid.UUID{}),
		field.String("source_output").
			MaxLen(255).
			Optional(),
		field.String("target_input").
			MaxLen(255).
			Optional(),
		field.Enum("edge_type").
			Values("normal", "error").
			Default("normal"),
		field.JSON("condition", map[string]any{}).
			Optional(),
	}
}

func (Edge) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (Edge) Edges() []ent.Edge {
	return []ent.Edge{
		entedge.From("workflow", Workflow.Type).
			Ref("edges").
			Field("workflow_id").
			Required().
			Unique(),
		entedge.From("source_step", Step.Type).
			Ref("source_edges").
			Field("source_step_id").
			Required().
			Unique(),
		entedge.From("target_step", Step.Type).
			Ref("target_edges").
			Field("target_step_id").
			Required().
			Unique(),
	}
}
