package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type Workflow struct {
	ent.Schema
}

func (Workflow) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.String("name").
			NotEmpty().
			MaxLen(255),
		field.String("description").
			MaxLen(2000).
			Optional(),
		field.Enum("status").
			Values("draft", "active", "archived").
			Default("draft"),
		field.JSON("trigger_config", map[string]any{}).
			Optional(),
		field.JSON("input_schema", map[string]any{}).
			Optional(),
		field.JSON("output_schema", map[string]any{}).
			Optional(),
		field.String("webhook_slug").
			Unique().
			Optional().
			Nillable().
			MaxLen(255),
		field.Enum("concurrency").
			Values("allow", "skip", "queue").
			Default("allow"),
		field.Int("timeout_seconds").
			Optional().
			Nillable(),
	}
}

func (Workflow) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (Workflow) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("steps", Step.Type),
		edge.To("edges", Edge.Type),
		edge.To("canvas_notes", CanvasNote.Type),
		edge.To("versions", WorkflowVersion.Type),
		edge.To("executions", WorkflowExecution.Type),
		edge.To("notification_settings", NotificationSetting.Type),
		edge.To("notifications", Notification.Type),
	}
}
