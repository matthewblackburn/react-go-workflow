import {
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  ExternalLink,
  Loader2,
  MinusCircle,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { JsonViewer } from '@/components/editors/CodeEditor';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { StepResult } from '@/hooks/useExecutionWS';
import type { StepExecution, WorkflowStep } from '@/types/workflow';

interface StepExecutionPanelProps {
  step: WorkflowStep;
  stepExecution?: StepExecution;
  liveResult?: StepResult;
  onClose: () => void;
}

const statusConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  pending: {
    label: 'Pending',
    icon: Circle,
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  running: {
    label: 'Running',
    icon: Loader2,
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  completed: {
    label: 'Completed',
    icon: CircleCheck,
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  failed: {
    label: 'Failed',
    icon: CircleX,
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
  skipped: {
    label: 'Skipped',
    icon: MinusCircle,
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  },
};

function formatDuration(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function StepExecutionPanel({
  step,
  stepExecution,
  liveResult,
  onClose,
}: StepExecutionPanelProps) {
  const [modalData, setModalData] = useState<{ title: string; data: Record<string, any> } | null>(
    null,
  );

  // Prefer live WS data, fall back to API data
  const status = liveResult?.status ?? stepExecution?.status ?? 'pending';
  const output = liveResult?.output ?? stepExecution?.output;
  const error = liveResult?.error ?? stepExecution?.error;
  const startedAt = liveResult?.startedAt ?? stepExecution?.started_at;
  const completedAt = liveResult?.completedAt ?? stepExecution?.completed_at;
  const input = stepExecution?.input;
  const attempt = stepExecution?.attempt;

  const cfg = statusConfig[status] ?? statusConfig.pending;
  const StatusIcon = cfg.icon;
  const duration = formatDuration(startedAt, completedAt);

  return (
    <div className="flex h-full w-[350px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-sm">{step.name}</h3>
          {step.edges?.step_type && (
            <p className="text-muted-foreground text-xs">{step.edges.step_type.display_name}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Status */}
          <div>
            <Badge variant="secondary" className={`gap-1 ${cfg.className}`}>
              <StatusIcon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
              {cfg.label}
            </Badge>
          </div>

          {/* Timing */}
          <div className="space-y-1 text-xs">
            {startedAt && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Started: {new Date(startedAt).toLocaleTimeString()}</span>
              </div>
            )}
            {duration && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Duration: {duration}</span>
              </div>
            )}
            {attempt != null && attempt > 1 && (
              <div className="text-muted-foreground">Attempt: {attempt}</div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800 text-xs dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <p className="mb-1 font-medium">Error</p>
              <p className="whitespace-pre-wrap">{error}</p>
            </div>
          )}

          {/* Input */}
          {input && Object.keys(input).length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="font-medium text-muted-foreground text-xs">Input</p>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setModalData({ title: `${step.name} — Input`, data: input })}
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <div className="overflow-hidden rounded-md border">
                <JsonViewer data={input} maxHeight="200px" />
              </div>
            </div>
          )}

          {/* Output */}
          {output && Object.keys(output).length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="font-medium text-muted-foreground text-xs">Output</p>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setModalData({ title: `${step.name} — Output`, data: output })}
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <div className="overflow-hidden rounded-md border">
                <JsonViewer data={output} maxHeight="300px" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog
        open={!!modalData}
        onOpenChange={(open) => {
          if (!open) setModalData(null);
        }}
      >
        <DialogContent className="flex max-h-[80vh] w-[90vw] flex-col sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{modalData?.title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            {modalData && <JsonViewer data={modalData.data} maxHeight="60vh" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
