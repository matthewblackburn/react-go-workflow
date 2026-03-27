package engine

import (
	"sync"
)

// ExecContext holds the runtime state of a workflow execution.
// It stores step outputs, workflow input, secrets, and env vars
// so the expression resolver can look up values.
type ExecContext struct {
	mu           sync.RWMutex
	WorkflowInput map[string]any
	StepOutputs  map[string]map[string]any // step_name -> output data
	Secrets      map[string]string          // key -> decrypted value
	Env          map[string]string          // env var name -> value
}

// NewExecContext creates a new execution context.
func NewExecContext(workflowInput map[string]any) *ExecContext {
	return &ExecContext{
		WorkflowInput: workflowInput,
		StepOutputs:   make(map[string]map[string]any),
		Secrets:       make(map[string]string),
		Env:           make(map[string]string),
	}
}

// SetStepOutput records the output of a completed step, indexed by both name and ID.
func (c *ExecContext) SetStepOutput(stepName string, stepID string, output map[string]any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.StepOutputs[stepName] = output
	if stepID != "" {
		c.StepOutputs[stepID] = output
	}
}

// GetStepOutput retrieves the output of a step, or nil if not yet available.
func (c *ExecContext) GetStepOutput(stepName string) map[string]any {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.StepOutputs[stepName]
}

// SetSecret adds a decrypted secret to the context.
func (c *ExecContext) SetSecret(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Secrets[key] = value
}

// SetEnv adds an environment variable to the context.
func (c *ExecContext) SetEnv(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Env[key] = value
}
