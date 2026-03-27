package engine

import (
	"context"
	"fmt"
)

// StepResult is the output of a step execution.
type StepResult struct {
	Output map[string]any
	Error  error
}

// StepRunner executes a single step type.
type StepRunner interface {
	// Run executes the step with the given resolved config and input.
	// Returns the step's output data.
	Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error)
}

// RunnerRegistry maps step type names to their runners.
type RunnerRegistry struct {
	runners map[string]StepRunner
}

// NewRunnerRegistry creates a registry with all built-in runners.
func NewRunnerRegistry() *RunnerRegistry {
	return &RunnerRegistry{
		runners: make(map[string]StepRunner),
	}
}

// Register adds a runner for a step type.
func (r *RunnerRegistry) Register(stepTypeName string, runner StepRunner) {
	r.runners[stepTypeName] = runner
}

// Get returns the runner for a step type.
func (r *RunnerRegistry) Get(stepTypeName string) (StepRunner, error) {
	runner, ok := r.runners[stepTypeName]
	if !ok {
		return nil, fmt.Errorf("no runner registered for step type: %s", stepTypeName)
	}
	return runner, nil
}
