package mixin

import (
	"context"
	"fmt"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/mixin"
)

// AuditMixin adds date_created and date_updated fields with auto-set hooks.
type AuditMixin struct {
	mixin.Schema
}

func (AuditMixin) Fields() []ent.Field {
	return []ent.Field{
		field.Time("date_created").
			Default(time.Now).
			Immutable(),
		field.Time("date_updated").
			Optional().
			Nillable(),
	}
}

func (AuditMixin) Hooks() []ent.Hook {
	return []ent.Hook{
		onOp(
			func(next ent.Mutator) ent.Mutator {
				return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
					if err := m.SetField("date_created", time.Now()); err != nil {
						return nil, fmt.Errorf("audit: set date_created: %w", err)
					}
					return next.Mutate(ctx, m)
				})
			},
			ent.OpCreate,
		),
		onOp(
			func(next ent.Mutator) ent.Mutator {
				return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
					now := time.Now()
					if err := m.SetField("date_updated", now); err != nil {
						return nil, fmt.Errorf("audit: set date_updated: %w", err)
					}
					_ = m.ResetField("date_created")
					return next.Mutate(ctx, m)
				})
			},
			ent.OpUpdateOne|ent.OpUpdate,
		),
	}
}

func onOp(hk ent.Hook, op ent.Op) ent.Hook {
	return func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
			if m.Op().Is(op) {
				return hk(next).Mutate(ctx, m)
			}
			return next.Mutate(ctx, m)
		})
	}
}
