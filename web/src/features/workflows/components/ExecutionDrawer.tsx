import {
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleX,
  Loader2,
  Play,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { StepResult } from '@/hooks/useExecutionWS';
import type { WSEvent } from '@/types/workflow';

interface ExecutionDrawerProps {
  events: WSEvent[];
  stepResults: Map<string, StepResult>;
  executionStatus: string | null;
  isExecuting: boolean;
  onStepClick: (stepId: string) => void;
  onDismiss: () => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  running: <Play className="h-3.5 w-3.5 fill-blue-500 text-blue-500" />,
  completed: <CircleCheck className="h-3.5 w-3.5 text-green-500" />,
  failed: <CircleX className="h-3.5 w-3.5 text-red-500" />,
  pending: <Circle className="h-3.5 w-3.5 text-muted-foreground" />,
};

function formatDuration(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ExecutionDrawer({
  events,
  stepResults,
  executionStatus,
  isExecuting,
  onStepClick,
  onDismiss,
}: ExecutionDrawerProps) {
  const [expanded, setExpanded] = useState(true);

  if (!isExecuting && !executionStatus) return null;

  // Deduplicate: only show the latest event per step (in order of first appearance)
  const stepEvents = (() => {
    const seen = new Map<string, WSEvent>();
    const order: string[] = [];
    for (const e of events) {
      if (e.type !== 'step_status' || !e.step_id) continue;
      if (!seen.has(e.step_id)) order.push(e.step_id);
      seen.set(e.step_id, e);
    }
    return order.map((id) => seen.get(id)!);
  })();

  return (
    <div className="border-t bg-background">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2 font-medium text-xs hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          ) : executionStatus === 'completed' ? (
            <CircleCheck className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <CircleX className="h-3.5 w-3.5 text-red-500" />
          )}
          <span>Execution {isExecuting ? 'running...' : executionStatus}</span>
          <span className="text-muted-foreground">
            {stepEvents.length} step{stepEvents.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          {!isExecuting && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  onDismiss();
                }
              }}
              className="ml-1 rounded-sm p-0.5 hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-1 px-4 pb-3">
            {stepEvents.length === 0 && (
              <p className="py-2 text-muted-foreground text-xs">Waiting for steps...</p>
            )}
            {stepEvents.map((event) => {
              const result = event.step_id ? stepResults.get(event.step_id) : undefined;
              const duration = result ? formatDuration(result.startedAt, result.completedAt) : null;

              return (
                <button
                  key={`${event.step_id}-${event.status}-${event.timestamp}`}
                  type="button"
                  onClick={() => event.step_id && onStepClick(event.step_id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
                >
                  {statusIcons[event.status ?? 'pending'] ?? statusIcons.pending}
                  <span className="flex-1 truncate font-medium">
                    {event.step_name ?? event.step_id}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {event.status}
                  </span>
                  {duration && (
                    <span className="text-[10px] text-muted-foreground">{duration}</span>
                  )}
                  {result?.error && (
                    <span className="max-w-[120px] truncate text-[10px] text-red-500">
                      {result.error}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
