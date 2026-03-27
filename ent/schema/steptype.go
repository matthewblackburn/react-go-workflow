package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type StepType struct {
	ent.Schema
}

func (StepType) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.String("name").
			Unique().
			NotEmpty().
			MaxLen(100),
		field.String("display_name").
			NotEmpty().
			MaxLen(200),
		field.Enum("category").
			Values("trigger", "action", "logic", "utility"),
		field.String("description").
			MaxLen(1000).
			Optional(),
		field.String("icon").
			MaxLen(100).
			Optional(),
		field.JSON("config_schema", map[string]any{}).
			Optional(),
		field.JSON("input_schema", map[string]any{}).
			Optional(),
		field.JSON("output_schema", map[string]any{}).
			Optional(),
		field.Bool("is_active").
			Default(true),
	}
}

func (StepType) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (StepType) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("steps", Step.Type),
	}
}
