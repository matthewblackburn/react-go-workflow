package engine

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"react-go-workflow/ent"
	entedge "react-go-workflow/ent/edge"
	"react-go-workflow/internal/notification"
	"react-go-workflow/internal/secret"
	"react-go-workflow/ent/step"
	entstepexec "react-go-workflow/ent/stepexecution"
	entworkflow "react-go-workflow/ent/workflow"
	entwfexec "react-go-workflow/ent/workflowexecution"

	"github.com/google/uuid"
)

// Executor runs workflows by building a DAG and dispatching steps.
type Executor struct {
	client   *ent.Client
	registry *RunnerRegistry
	eventBus *EventBus
	encKey   []byte
	mu       sync.Mutex
	cancels  map[uuid.UUID]context.CancelFunc
}

// NewExecutor creates a new workflow executor.
func NewExecutor(client *ent.Client, registry *RunnerRegistry, eventBus *EventBus, encKey []byte) *Executor {
	return &Executor{
		client:   client,
		registry: registry,
		eventBus: eventBus,
		encKey:   encKey,
		cancels:  make(map[uuid.UUID]context.CancelFunc),
	}
}

// Cancel cancels a running execution by ID.
func (e *Executor) Cancel(executionID uuid.UUID) bool {
	e.mu.Lock()
	cancel, ok := e.cancels[executionID]
	e.mu.Unlock()
	if ok {
		cancel()
	}
	return ok
}

// EventBus returns the executor's event bus for external subscribers.
func (e *Executor) EventBus() *EventBus {
	return e.eventBus
}

// WaitForCompletion subscribes to events for an execution and blocks until it
// reaches a terminal state (completed, failed, cancelled) or the timeout expires.
// Returns the final execution record with output.
func (e *Executor) WaitForCompletion(ctx context.Context, executionID uuid.UUID, timeout time.Duration) (*ent.WorkflowExecution, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ch := e.eventBus.Subscribe(executionID)
	defer e.eventBus.Unsubscribe(executionID, ch)

	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("timed out waiting for execution to complete")
		case event, ok := <-ch:
			if !ok {
				// Channel closed — execution finished, fetch from DB
				break
			}
			if event.Type == EventExecutionStatus {
				if event.Status == "completed" || event.Status == "failed" || event.Status == "cancelled" {
					// Fetch the final record with output
					return e.client.WorkflowExecution.Query().
						Where(entwfexec.ID(executionID)).
						WithStepExecutions(func(q *ent.StepExecutionQuery) {
							q.WithStep(func(sq *ent.StepQuery) {
								sq.WithStepType()
							})
						}).
						Only(context.Background())
				}
			}
		}
	}
}

// Execute runs a workflow by ID with the given trigger type and input.
func (e *Executor) Execute(ctx context.Context, workflowID uuid.UUID, triggerType string, input map[string]any) (uuid.UUID, error) {
	// Load workflow with steps and edges
	wf, err := e.client.Workflow.Query().
		Where(entworkflow.ID(workflowID)).
		WithSteps(func(q *ent.StepQuery) {
			q.WithStepType()
		}).
		WithEdges().
		Only(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("load workflow: %w", err)
	}

	// Check concurrency policy
	if wf.Concurrency == entworkflow.ConcurrencySkip {
		running, err := e.client.WorkflowExecution.Query().
			Where(
				entwfexec.WorkflowID(workflowID),
				entwfexec.StatusEQ(entwfexec.StatusRunning),
			).
			Exist(ctx)
		if err != nil {
			return uuid.Nil, err
		}
		if running {
			return uuid.Nil, fmt.Errorf("execution skipped: another execution is running")
		}
	}

	// Create execution record
	now := time.Now()
	exec, err := e.client.WorkflowExecution.Create().
		SetWorkflowID(workflowID).
		SetTriggerType(entwfexec.TriggerType(triggerType)).
		SetStatus(entwfexec.StatusRunning).
		SetStartedAt(now).
		SetInput(input).
		Save(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("create execution: %w", err)
	}

	executionID := exec.ID
	slog.Info("execution started", "execution_id", executionID, "workflow", wf.Name)

	e.eventBus.Publish(executionID, Event{
		Type:      EventExecutionStatus,
		Status:    "running",
		Timestamp: now,
	})

	// Create step execution records
	stepExecs := make(map[uuid.UUID]*ent.StepExecution)
	for _, s := range wf.Edges.Steps {
		se, err := e.client.StepExecution.Create().
			SetWorkflowExecutionID(executionID).
			SetStepID(s.ID).
			SetStatus(entstepexec.StatusPending).
			Save(ctx)
		if err != nil {
			return executionID, fmt.Errorf("create step execution: %w", err)
		}
		stepExecs[s.ID] = se
	}

	// Run in background with cancellable context
	ctx2, cancel := context.WithCancel(context.Background())
	e.mu.Lock()
	e.cancels[executionID] = cancel
	e.mu.Unlock()

	go func() {
		defer func() {
			e.mu.Lock()
			delete(e.cancels, executionID)
			e.mu.Unlock()
		}()
		e.executeDAG(ctx2, wf, exec, stepExecs, input)
	}()

	return executionID, nil
}

