import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecutionWS } from '../useExecutionWS';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useExecutionWS', () => {
  it('connects to correct URL with execution ID', () => {
    renderHook(() => useExecutionWS('exec-123'));

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe(
      'ws://localhost:3000/ws/executions/exec-123',
    );
  });

  it('updates stepStatuses map on step_status event', () => {
    const { result } = renderHook(() => useExecutionWS('exec-1'));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateMessage({
        type: 'step_status',
        step_id: 'step-a',
        status: 'running',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.stepStatuses.get('step-a')).toBe('running');

    act(() => {
      ws.simulateMessage({
        type: 'step_status',
        step_id: 'step-a',
        status: 'completed',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.stepStatuses.get('step-a')).toBe('completed');
  });

  it('updates executionStatus on execution_status event', () => {
    const { result } = renderHook(() => useExecutionWS('exec-1'));
    const ws = MockWebSocket.instances[0];

    expect(result.current.executionStatus).toBeNull();

    act(() => {
      ws.simulateMessage({
        type: 'execution_status',
        status: 'completed',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.executionStatus).toBe('completed');
  });

  it('reset() clears all state', () => {
    const { result } = renderHook(() => useExecutionWS('exec-1'));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateMessage({
        type: 'step_status',
        step_id: 'step-a',
        status: 'running',
        timestamp: new Date().toISOString(),
      });
      ws.simulateMessage({
        type: 'execution_status',
        status: 'running',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.stepStatuses.size).toBe(1);
    expect(result.current.executionStatus).toBe('running');
    expect(result.current.events).toHaveLength(2);

    act(() => {
      result.current.reset();
    });

    expect(result.current.stepStatuses.size).toBe(0);
    expect(result.current.stepResults.size).toBe(0);
    expect(result.current.executionStatus).toBeNull();
    expect(result.current.events).toHaveLength(0);
  });

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useExecutionWS('exec-1'));
    const ws = MockWebSocket.instances[0];

    expect(ws.close).not.toHaveBeenCalled();

    unmount();

    expect(ws.close).toHaveBeenCalledOnce();
  });
});
