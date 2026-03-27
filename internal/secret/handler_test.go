package secret

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"react-go-workflow/ent"
	"react-go-workflow/internal/testutil"
)

var (
	testClient *ent.Client
	testEncKey []byte
)

func TestMain(m *testing.M) {
	// Use a lightweight testing.T stub for enttest.
	testEncKey = DeriveKey("test-encryption-key")
	os.Exit(m.Run())
}

func newHandler(t *testing.T) *Handler {
	t.Helper()
	client := testutil.NewTestClient(t)
	t.Cleanup(func() { _ = client.Close() })
	return NewHandler(client, testEncKey)
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

func TestSecretHandler(t *testing.T) {
	t.Run("Create success", func(t *testing.T) {
		h := newHandler(t)
		body := map[string]string{"key": "API_KEY", "value": "secret-value", "description": "test key"}
		w := doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)

		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusCreated, w.Body.String())
		}

		var resp SecretResponse
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp.Key != "API_KEY" {
			t.Errorf("key = %q, want %q", resp.Key, "API_KEY")
		}
		if resp.Description != "test key" {
			t.Errorf("description = %q, want %q", resp.Description, "test key")
		}
	})

	t.Run("Create missing key returns 400", func(t *testing.T) {
		h := newHandler(t)
		body := map[string]string{"value": "secret-value"}
		w := doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
		}
	})

	t.Run("Create duplicate key returns 409", func(t *testing.T) {
		h := newHandler(t)
		body := map[string]string{"key": "DUP_KEY", "value": "v1"}
		w := doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("first create: status = %d, want %d", w.Code, http.StatusCreated)
		}

		w = doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)
		if w.Code != http.StatusConflict {
			t.Fatalf("duplicate create: status = %d, want %d; body: %s", w.Code, http.StatusConflict, w.Body.String())
		}
	})

	t.Run("List empty", func(t *testing.T) {
		h := newHandler(t)
		w := doRequest(h.List, http.MethodGet, "/v1/secrets", nil, nil)

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
		h := newHandler(t)
		for i, key := range []string{"KEY_A", "KEY_B", "KEY_C"} {
			body := map[string]string{"key": key, "value": "val" + string(rune('0'+i))}
			w := doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)
			if w.Code != http.StatusCreated {
				t.Fatalf("create %s: status = %d", key, w.Code)
			}
		}

		w := doRequest(h.List, http.MethodGet, "/v1/secrets", nil, nil)
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

	t.Run("Get by ID", func(t *testing.T) {
		h := newHandler(t)
		body := map[string]string{"key": "GET_KEY", "value": "get-val"}
		w := doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("create: status = %d", w.Code)
		}

		var created SecretResponse
		_ = json.Unmarshal(w.Body.Bytes(), &created)

		w = doRequest(h.Get, http.MethodGet, "/v1/secrets/"+created.ID.String(), nil,
			map[string]string{"id": created.ID.String()})
		if w.Code != http.StatusOK {
			t.Fatalf("get: status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		var got SecretResponse
		_ = json.Unmarshal(w.Body.Bytes(), &got)
		if got.Key != "GET_KEY" {
			t.Errorf("key = %q, want %q", got.Key, "GET_KEY")
		}
	})

	t.Run("Get not found returns 404", func(t *testing.T) {
		h := newHandler(t)
		w := doRequest(h.Get, http.MethodGet, "/v1/secrets/00000000-0000-0000-0000-000000000001", nil,
			map[string]string{"id": "00000000-0000-0000-0000-000000000001"})
		if w.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
		}
	})

	t.Run("Update value", func(t *testing.T) {
		h := newHandler(t)
		body := map[string]string{"key": "UPD_KEY", "value": "original"}
		w := doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("create: status = %d", w.Code)
		}

		var created SecretResponse
		_ = json.Unmarshal(w.Body.Bytes(), &created)

		newVal := "updated-value"
		updateBody := map[string]*string{"value": &newVal}
		w = doRequest(h.Update, http.MethodPatch, "/v1/secrets/"+created.ID.String(), updateBody,
			map[string]string{"id": created.ID.String()})
		if w.Code != http.StatusOK {
			t.Fatalf("update: status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		var updated SecretResponse
		_ = json.Unmarshal(w.Body.Bytes(), &updated)
		if updated.DateUpdated == nil {
			t.Error("date_updated should be set after update")
		}
	})

	t.Run("Update description only", func(t *testing.T) {
		h := newHandler(t)
		body := map[string]string{"key": "DESC_KEY", "value": "val"}
		w := doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("create: status = %d", w.Code)
		}

		var created SecretResponse
		_ = json.Unmarshal(w.Body.Bytes(), &created)

		desc := "new description"
		updateBody := map[string]*string{"description": &desc}
		w = doRequest(h.Update, http.MethodPatch, "/v1/secrets/"+created.ID.String(), updateBody,
			map[string]string{"id": created.ID.String()})
		if w.Code != http.StatusOK {
			t.Fatalf("update: status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
		}

		var updated SecretResponse
		_ = json.Unmarshal(w.Body.Bytes(), &updated)
		if updated.Description != "new description" {
			t.Errorf("description = %q, want %q", updated.Description, "new description")
		}
	})

	t.Run("Delete returns 204", func(t *testing.T) {
		h := newHandler(t)
		body := map[string]string{"key": "DEL_KEY", "value": "val"}
		w := doRequest(h.Create, http.MethodPost, "/v1/secrets", body, nil)
		if w.Code != http.StatusCreated {
			t.Fatalf("create: status = %d", w.Code)
		}

		var created SecretResponse
		_ = json.Unmarshal(w.Body.Bytes(), &created)

		w = doRequest(h.Delete, http.MethodDelete, "/v1/secrets/"+created.ID.String(), nil,
			map[string]string{"id": created.ID.String()})
		if w.Code != http.StatusNoContent {
			t.Fatalf("delete: status = %d, want %d; body: %s", w.Code, http.StatusNoContent, w.Body.String())
		}

		// Verify it's gone
		w = doRequest(h.Get, http.MethodGet, "/v1/secrets/"+created.ID.String(), nil,
			map[string]string{"id": created.ID.String()})
		if w.Code != http.StatusNotFound {
			t.Fatalf("get after delete: status = %d, want %d", w.Code, http.StatusNotFound)
		}
	})
}