func (e *Executor) executeDAG(ctx context.Context, wf *ent.Workflow, exec *ent.WorkflowExecution, stepExecs map[uuid.UUID]*ent.StepExecution, input map[string]any) {
	executionID := exec.ID

	// Apply workflow-level timeout
	if wf.TimeoutSeconds != nil && *wf.TimeoutSeconds > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(*wf.TimeoutSeconds)*time.Second)
		defer cancel()
	}

	// Build lookup maps
	stepsByID := make(map[uuid.UUID]*ent.Step)
	stepsByName := make(map[string]*ent.Step)
	for _, s := range wf.Edges.Steps {
		stepsByID[s.ID] = s
		stepsByName[s.Name] = s
	}

	// Build DAG: adjacency list and in-degree count
	// Normal edges define dependencies; error edges are followed on failure
	normalDeps := make(map[uuid.UUID][]uuid.UUID)   // step -> steps it depends on
	normalEdges := make(map[uuid.UUID][]*ent.Edge)   // source -> outgoing normal edges
	errorEdges := make(map[uuid.UUID][]*ent.Edge)    // source -> outgoing error edges
	inDegree := make(map[uuid.UUID]int)

	for _, s := range wf.Edges.Steps {
		inDegree[s.ID] = 0
	}

	for _, edge := range wf.Edges.Edges {
		if edge.EdgeType == entedge.EdgeTypeError {
			errorEdges[edge.SourceStepID] = append(errorEdges[edge.SourceStepID], edge)
		} else {
			normalDeps[edge.TargetStepID] = append(normalDeps[edge.TargetStepID], edge.SourceStepID)
			normalEdges[edge.SourceStepID] = append(normalEdges[edge.SourceStepID], edge)
			inDegree[edge.TargetStepID]++
		}
	}

	// Track implicit downstream steps (source → list of target IDs)
	implicitDownstream := make(map[uuid.UUID][]uuid.UUID)

	// Also extract implicit dependencies from template references in step configs.
	// If a step's config references {{steps.<name_or_id>.output...}}, that step
	// must complete first — even if no explicit edge was saved.
	existingEdges := make(map[string]bool) // "sourceID->targetID"
	for _, edge := range wf.Edges.Edges {
		existingEdges[edge.SourceStepID.String()+"->"+edge.TargetStepID.String()] = true
	}

	for _, s := range wf.Edges.Steps {
		refs := ExtractStepRefs(s.Config)
		for ref := range refs {
			// Resolve ref to a step ID (could be name or UUID)
			var sourceID uuid.UUID
			if refStep, ok := stepsByName[ref]; ok {
				sourceID = refStep.ID
			} else if parsed, err := uuid.Parse(ref); err == nil {
				if _, ok := stepsByID[parsed]; ok {
					sourceID = parsed
				}
			}

			if sourceID == uuid.Nil || sourceID == s.ID {
				continue // self-ref or unresolved
			}

			edgeKey := sourceID.String() + "->" + s.ID.String()
			if existingEdges[edgeKey] {
				continue // already have an explicit edge
			}

			// Add implicit dependency
			existingEdges[edgeKey] = true
			normalDeps[s.ID] = append(normalDeps[s.ID], sourceID)
			implicitDownstream[sourceID] = append(implicitDownstream[sourceID], s.ID)
			inDegree[s.ID]++
			slog.Debug("added implicit dependency from template reference",
				"source", sourceID, "target", s.ID, "ref", ref)
		}
	}

	// Execution context for expression resolution
	execCtx := NewExecContext(input)

	// Load secrets from database into execution context
	if secrets, err := e.client.Secret.Query().All(ctx); err != nil {
		slog.Warn("failed to load secrets for execution", "error", err)
	} else {
		for _, s := range secrets {
			decrypted, err := secret.Decrypt(s.EncryptedValue, e.encKey)
			if err != nil {
				slog.Warn("failed to decrypt secret", "key", s.Key, "error", err)
				continue
			}
			execCtx.SetSecret(s.Key, string(decrypted))
		}
	}

	// Track results
	stepOutputs := make(map[uuid.UUID]map[string]any)
	done := make(map[uuid.UUID]bool) // completed or failed
	var executionErr error

	// Wave-based execution: process steps in rounds until no more are ready
	for {
		// Find steps that are ready (all dependencies satisfied, not yet done)
		var wave []uuid.UUID
		for _, s := range wf.Edges.Steps {
			if done[s.ID] {
				continue
			}
			if inDegree[s.ID] <= 0 {
				wave = append(wave, s.ID)
			}
		}

		if len(wave) == 0 {
			break // No more steps to run
		}

		// Execute all ready steps in parallel
		type stepResultPair struct {
			stepID uuid.UUID
			result StepResult
		}
		results := make([]stepResultPair, len(wave))
		var wg sync.WaitGroup

		for i, stepID := range wave {
			done[stepID] = true // Mark as in-flight to prevent re-scheduling
			s := stepsByID[stepID]
			if s == nil {
				continue
			}

			wg.Add(1)
			go func(idx int, s *ent.Step) {
				defer wg.Done()
				results[idx] = stepResultPair{
					stepID: s.ID,
					result: e.executeStep(ctx, s, execCtx, executionID, stepExecs[s.ID]),
				}
			}(i, s)
		}
		wg.Wait()

		// Process results and update in-degrees for next wave
		for _, r := range results {
			s := stepsByID[r.stepID]
			if s == nil {
				continue
			}

			if r.result.Error != nil {
				slog.Warn("step failed", "step", s.Name, "error", r.result.Error)

				// Follow error edges
				for _, edge := range errorEdges[s.ID] {
					execCtx.SetStepOutput(s.Name, s.ID.String(), map[string]any{
						"error":       r.result.Error.Error(),
						"failed_step": s.Name,
					})
					inDegree[edge.TargetStepID] = 0 // Make error handler ready
				}

				if len(errorEdges[s.ID]) == 0 {
					executionErr = fmt.Errorf("step '%s' failed: %w", s.Name, r.result.Error)
				}
			} else {
				stepOutputs[s.ID] = r.result.Output
				execCtx.SetStepOutput(s.Name, s.ID.String(), r.result.Output)

				// Decrement in-degree for downstream steps (explicit edges)
				for _, edge := range normalEdges[s.ID] {
					// For condition steps, only follow matching edges
					if s.Edges.StepType != nil && s.Edges.StepType.Name == "condition" {
						condResult := "false"
						if res, ok := r.result.Output["result"]; ok && res == true {
							condResult = "true"
						}
						if edge.SourceOutput != condResult {
							continue
						}
					}
					inDegree[edge.TargetStepID]--
				}
				// Decrement in-degree for implicit downstream steps (template references)
				for _, targetID := range implicitDownstream[s.ID] {
					inDegree[targetID]--
				}
			}
		}

		// Check for context cancellation (timeout or user cancel)
		if ctx.Err() != nil {
			if ctx.Err() == context.Canceled {
				executionErr = fmt.Errorf("execution cancelled by user")
			} else {
				executionErr = fmt.Errorf("workflow timed out")
			}
			break
		}
	}

	// Update execution record
	now := time.Now()
	if executionErr != nil || ctx.Err() != nil {
		errMsg := ""
		status := entwfexec.StatusFailed
		eventStatus := "failed"

		if ctx.Err() == context.Canceled {
			errMsg = "execution cancelled by user"
			status = entwfexec.StatusCancelled
			eventStatus = "cancelled"
		} else if ctx.Err() != nil {
			errMsg = "workflow timed out"
		} else {
			errMsg = executionErr.Error()
		}

		e.client.WorkflowExecution.UpdateOneID(executionID).
			SetStatus(status).
			SetError(errMsg).
			SetCompletedAt(now).
			Exec(context.Background())

		e.eventBus.Publish(executionID, Event{
			Type:        EventExecutionStatus,
			Status:      eventStatus,
			Error:       errMsg,
			Timestamp:   now,
			CompletedAt: &now,
		})

		slog.Info("execution ended", "execution_id", executionID, "status", eventStatus, "error", errMsg)
		notification.Dispatch(e.client, wf.ID, wf.Name, executionID, eventStatus, errMsg)
	} else {
		// Collect all step outputs keyed by step ID, with name included
		allStepOutputs := make(map[string]any)
		for stepID, output := range stepOutputs {
			if s := stepsByID[stepID]; s != nil {
				allStepOutputs[stepID.String()] = map[string]any{
					"name":   s.Name,
					"output": output,
				}
			}
		}

		// Build final output: if output_schema (mapping) is defined, resolve expressions
		// and include both the mapped output and full step outputs
		finalOutput := map[string]any{
			"steps": allStepOutputs,
		}
		if wf.OutputSchema != nil && len(wf.OutputSchema) > 0 {
			mapped := make(map[string]any)
			for key, expr := range wf.OutputSchema {
				if exprStr, ok := expr.(string); ok {
					resolved, err := ResolveString(exprStr, execCtx)
					if err == nil {
						mapped[key] = resolved
					} else {
						mapped[key] = nil
					}
				} else {
					mapped[key] = expr
				}
			}
			finalOutput["result"] = mapped
		}

		e.client.WorkflowExecution.UpdateOneID(executionID).
			SetStatus(entwfexec.StatusCompleted).
			SetOutput(finalOutput).
			SetCompletedAt(now).
			Exec(context.Background())

		e.eventBus.Publish(executionID, Event{
			Type:        EventExecutionStatus,
			Status:      "completed",
			Output:      finalOutput,
			Timestamp:   now,
			CompletedAt: &now,
		})

		slog.Info("execution completed", "execution_id", executionID)
		notification.Dispatch(e.client, wf.ID, wf.Name, executionID, "completed", "")
	}
}

