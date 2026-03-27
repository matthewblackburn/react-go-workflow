import { useCallback, useEffect, useRef, useState } from 'react';
import type { WSEvent } from '@/types/workflow';

export interface StepResult {
  status: string;
  output?: Record<string, any>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export function useExecutionWS(executionId: string | null) {
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [stepStatuses, setStepStatuses] = useState<Map<string, string>>(new Map());
  const [stepResults, setStepResults] = useState<Map<string, StepResult>>(new Map());
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!executionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/executions/${executionId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data: WSEvent = JSON.parse(event.data);
      setEvents((prev) => [...prev, data]);

      if (data.type === 'step_status' && data.step_id && data.status) {
        setStepStatuses((prev) => {
          const next = new Map(prev);
          next.set(data.step_id!, data.status!);
          return next;
        });

        setStepResults((prev) => {
          const next = new Map(prev);
          const existing = next.get(data.step_id!) ?? { status: data.status! };
          next.set(data.step_id!, {
            ...existing,
            status: data.status!,
            output: data.output ?? existing.output,
            error: data.error ?? existing.error,
            startedAt: data.started_at ?? existing.startedAt,
            completedAt: data.completed_at ?? existing.completedAt,
          });
          return next;
        });
      }

      if (data.type === 'execution_status' && data.status) {
        setExecutionStatus(data.status);
      }
    };

    ws.onerror = () => {
      // Connection failed — might not have a subscriber yet, that's ok
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [executionId]);

  const reset = useCallback(() => {
    setEvents([]);
    setStepStatuses(new Map());
    setStepResults(new Map());
    setExecutionStatus(null);
  }, []);

  return { events, stepStatuses, stepResults, executionStatus, reset };
}
