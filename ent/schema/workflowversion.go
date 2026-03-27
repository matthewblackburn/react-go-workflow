package schema

import (
	"react-go-workflow/ent/mixin"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type WorkflowVersion struct {
	ent.Schema
}

func (WorkflowVersion) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.UUID("workflow_id", uuid.UUID{}),
		field.Int("version").
			Positive(),
		field.JSON("snapshot", map[string]any{}).
			Optional(),
		field.Time("published_at").
			Default(time.Now),
	}
}

func (WorkflowVersion) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (WorkflowVersion) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("workflow", Workflow.Type).
			Ref("versions").
			Field("workflow_id").
			Required().
			Unique(),
		edge.To("executions", WorkflowExecution.Type),
	}
}
