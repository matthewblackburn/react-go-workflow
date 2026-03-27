package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type NotificationSetting struct {
	ent.Schema
}

func (NotificationSetting) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.UUID("workflow_id", uuid.UUID{}),
		field.Bool("enabled").
			Default(true),
		field.Enum("channel").
			Values("in_app", "email", "webhook"),
		field.JSON("config", map[string]any{}).
			Optional(),
		field.Enum("notify_on").
			Values("failure", "success", "all").
			Default("failure"),
	}
}

func (NotificationSetting) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (NotificationSetting) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("workflow", Workflow.Type).
			Ref("notification_settings").
			Field("workflow_id").
			Required().
			Unique(),
	}
}
