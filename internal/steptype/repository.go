package steptype

import (
	"context"

	"react-go-workflow/ent"
	entsteptype "react-go-workflow/ent/steptype"

	"github.com/google/uuid"
)

type Repository struct {
	client *ent.Client
}

func NewRepository(client *ent.Client) *Repository {
	return &Repository{client: client}
}

func (r *Repository) List(ctx context.Context) ([]*ent.StepType, error) {
	return r.client.StepType.Query().
		Where(entsteptype.IsActive(true)).
		Order(ent.Asc(entsteptype.FieldCategory), ent.Asc(entsteptype.FieldDisplayName)).
		All(ctx)
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*ent.StepType, error) {
	return r.client.StepType.Get(ctx, id)
}

func (r *Repository) GetByName(ctx context.Context, name string) (*ent.StepType, error) {
	return r.client.StepType.Query().
		Where(entsteptype.Name(name)).
		Only(ctx)
}

func (r *Repository) Create(ctx context.Context, st *ent.StepType) (*ent.StepType, error) {
	builder := r.client.StepType.Create().
		SetName(st.Name).
		SetDisplayName(st.DisplayName).
		SetCategory(st.Category)

	if st.Description != "" {
		builder.SetDescription(st.Description)
	}
	if st.Icon != "" {
		builder.SetIcon(st.Icon)
	}
	if st.ConfigSchema != nil {
		builder.SetConfigSchema(st.ConfigSchema)
	}
	if st.InputSchema != nil {
		builder.SetInputSchema(st.InputSchema)
	}
	if st.OutputSchema != nil {
		builder.SetOutputSchema(st.OutputSchema)
	}

	return builder.Save(ctx)
}

func (r *Repository) Update(ctx context.Context, id uuid.UUID, st *ent.StepType) (*ent.StepType, error) {
	builder := r.client.StepType.UpdateOneID(id)

	if st.DisplayName != "" {
		builder.SetDisplayName(st.DisplayName)
	}
	if st.Description != "" {
		builder.SetDescription(st.Description)
	}
	if st.Icon != "" {
		builder.SetIcon(st.Icon)
	}
	if st.ConfigSchema != nil {
		builder.SetConfigSchema(st.ConfigSchema)
	}

	return builder.Save(ctx)
}

func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.client.StepType.UpdateOneID(id).
		SetIsActive(false).
		Exec(ctx)
}
