package steptype

import (
	"context"

	"react-go-workflow/ent"

	"github.com/google/uuid"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) List(ctx context.Context) ([]*ent.StepType, error) {
	return s.repo.List(ctx)
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*ent.StepType, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *Service) Create(ctx context.Context, st *ent.StepType) (*ent.StepType, error) {
	return s.repo.Create(ctx, st)
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, st *ent.StepType) (*ent.StepType, error) {
	return s.repo.Update(ctx, id, st)
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}