func (e *Executor) executeStep(ctx context.Context, s *ent.Step, execCtx *ExecContext, executionID uuid.UUID, stepExec *ent.StepExecution) StepResult {
	stepID := s.ID
	stepName := s.Name
	now := time.Now()

	// Mark step as running
	e.client.StepExecution.UpdateOneID(stepExec.ID).
		SetStatus(entstepexec.StatusRunning).
		SetStartedAt(now).
		Exec(ctx)

	e.eventBus.Publish(executionID, Event{
		Type:      EventStepStatus,
		StepID:    &stepID,
		StepName:  stepName,
		Status:    "running",
		Timestamp: now,
		StartedAt: &now,
	})

	// Get runner
	stepTypeName := "unknown"
	if s.Edges.StepType != nil {
		stepTypeName = s.Edges.StepType.Name
	}

	runner, err := e.registry.Get(stepTypeName)
	if err != nil {
		return e.failStep(ctx, stepExec, executionID, stepID, stepName, err)
	}

	// Resolve expressions in step config
	resolvedConfig, err := ResolveMap(s.Config, execCtx)
	if err != nil {
		return e.failStep(ctx, stepExec, executionID, stepID, stepName, fmt.Errorf("resolve config: %w", err))
	}

	// Resolve input mapping
	resolvedInput, err := ResolveMap(s.InputMapping, execCtx)
	if err != nil {
		return e.failStep(ctx, stepExec, executionID, stepID, stepName, fmt.Errorf("resolve input: %w", err))
	}

	// Apply step timeout
	stepCtx := ctx
	if s.TimeoutSeconds > 0 {
		var cancel context.CancelFunc
		stepCtx, cancel = context.WithTimeout(ctx, time.Duration(s.TimeoutSeconds)*time.Second)
		defer cancel()
	}

	// Execute with retries
	var output map[string]any
	maxAttempts := s.RetryCount + 1
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		e.eventBus.Publish(executionID, Event{
			Type:      EventStepLog,
			StepID:    &stepID,
			StepName:  stepName,
			Message:   fmt.Sprintf("Running %s (attempt %d/%d)", stepTypeName, attempt, maxAttempts),
			Timestamp: time.Now(),
		})

		output, err = runner.Run(stepCtx, resolvedConfig, resolvedInput)
		if err == nil {
			break
		}

		if attempt < maxAttempts {
			delay := e.retryDelay(s, attempt)
			e.eventBus.Publish(executionID, Event{
				Type:      EventStepLog,
				StepID:    &stepID,
				StepName:  stepName,
				Message:   fmt.Sprintf("Attempt %d failed: %s. Retrying in %s...", attempt, err, delay),
				Timestamp: time.Now(),
			})
			time.Sleep(delay)
		}
	}

	if err != nil {
		return e.failStep(ctx, stepExec, executionID, stepID, stepName, err)
	}

	// Mark step as completed
	completedAt := time.Now()
	e.client.StepExecution.UpdateOneID(stepExec.ID).
		SetStatus(entstepexec.StatusCompleted).
		SetOutput(output).
		SetCompletedAt(completedAt).
		SetAttempt(maxAttempts).
		Exec(ctx)

	e.eventBus.Publish(executionID, Event{
		Type:        EventStepStatus,
		StepID:      &stepID,
		StepName:    stepName,
		Status:      "completed",
		Output:      output,
		Timestamp:   completedAt,
		CompletedAt: &completedAt,
	})

	return StepResult{Output: output}
}

func (e *Executor) failStep(ctx context.Context, stepExec *ent.StepExecution, executionID uuid.UUID, stepID uuid.UUID, stepName string, err error) StepResult {
	now := time.Now()
	e.client.StepExecution.UpdateOneID(stepExec.ID).
		SetStatus(entstepexec.StatusFailed).
		SetError(err.Error()).
		SetCompletedAt(now).
		Exec(ctx)

	e.eventBus.Publish(executionID, Event{
		Type:        EventStepStatus,
		StepID:      &stepID,
		StepName:    stepName,
		Status:      "failed",
		Error:       err.Error(),
		Timestamp:   now,
		CompletedAt: &now,
	})

	return StepResult{Error: err}
}

func (e *Executor) retryDelay(s *ent.Step, attempt int) time.Duration {
	baseDelay := time.Duration(s.RetryDelayMs) * time.Millisecond
	switch s.RetryBackoff {
	case step.RetryBackoffExponential:
		return baseDelay * (1 << (attempt - 1))
	case step.RetryBackoffFixed:
		return baseDelay
	default:
		return 0
	}
}
