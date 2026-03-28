package engine_test

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"react-go-workflow/ent"
	"react-go-workflow/ent/enttest"
	entwfexec "react-go-workflow/ent/workflowexecution"
	"react-go-workflow/internal/engine"
	"react-go-workflow/internal/engine/runners"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"

	_ "modernc.org/sqlite"
)

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

var testDBCounter int32

func newTestClient(t *testing.T) *ent.Client {
	t.Helper()
	n := atomic.AddInt32(&testDBCounter, 1)
	dsn := fmt.Sprintf("file:testdb%d?mode=memory&_pragma=foreign_keys(1)", n)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Force a single connection so the in-memory DB persists for the test lifetime.
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })

	drv := entsql.OpenDB(dialect.SQLite, db)
	client := enttest.NewClient(t,
		enttest.WithOptions(ent.Driver(drv)),
	)
	t.Cleanup(func() { client.Close() })
	return client
}

func seedStepTypes(t *testing.T, ctx context.Context, client *ent.Client, names ...string) map[string]*ent.StepType {
	t.Helper()
	out := make(map[string]*ent.StepType, len(names))
	for _, n := range names {
		st, err := client.StepType.Create().
			SetName(n).
			SetDisplayName(n).
			SetCategory("action").
			Save(ctx)
		if err != nil {
			t.Fatalf("seed step type %q: %v", n, err)
		}
		out[n] = st
	}
	return out
}

func newExecutor(t *testing.T, client *ent.Client) *engine.Executor {
	t.Helper()
	reg := engine.NewRunnerRegistry()
	runners.RegisterAll(reg)
	bus := engine.NewEventBus()
	encKey := []byte("01234567890123456789012345678901")
	return engine.NewExecutor(client, reg, bus, encKey)
}

func newExecutorWithRegistry(t *testing.T, client *ent.Client, reg *engine.RunnerRegistry) *engine.Executor {
	t.Helper()
	bus := engine.NewEventBus()
	encKey := []byte("01234567890123456789012345678901")
	return engine.NewExecutor(client, reg, bus, encKey)
}

// ---------------------------------------------------------------------------
// fakeRunner -- controllable test double
// ---------------------------------------------------------------------------

type fakeRunner struct {
	mu        sync.Mutex
	callCount int
	failUntil int
	output    map[string]any
}

func (f *fakeRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	f.mu.Lock()
	f.callCount++
	count := f.callCount
	failUntil := f.failUntil
	f.mu.Unlock()

	if count <= failUntil {
		return nil, fmt.Errorf("fakeRunner forced failure (attempt %d)", count)
	}
	if f.output != nil {
		return f.output, nil
	}
	return map[string]any{"ok": true}, nil
}

func (f *fakeRunner) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.callCount
}

// blockingRunner blocks until context is cancelled.
type blockingRunner struct{}

