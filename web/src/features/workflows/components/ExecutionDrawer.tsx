import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleX,
  Loader2,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { aiApi } from '@/api/ai';
import { Button } from '@/components/ui/button';
import type { StepResult } from '@/hooks/useExecutionWS';
import type { DiagnoseResponse } from '@/types/ai';
import type { WSEvent } from '@/types/workflow';

interface StepInfo {
  name: string;
  stepType: string;
  config: Record<string, any>;
}

interface ExecutionDrawerProps {
  events: WSEvent[];
  stepResults: Map<string, StepResult>;
  executionStatus: string | null;
  executionError: string | null;
  isExecuting: boolean;
  stepInfoMap: Map<string, StepInfo>;
  onStepClick: (stepId: string) => void;
  onDismiss: () => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  running: <Play className="h-3.5 w-3.5 fill-blue-500 text-blue-500" />,
  completed: <CircleCheck className="h-3.5 w-3.5 text-green-500" />,
  failed: <CircleX className="h-3.5 w-3.5 text-red-500" />,
  skipped: <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />,
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
  executionError,
  isExecuting,
  stepInfoMap,
  onStepClick,
  onDismiss,
}: ExecutionDrawerProps) {
  const [expanded, setExpanded] = useState(true);
  const [diagnosis, setDiagnosis] = useState<DiagnoseResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Clear diagnosis when a new execution starts
  useEffect(() => {
    if (isExecuting) {
      setDiagnosis(null);
      setCopied(false);
    }
  }, [isExecuting]);

  const diagnoseMutation = useMutation({
    mutationFn: () => {
      const steps = Array.from(stepInfoMap.entries()).map(([, info]) => ({
        name: info.name,
        step_type: info.stepType,
        config: info.config,
      }));

      const stepResultsObj: Record<string, { status: string; error?: string }> = {};
      for (const [id, result] of stepResults) {
        const info = stepInfoMap.get(id);
        const key = info?.name ?? id;
        stepResultsObj[key] = { status: result.status, error: result.error };
      }

      return aiApi.diagnoseExecution({
        error: executionError ?? 'Unknown error',
        steps,
        step_results: stepResultsObj,
      });
    },
    onSuccess: (data) => setDiagnosis(data),
  });

  if (!isExecuting && !executionStatus) return null;

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

  const isFailed = executionStatus === 'failed';

  return (
    <div className="flex max-h-[40vh] shrink-0 flex-col border-t bg-background">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex shrink-0 items-center justify-between px-4 py-2 font-medium text-xs hover:bg-muted/50"
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
        <>
          {/* Scrollable step list */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <div className="space-y-1 pb-2">
              {stepEvents.length === 0 && (
                <p className="py-2 text-muted-foreground text-xs">Waiting for steps...</p>
              )}
              {stepEvents.map((event) => {
                const result = event.step_id ? stepResults.get(event.step_id) : undefined;
                const duration = result
                  ? formatDuration(result.startedAt, result.completedAt)
                  : null;

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
          </div>

          {/* Pinned footer — diagnose button or diagnosis result */}
          {isFailed && (
            <div className="shrink-0 border-t px-4 py-2">
              {diagnosis ? (
                <div className="relative flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <div className="space-y-1 pr-6">
                    <p className="font-medium text-xs">{diagnosis.diagnosis}</p>
                    <p className="text-muted-foreground text-xs">{diagnosis.suggestion}</p>
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {diagnosis.is_user_error ? 'Configuration issue' : 'System issue'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="absolute top-0 right-0 rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${diagnosis.diagnosis}\n${diagnosis.suggestion}`,
                      );
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() => diagnoseMutation.mutate()}
                  disabled={diagnoseMutation.isPending}
                >
                  {diagnoseMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Diagnosing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 h-3 w-3" />
                      Diagnose with AI
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
