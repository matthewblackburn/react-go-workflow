package execution

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"react-go-workflow/ent"
	entworkflow "react-go-workflow/ent/workflow"
	"react-go-workflow/ent/workflowexecution"
	"react-go-workflow/internal/engine"
	"react-go-workflow/internal/testutil"

	"github.com/google/uuid"
)

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}

type testEnv struct {
	handler *Handler
	client  *ent.Client
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	client := testutil.NewTestClient(t)
	t.Cleanup(func() { _ = client.Close() })

	registry := engine.NewRunnerRegistry()
	eventBus := engine.NewEventBus()
	executor := engine.NewExecutor(client, registry, eventBus, nil)

	return &testEnv{
		handler: NewHandler(client, executor),
		client:  client,
	}
}

// createTestWorkflow creates a minimal workflow in the DB and returns its ID.
func (e *testEnv) createTestWorkflow(t *testing.T, name string) uuid.UUID {
	t.Helper()
	wf, err := e.client.Workflow.Create().
		SetName(name).
		SetStatus(entworkflow.StatusActive).
		SetConcurrency(entworkflow.ConcurrencyAllow).
		Save(context.Background())
	if err != nil {
		t.Fatalf("create test workflow: %v", err)
	}
	return wf.ID
}

// createTestExecution creates a workflow execution in the DB.
func (e *testEnv) createTestExecution(t *testing.T, workflowID uuid.UUID, status workflowexecution.Status, triggerType workflowexecution.TriggerType) uuid.UUID {
	t.Helper()
	exec, err := e.client.WorkflowExecution.Create().
		SetWorkflowID(workflowID).
		SetStatus(status).
		SetTriggerType(triggerType).
		Save(context.Background())
	if err != nil {
		t.Fatalf("create test execution: %v", err)
	}
	return exec.ID
}

func doRequest(handler http.HandlerFunc, method, path string, body any, params map[string]string) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	r := httptest.NewRequest(method, path, &buf)
	r.Header.Set("Content-Type", "application/json")
	if params != nil {
		r = testutil.ChiContext(r, params)
	}
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}

