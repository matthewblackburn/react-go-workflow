package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type Notification struct {
	ent.Schema
}

func (Notification) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.UUID("workflow_execution_id", uuid.UUID{}),
		field.UUID("workflow_id", uuid.UUID{}),
		field.String("title").
			MaxLen(500),
		field.String("message").
			MaxLen(5000).
			Optional(),
		field.Enum("status").
			Values("unread", "read").
			Default("unread"),
		field.Enum("severity").
			Values("info", "success", "error").
			Default("info"),
	}
}

func (Notification) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (Notification) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("workflow", Workflow.Type).
			Ref("notifications").
			Field("workflow_id").
			Required().
			Unique(),
		edge.From("workflow_execution", WorkflowExecution.Type).
			Ref("notifications").
			Field("workflow_execution_id").
			Required().
			Unique(),
	}
}
