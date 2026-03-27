package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type WorkflowExecution struct {
	ent.Schema
}

func (WorkflowExecution) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.UUID("workflow_id", uuid.UUID{}),
		field.UUID("workflow_version_id", uuid.UUID{}).
			Optional().
			Nillable(),
		field.Enum("trigger_type").
			Values("manual", "cron", "webhook", "database_event"),
		field.Enum("status").
			Values("pending", "running", "completed", "failed", "cancelled").
			Default("pending"),
		field.JSON("input", map[string]any{}).
			Optional(),
		field.JSON("output", map[string]any{}).
			Optional(),
		field.String("error").
			MaxLen(5000).
			Optional(),
		field.Time("started_at").
			Optional().
			Nillable(),
		field.Time("completed_at").
			Optional().
			Nillable(),
	}
}

func (WorkflowExecution) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (WorkflowExecution) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("workflow", Workflow.Type).
			Ref("executions").
			Field("workflow_id").
			Required().
			Unique(),
		edge.From("workflow_version", WorkflowVersion.Type).
			Ref("executions").
			Field("workflow_version_id").
			Unique(),
		edge.To("step_executions", StepExecution.Type),
		edge.To("notifications", Notification.Type),
	}
}
