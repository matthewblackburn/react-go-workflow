package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type CanvasNote struct {
	ent.Schema
}

func (CanvasNote) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.UUID("workflow_id", uuid.UUID{}),
		field.String("content").
			MaxLen(2000).
			Optional(),
		field.String("color").
			MaxLen(50).
			Default("yellow"),
		field.Float("position_x").
			Default(0),
		field.Float("position_y").
			Default(0),
		field.Float("width").
			Default(200),
		field.Float("height").
			Default(150),
	}
}

func (CanvasNote) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (CanvasNote) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("workflow", Workflow.Type).
			Ref("canvas_notes").
			Field("workflow_id").
			Required().
			Unique(),
	}
}