func (b *blockingRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestExecutor_SingleStep(t *testing.T) {
	ctx := context.Background()
	client := newTestClient(t)
	stTypes := seedStepTypes(t, ctx, client, "log")
	exec := newExecutor(t, client)

	wf, err := client.Workflow.Create().
		SetName("single-step-wf").
		SetStatus("active").
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	_, err = client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["log"].ID).
		SetName("step_a").
		SetConfig(map[string]any{"message": "hello"}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	execID, err := exec.Execute(ctx, wf.ID, "manual", nil)
	if err != nil {
		t.Fatal(err)
	}

	result, err := exec.WaitForCompletion(ctx, execID, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != entwfexec.StatusCompleted {
		t.Fatalf("expected status completed, got %s", result.Status)
	}
}

func TestExecutor_LinearChain(t *testing.T) {
	ctx := context.Background()
	client := newTestClient(t)
	stTypes := seedStepTypes(t, ctx, client, "set_variable", "log")
	exec := newExecutor(t, client)

	wf, err := client.Workflow.Create().
		SetName("linear-chain-wf").
		SetStatus("active").
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	stepA, err := client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["set_variable"].ID).
		SetName("step_a").
		SetConfig(map[string]any{
			"variable_name": "value",
			"value":         "hello_from_A",
		}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	stepB, err := client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["log"].ID).
		SetName("step_b").
		SetConfig(map[string]any{
			"message": "{{steps.step_a.output.value}}",
		}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	stepC, err := client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["log"].ID).
		SetName("step_c").
		SetConfig(map[string]any{
			"message": "{{steps.step_b.output.message}}",
		}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	// Edges: A -> B -> C
	_, err = client.Edge.Create().
		SetWorkflowID(wf.ID).
		SetSourceStepID(stepA.ID).
		SetTargetStepID(stepB.ID).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	_, err = client.Edge.Create().
		SetWorkflowID(wf.ID).
		SetSourceStepID(stepB.ID).
		SetTargetStepID(stepC.ID).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	execID, err := exec.Execute(ctx, wf.ID, "manual", nil)
	if err != nil {
		t.Fatal(err)
	}

	result, err := exec.WaitForCompletion(ctx, execID, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != entwfexec.StatusCompleted {
		t.Fatalf("expected completed, got %s", result.Status)
	}

	// Verify step B resolved the template
	for _, se := range result.Edges.StepExecutions {
		if se.Edges.Step != nil && se.Edges.Step.Name == "step_b" {
			if msg, ok := se.Output["message"]; !ok || msg != "hello_from_A" {
				t.Fatalf("step_b output.message: expected 'hello_from_A', got %v", msg)
			}
		}
		if se.Edges.Step != nil && se.Edges.Step.Name == "step_c" {
			if msg, ok := se.Output["message"]; !ok || msg != "hello_from_A" {
				t.Fatalf("step_c output.message: expected 'hello_from_A', got %v", msg)
			}
		}
	}
}

func TestExecutor_ConditionBranching(t *testing.T) {
	ctx := context.Background()
	client := newTestClient(t)
	stTypes := seedStepTypes(t, ctx, client, "condition", "log")
	exec := newExecutor(t, client)

	wf, err := client.Workflow.Create().
		SetName("condition-wf").
		SetStatus("active").
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	condStep, err := client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["condition"].ID).
		SetName("cond").
		SetConfig(map[string]any{
			"field":    "yes",
			"operator": "equals",
			"value":    "yes",
		}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	trueStep, err := client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["log"].ID).
		SetName("true_branch").
		SetConfig(map[string]any{"message": "took true branch"}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	falseStep, err := client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["log"].ID).
		SetName("false_branch").
		SetConfig(map[string]any{"message": "took false branch"}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	// cond --true--> true_branch
	_, err = client.Edge.Create().
		SetWorkflowID(wf.ID).
		SetSourceStepID(condStep.ID).
		SetTargetStepID(trueStep.ID).
		SetSourceOutput("true").
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	// cond --false--> false_branch
	_, err = client.Edge.Create().
		SetWorkflowID(wf.ID).
		SetSourceStepID(condStep.ID).
		SetTargetStepID(falseStep.ID).
		SetSourceOutput("false").
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	execID, err := exec.Execute(ctx, wf.ID, "manual", nil)
	if err != nil {
		t.Fatal(err)
	}

	result, err := exec.WaitForCompletion(ctx, execID, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != entwfexec.StatusCompleted {
		t.Fatalf("expected completed, got %s", result.Status)
	}

	for _, se := range result.Edges.StepExecutions {
		name := ""
		if se.Edges.Step != nil {
			name = se.Edges.Step.Name
		}
		switch name {
		case "true_branch":
			if se.Status.String() != "completed" {
				t.Fatalf("true_branch should be completed, got %s", se.Status)
			}
		case "false_branch":
			if se.Status.String() != "skipped" {
				t.Fatalf("false_branch should be skipped, got %s", se.Status)
			}
		}
	}
}

func TestExecutor_StepFailure(t *testing.T) {
	ctx := context.Background()
	client := newTestClient(t)
	stTypes := seedStepTypes(t, ctx, client, "fake_fail")

	reg := engine.NewRunnerRegistry()
	reg.Register("fake_fail", &fakeRunner{failUntil: 999})
	exec := newExecutorWithRegistry(t, client, reg)

	wf, err := client.Workflow.Create().
		SetName("fail-wf").
		SetStatus("active").
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	_, err = client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["fake_fail"].ID).
		SetName("bad_step").
		SetConfig(map[string]any{}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	execID, err := exec.Execute(ctx, wf.ID, "manual", nil)
	if err != nil {
		t.Fatal(err)
	}

	result, err := exec.WaitForCompletion(ctx, execID, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != entwfexec.StatusFailed {
		t.Fatalf("expected failed, got %s", result.Status)
	}
}

func TestExecutor_Cancel(t *testing.T) {
	ctx := context.Background()
	client := newTestClient(t)
	stTypes := seedStepTypes(t, ctx, client, "fake_slow")

	reg := engine.NewRunnerRegistry()
	reg.Register("fake_slow", &blockingRunner{})
	exec := newExecutorWithRegistry(t, client, reg)

	wf, err := client.Workflow.Create().
		SetName("cancel-wf").
		SetStatus("active").
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	_, err = client.Step.Create().
		SetWorkflowID(wf.ID).
		SetStepTypeID(stTypes["fake_slow"].ID).
		SetName("slow_step").
		SetConfig(map[string]any{}).
		Save(ctx)
	if err != nil {
		t.Fatal(err)
	}

	execID, err := exec.Execute(ctx, wf.ID, "manual", nil)
	if err != nil {
		t.Fatal(err)
	}

	// Give the goroutine time to start the step
	time.Sleep(100 * time.Millisecond)

	cancelled := exec.Cancel(execID)
	if !cancelled {
		t.Fatal("Cancel returned false")
	}

	result, err := exec.WaitForCompletion(ctx, execID, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}

	if result.Status != entwfexec.StatusCancelled {
		t.Fatalf("expected cancelled, got %s", result.Status)
	}
}