func TestExecutionHandler(t *testing.T) {
	t.Run("List empty", func(t *testing.T) {
		env := newTestEnv(t)
		w := doRequest(env.handler.List, http.MethodGet, "/v1/executions", nil, nil)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		data := resp["data"].([]any)
		if len(data) != 0 {
			t.Errorf("data length = %d, want 0", len(data))
		}
		if resp["total"].(float64) != 0 {
			t.Errorf("total = %v, want 0", resp["total"])
		}
	})

	t.Run("List with data", func(t *testing.T) {
		env := newTestEnv(t)
		wfID := env.createTestWorkflow(t, "Test WF")
		env.createTestExecution(t, wfID, workflowexecution.StatusCompleted, workflowexecution.TriggerTypeManual)
		env.createTestExecution(t, wfID, workflowexecution.StatusRunning, workflowexecution.TriggerTypeManual)
		env.createTestExecution(t, wfID, workflowexecution.StatusFailed, workflowexecution.TriggerTypeCron)

		w := doRequest(env.handler.List, http.MethodGet, "/v1/executions", nil, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		data := resp["data"].([]any)
		if len(data) != 3 {
			t.Errorf("data length = %d, want 3", len(data))
		}
		if resp["total"].(float64) != 3 {
			t.Errorf("total = %v, want 3", resp["total"])
		}
	})

	t.Run("List with status filter", func(t *testing.T) {
		env := newTestEnv(t)
		wfID := env.createTestWorkflow(t, "Filter WF")
		env.createTestExecution(t, wfID, workflowexecution.StatusCompleted, workflowexecution.TriggerTypeManual)
		env.createTestExecution(t, wfID, workflowexecution.StatusRunning, workflowexecution.TriggerTypeManual)
		env.createTestExecution(t, wfID, workflowexecution.StatusFailed, workflowexecution.TriggerTypeCron)

		r := httptest.NewRequest(http.MethodGet, "/v1/executions?status=is:running", nil)
		w := httptest.NewRecorder()
		env.handler.List(w, r)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		data := resp["data"].([]any)
		if len(data) != 1 {
			t.Errorf("data length = %d, want 1", len(data))
		}
		if resp["total"].(float64) != 1 {
			t.Errorf("total = %v, want 1", resp["total"])
		}
	})

	t.Run("List with multi-status filter", func(t *testing.T) {
		env := newTestEnv(t)
		wfID := env.createTestWorkflow(t, "Multi Filter WF")
		env.createTestExecution(t, wfID, workflowexecution.StatusCompleted, workflowexecution.TriggerTypeManual)
		env.createTestExecution(t, wfID, workflowexecution.StatusRunning, workflowexecution.TriggerTypeManual)
		env.createTestExecution(t, wfID, workflowexecution.StatusFailed, workflowexecution.TriggerTypeCron)

		r := httptest.NewRequest(http.MethodGet, "/v1/executions?status=any:running,failed", nil)
		w := httptest.NewRecorder()
		env.handler.List(w, r)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		data := resp["data"].([]any)
		if len(data) != 2 {
			t.Errorf("data length = %d, want 2", len(data))
		}
	})

	t.Run("Get success", func(t *testing.T) {
		env := newTestEnv(t)
		wfID := env.createTestWorkflow(t, "Get WF")
		execID := env.createTestExecution(t, wfID, workflowexecution.StatusCompleted, workflowexecution.TriggerTypeManual)

		w := doRequest(env.handler.Get, http.MethodGet, "/v1/executions/"+execID.String(), nil,
			map[string]string{"id": execID.String()})
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["id"] != execID.String() {
			t.Errorf("id = %v, want %v", resp["id"], execID.String())
		}
		if resp["status"] != "completed" {
			t.Errorf("status = %v, want %q", resp["status"], "completed")
		}
	})

	t.Run("Get not found returns 404", func(t *testing.T) {
		env := newTestEnv(t)
		fakeID := uuid.New().String()
		w := doRequest(env.handler.Get, http.MethodGet, "/v1/executions/"+fakeID, nil,
			map[string]string{"id": fakeID})
		if w.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
		}
	})

	t.Run("ListByWorkflow", func(t *testing.T) {
		env := newTestEnv(t)
		wfID := env.createTestWorkflow(t, "ByWorkflow WF")
		env.createTestExecution(t, wfID, workflowexecution.StatusCompleted, workflowexecution.TriggerTypeManual)
		env.createTestExecution(t, wfID, workflowexecution.StatusRunning, workflowexecution.TriggerTypeCron)

		// Create another workflow with an execution — should not appear
		otherID := env.createTestWorkflow(t, "Other WF")
		env.createTestExecution(t, otherID, workflowexecution.StatusCompleted, workflowexecution.TriggerTypeManual)

		w := doRequest(env.handler.ListByWorkflow, http.MethodGet, "/v1/workflows/"+wfID.String()+"/executions", nil,
			map[string]string{"id": wfID.String()})
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]any)
		if len(data) != 2 {
			t.Errorf("data length = %d, want 2", len(data))
		}
	})

	t.Run("List with workflow_id filter", func(t *testing.T) {
		env := newTestEnv(t)
		wfID := env.createTestWorkflow(t, "WF Filter")
		env.createTestExecution(t, wfID, workflowexecution.StatusCompleted, workflowexecution.TriggerTypeManual)

		otherID := env.createTestWorkflow(t, "Other WF 2")
		env.createTestExecution(t, otherID, workflowexecution.StatusCompleted, workflowexecution.TriggerTypeManual)

		r := httptest.NewRequest(http.MethodGet, "/v1/executions?workflow_id="+wfID.String(), nil)
		w := httptest.NewRecorder()
		env.handler.List(w, r)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]any)
		if len(data) != 1 {
			t.Errorf("data length = %d, want 1", len(data))
		}
	})
}
