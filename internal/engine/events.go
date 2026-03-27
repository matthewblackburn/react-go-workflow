package engine

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// EventType identifies the kind of execution event.
type EventType string

const (
	EventStepStatus      EventType = "step_status"
	EventStepLog         EventType = "step_log"
	EventExecutionStatus EventType = "execution_status"
)

// Event is a real-time execution update pushed to WebSocket clients.
type Event struct {
	Type        EventType      `json:"type"`
	StepID      *uuid.UUID     `json:"step_id,omitempty"`
	StepName    string         `json:"step_name,omitempty"`
	Status      string         `json:"status,omitempty"`
	Output      map[string]any `json:"output,omitempty"`
	Error       string         `json:"error,omitempty"`
	Message     string         `json:"message,omitempty"`
	Timestamp   time.Time      `json:"timestamp"`
	StartedAt   *time.Time     `json:"started_at,omitempty"`
	CompletedAt *time.Time     `json:"completed_at,omitempty"`
}

// EventBus manages per-execution event channels for broadcasting to WebSocket clients.
type EventBus struct {
	mu          sync.RWMutex
	subscribers map[uuid.UUID][]chan Event // execution_id -> list of subscriber channels
}

// NewEventBus creates a new event bus.
func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[uuid.UUID][]chan Event),
	}
}

// Subscribe creates a channel that receives events for a given execution.
func (b *EventBus) Subscribe(executionID uuid.UUID) chan Event {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan Event, 64)
	b.subscribers[executionID] = append(b.subscribers[executionID], ch)
	return ch
}

// Unsubscribe removes a subscriber channel.
func (b *EventBus) Unsubscribe(executionID uuid.UUID, ch chan Event) {
	b.mu.Lock()
	defer b.mu.Unlock()

	subs := b.subscribers[executionID]
	for i, s := range subs {
		if s == ch {
			b.subscribers[executionID] = append(subs[:i], subs[i+1:]...)
			close(ch)
			break
		}
	}

	if len(b.subscribers[executionID]) == 0 {
		delete(b.subscribers, executionID)
	}
}

// Publish sends an event to all subscribers of an execution.
func (b *EventBus) Publish(executionID uuid.UUID, event Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, ch := range b.subscribers[executionID] {
		select {
		case ch <- event:
		default:
			// Drop event if subscriber is too slow
		}
	}
}

// Cleanup closes all channels for an execution.
func (b *EventBus) Cleanup(executionID uuid.UUID) {
	b.mu.Lock()
	defer b.mu.Unlock()

	for _, ch := range b.subscribers[executionID] {
		close(ch)
	}
	delete(b.subscribers, executionID)
}
