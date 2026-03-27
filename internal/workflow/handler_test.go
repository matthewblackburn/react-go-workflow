package workflow

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	entsteptype "react-go-workflow/ent/steptype"
	"react-go-workflow/internal/engine"
	"react-go-workflow/internal/testutil"
	"react-go-workflow/internal/trigger"

	"github.com/google/uuid"
)

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}

func newTestHandler(t *testing.T) *Handler {
	t.Helper()
	client := testutil.NewTestClient(t)
	t.Cleanup(func() { _ = client.Close() })

	repo := NewRepository(client)
	svc := NewService(repo)

	// Create a CronScheduler with a nil executor — we won't trigger cron
	// executions in handler tests, but Sync/Remove are called in Update/Delete.
	registry := engine.NewRunnerRegistry()
	eventBus := engine.NewEventBus()
	executor := engine.NewExecutor(client, registry, eventBus, nil)
	cronScheduler := trigger.NewCronScheduler(client, executor)

	return NewHandler(svc, client, cronScheduler)
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

// createWorkflow is a helper that creates a workflow and returns the parsed response.
func createWorkflow(t *testing.T, h *Handler, name string) map[string]any {
	t.Helper()
	body := map[string]string{"name": name}
	w := doRequest(h.Create, http.MethodPost, "/v1/workflows", body, nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("create workflow %q: status = %d, body: %s", name, w.Code, w.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return resp
}

func TestWorkflowHandler(t *testing.T) {
	t.Run("Create success", func(t *testing.T) {
		h := newTestHandler(t)
		resp := createWorkflow(t, h, "My Workflow")

		if resp["name"] != "My Workflow" {
			t.Errorf("name = %v, want %q", resp["name"], "My Workflow")
		}
		if resp["status"] != "draft" {
			t.Errorf("status = %v, want %q", resp["status"], "draft")
		}
	})

	t.Run("Create missing name returns 400", func(t *testing.T) {
		h := newTestHandler(t)
		body := map[string]string{"description": "no name"}
		w := doRequest(h.Create, http.MethodPost, "/v1/workflows", body, nil)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
		}
	})

	t.Run("List empty", func(t *testing.T) {
		h := newTestHandler(t)
		w := doRequest(h.List, http.MethodGet, "/v1/workflows", nil, nil)

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

	t.Run("List with pagination", func(t *testing.T) {
		h := newTestHandler(t)
		for i := 0; i < 5; i++ {
			createWorkflow(t, h, "Workflow "+string(rune('A'+i)))
		}

		r := httptest.NewRequest(http.MethodGet, "/v1/workflows?limit=2&offset=2", nil)
		w := httptest.NewRecorder()
		h.List(w, r)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		data := resp["data"].([]any)
		if len(data) != 2 {
			t.Errorf("data length = %d, want 2", len(data))
		}
		if resp["total"].(float64) != 5 {
			t.Errorf("total = %v, want 5", resp["total"])
		}
	})

	t.Run("Get success", func(t *testing.T) {
		h := newTestHandler(t)
		created := createWorkflow(t, h, "Get Workflow")
		id := created["id"].(string)

		w := doRequest(h.Get, http.MethodGet, "/v1/workflows/"+id, nil,
			map[string]string{"id": id})
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["name"] != "Get Workflow" {
			t.Errorf("name = %v, want %q", resp["name"], "Get Workflow")
		}
	})

	t.Run("Get not found returns 404", func(t *testing.T) {
		h := newTestHandler(t)
		fakeID := uuid.New().String()
		w := doRequest(h.Get, http.MethodGet, "/v1/workflows/"+fakeID, nil,
			map[string]string{"id": fakeID})
		if w.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
		}
	})

	t.Run("Update status to active", func(t *testing.T) {
		h := newTestHandler(t)
		created := createWorkflow(t, h, "Activate Me")
		id := created["id"].(string)

		updateBody := map[string]string{"status": "active"}
		w := doRequest(h.Update, http.MethodPatch, "/v1/workflows/"+id, updateBody,
			map[string]string{"id": id})
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["status"] != "active" {
			t.Errorf("status = %v, want %q", resp["status"], "active")
		}
	})

	t.Run("Delete returns 204", func(t *testing.T) {
		h := newTestHandler(t)
		created := createWorkflow(t, h, "Delete Me")
		id := created["id"].(string)

		w := doRequest(h.Delete, http.MethodDelete, "/v1/workflows/"+id, nil,
			map[string]string{"id": id})
		if w.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNoContent, w.Body.String())
		}

		// Verify it's gone
		w = doRequest(h.Get, http.MethodGet, "/v1/workflows/"+id, nil,
			map[string]string{"id": id})
		if w.Code != http.StatusNotFound {
			t.Fatalf("get after delete: status = %d, want %d", w.Code, http.StatusNotFound)
		}
	})

	t.Run("SaveCanvas with steps and notes", func(t *testing.T) {
		h := newTestHandler(t)
		created := createWorkflow(t, h, "Canvas Workflow")
		id := created["id"].(string)

		// We need a step type for the canvas steps.
		// Create one directly via the ent client.
		st, err := h.client.StepType.Create().
			SetName("http_request").
			SetDisplayName("HTTP Request").
			SetCategory(entsteptype.CategoryAction).
			Save(testutil.Ctx())
		if err != nil {
			t.Fatalf("create step type: %v", err)
		}

		stepID := uuid.New().String()
		noteID := uuid.New().String()

		canvasBody := map[string]any{
			"steps": []map[string]any{
				{
					"id":           stepID,
					"step_type_id": st.ID.String(),
					"name":         "Fetch Data",
					"position_x":   100.0,
					"position_y":   200.0,
				},
			},
			"edges": []map[string]any{},
			"notes": []map[string]any{
				{
					"id":         noteID,
					"content":    "This is a note",
					"color":      "blue",
					"position_x": 50.0,
					"position_y": 50.0,
					"width":      200.0,
					"height":     100.0,
				},
			},
		}

		w := doRequest(h.SaveCanvas, http.MethodPut, "/v1/workflows/"+id+"/canvas", canvasBody,
			map[string]string{"id": id})
		if w.Code != http.StatusOK {
			t.Fatalf("SaveCanvas: status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		// Verify the response includes steps and notes
		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		edges := resp["edges"].(map[string]any)
		steps := edges["steps"].([]any)
		if len(steps) != 1 {
			t.Errorf("steps count = %d, want 1", len(steps))
		}

		notes := edges["canvas_notes"].([]any)
		if len(notes) != 1 {
			t.Errorf("notes count = %d, want 1", len(notes))
		}
	})
}
