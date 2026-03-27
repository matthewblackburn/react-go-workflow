package trigger

import (
	"testing"

	"github.com/google/uuid"
)

func TestCronScheduler_SyncActiveWithCronEnabled(t *testing.T) {
	s := NewCronScheduler(nil, nil)
	s.cron.Start()
	defer s.cron.Stop()

	wfID := uuid.New()
	config := map[string]any{
		"cron_enabled":    true,
		"cron_expression": "*/5 * * * *",
	}

	s.Sync(wfID, "test-workflow", "active", config)

	list := s.List()
	if len(list) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(list))
	}
	if list[0].WorkflowID != wfID {
		t.Errorf("expected workflow ID %s, got %s", wfID, list[0].WorkflowID)
	}
}

func TestCronScheduler_SyncInactiveStatus(t *testing.T) {
	s := NewCronScheduler(nil, nil)
	s.cron.Start()
	defer s.cron.Stop()

	wfID := uuid.New()
	config := map[string]any{
		"cron_enabled":    true,
		"cron_expression": "*/5 * * * *",
	}

	// First register as active
	s.Sync(wfID, "test-workflow", "active", config)
	if len(s.List()) != 1 {
		t.Fatal("expected 1 entry after active sync")
	}

	// Now sync as inactive — should remove it
	s.Sync(wfID, "test-workflow", "inactive", config)
	if len(s.List()) != 0 {
		t.Fatalf("expected 0 entries after inactive sync, got %d", len(s.List()))
	}
}

func TestCronScheduler_SyncCronDisabled(t *testing.T) {
	s := NewCronScheduler(nil, nil)
	s.cron.Start()
	defer s.cron.Stop()

	wfID := uuid.New()
	config := map[string]any{
		"cron_enabled":    false,
		"cron_expression": "*/5 * * * *",
	}

	s.Sync(wfID, "test-workflow", "active", config)

	if len(s.List()) != 0 {
		t.Fatalf("expected 0 entries when cron_enabled=false, got %d", len(s.List()))
	}
}

func TestCronScheduler_Remove(t *testing.T) {
	s := NewCronScheduler(nil, nil)
	s.cron.Start()
	defer s.cron.Stop()

	wfID := uuid.New()
	config := map[string]any{
		"cron_enabled":    true,
		"cron_expression": "*/5 * * * *",
	}

	s.Sync(wfID, "test-workflow", "active", config)
	if len(s.List()) != 1 {
		t.Fatal("expected 1 entry after sync")
	}

	s.Remove(wfID)
	if len(s.List()) != 0 {
		t.Fatalf("expected 0 entries after Remove, got %d", len(s.List()))
	}
}

func TestCronScheduler_ListReturnsCorrectFields(t *testing.T) {
	s := NewCronScheduler(nil, nil)
	s.cron.Start()
	defer s.cron.Stop()

	wfID := uuid.New()
	config := map[string]any{
		"cron_enabled":    true,
		"cron_expression": "0 9 * * 1",
	}

	s.Sync(wfID, "my-workflow", "active", config)

	list := s.List()
	if len(list) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(list))
	}

	entry := list[0]
	if entry.WorkflowName != "my-workflow" {
		t.Errorf("expected name 'my-workflow', got %q", entry.WorkflowName)
	}
	if entry.Expression != "0 9 * * 1" {
		t.Errorf("expected expression '0 9 * * 1', got %q", entry.Expression)
	}
	if entry.NextRun == "" {
		t.Error("expected NextRun to be non-empty")
	}
}
