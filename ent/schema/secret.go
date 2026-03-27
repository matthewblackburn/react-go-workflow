package schema

import (
	"react-go-workflow/ent/mixin"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"

	"github.com/google/uuid"
)

type Secret struct {
	ent.Schema
}

func (Secret) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New),
		field.String("key").
			Unique().
			NotEmpty().
			MaxLen(255),
		field.Bytes("encrypted_value"),
		field.String("description").
			MaxLen(1000).
			Optional(),
	}
}

func (Secret) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.AuditMixin{},
	}
}

func (Secret) Edges() []ent.Edge {
	return nil
}
