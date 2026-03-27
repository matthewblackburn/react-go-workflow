package engine

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestEventBus_SubscribeAndPublish(t *testing.T) {
	bus := NewEventBus()
	execID := uuid.New()
	ch := bus.Subscribe(execID)

	event := Event{Type: EventStepStatus, Status: "completed"}
	bus.Publish(execID, event)

	select {
	case got := <-ch:
		if got.Status != "completed" {
			t.Errorf("Status = %q, want %q", got.Status, "completed")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}
}

func TestEventBus_MultipleSubscribers(t *testing.T) {
	bus := NewEventBus()
	execID := uuid.New()
	ch1 := bus.Subscribe(execID)
	ch2 := bus.Subscribe(execID)

	event := Event{Type: EventStepLog, Message: "hello"}
	bus.Publish(execID, event)

	for i, ch := range []chan Event{ch1, ch2} {
		select {
		case got := <-ch:
			if got.Message != "hello" {
				t.Errorf("subscriber %d: Message = %q, want %q", i, got.Message, "hello")
			}
		case <-time.After(time.Second):
			t.Fatalf("subscriber %d: timed out", i)
		}
	}
}

func TestEventBus_Unsubscribe(t *testing.T) {
	bus := NewEventBus()
	execID := uuid.New()
	ch := bus.Subscribe(execID)

	bus.Unsubscribe(execID, ch)

	// Channel should be closed after unsubscribe.
	_, ok := <-ch
	if ok {
		t.Error("expected channel to be closed after unsubscribe")
	}
}

func TestEventBus_PublishNoSubscribersNoPanic(t *testing.T) {
	bus := NewEventBus()
	execID := uuid.New()

	// Should not panic.
	bus.Publish(execID, Event{Type: EventStepStatus, Status: "running"})
}

func TestEventBus_Cleanup(t *testing.T) {
	bus := NewEventBus()
	execID := uuid.New()
	ch1 := bus.Subscribe(execID)
	ch2 := bus.Subscribe(execID)

	bus.Cleanup(execID)

	// Both channels should be closed.
	if _, ok := <-ch1; ok {
		t.Error("expected ch1 to be closed")
	}
	if _, ok := <-ch2; ok {
		t.Error("expected ch2 to be closed")
	}
}

func TestEventBus_SlowSubscriberDoesNotBlock(t *testing.T) {
	bus := NewEventBus()
	execID := uuid.New()
	ch := bus.Subscribe(execID)

	// Fill the channel buffer (capacity 64).
	for i := 0; i < 64; i++ {
		bus.Publish(execID, Event{Type: EventStepLog, Message: "fill"})
	}

	// This publish should not block even though the buffer is full.
	done := make(chan struct{})
	go func() {
		bus.Publish(execID, Event{Type: EventStepLog, Message: "overflow"})
		close(done)
	}()

	select {
	case <-done:
		// Success: publish did not block.
	case <-time.After(time.Second):
		t.Fatal("Publish blocked on slow subscriber")
	}

	// Drain to avoid leaks.
	_ = ch
}
