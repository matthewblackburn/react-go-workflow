import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  Loader2,
  MinusCircle,
  RotateCcw,
  StopCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { executionApi, workflowApi } from '@/api/workflows';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StepResult } from '@/hooks/useExecutionWS';
import { useExecutionWS } from '@/hooks/useExecutionWS';
import type { StepExecution, WorkflowStep } from '@/types/workflow';
import { ExecutionCanvas } from '../components/ExecutionCanvas';
import { StepExecutionPanel } from '../components/StepExecutionPanel';

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
  cancelled: {
    label: 'Cancelled',
    icon: MinusCircle,
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  },
};

const triggerLabels: Record<string, string> = {
  manual: 'Manual',
  cron: 'Cron',
  webhook: 'Webhook',
  database_event: 'DB Event',
};

function formatDuration(start?: string, end?: string): string | null {
  if (!start) return null;
  const endTime = end ? new Date(end).getTime() : Date.now();
  const ms = endTime - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export default function ExecutionView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => executionApi.cancel(id!),
    onSuccess: () => {
      toast.success('Cancellation requested');
      queryClient.invalidateQueries({ queryKey: ['execution', id] });
    },
    onError: () => toast.error('Failed to cancel execution'),
  });

  const retryMutation = useMutation({
    mutationFn: (params: { workflowId: string; input?: Record<string, any> }) =>
      workflowApi.execute(params.workflowId, params.input),
    onSuccess: (data) => {
      toast.success('Execution restarted');
      navigate(`/executions/${data.execution_id}`);
    },
    onError: () => toast.error('Failed to retry execution'),
  });

  const { data: execution, isLoading } = useQuery({
    queryKey: ['execution', id],
    queryFn: () => executionApi.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll while running so we get the final state
      return status === 'pending' || status === 'running' ? 3000 : false;
    },
  });

  // Connect WebSocket only for live executions
  const isLive = execution?.status === 'pending' || execution?.status === 'running';
  const { stepStatuses: wsStatuses, stepResults: wsResults } = useExecutionWS(
    isLive ? (id ?? null) : null,
  );

  // Build initial status/results from API data
  const { initialStatuses, initialResults, stepExecutionMap } = useMemo(() => {
    const statuses = new Map<string, string>();
    const results = new Map<string, StepResult>();
    const seMap = new Map<string, StepExecution>();

    for (const se of execution?.edges?.step_executions ?? []) {
      statuses.set(se.step_id, se.status);
      results.set(se.step_id, {
        status: se.status,
        output: se.output,
        error: se.error,
        startedAt: se.started_at,
        completedAt: se.completed_at,
      });
      seMap.set(se.step_id, se);
    }

    return { initialStatuses: statuses, initialResults: results, stepExecutionMap: seMap };
  }, [execution]);

  // Merge: WS data overrides API data
  const mergedStatuses = useMemo(
    () => new Map([...initialStatuses, ...wsStatuses]),
    [initialStatuses, wsStatuses],
  );
  const mergedResults = useMemo(
    () => new Map([...initialResults, ...wsResults]),
    [initialResults, wsResults],
  );

  const workflow = execution?.edges?.workflow;
  const cfg = statusConfig[execution?.status ?? 'pending'] ?? statusConfig.pending;
  const StatusIcon = cfg.icon;
  const duration = formatDuration(execution?.started_at, execution?.completed_at);

  // Find selected step data
  const selectedStep = selectedStepId
    ? (workflow?.edges?.steps as WorkflowStep[] | undefined)?.find((s) => s.id === selectedStepId)
    : null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="font-semibold text-xl">Execution not found</h2>
          <Link to="/executions" className="mt-2 text-primary text-sm hover:underline">
            Back to executions
          </Link>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="font-semibold text-xl">Workflow was deleted</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            The workflow for this execution no longer exists.
          </p>
          <Link to="/executions" className="mt-2 text-primary text-sm hover:underline">
            Back to executions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Link
          to="/executions"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-sm">
            Execution{' '}
            <span className="font-mono text-muted-foreground">#{execution.id.slice(0, 8)}</span>
          </h1>
          <Badge variant="secondary" className={`gap-1 ${cfg.className}`}>
            <StatusIcon
              className={`h-3 w-3 ${execution.status === 'running' ? 'animate-spin' : ''}`}
            />
            {cfg.label}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-muted-foreground text-xs">
          <span>
            Workflow: <span className="font-medium text-foreground">{workflow.name}</span>
          </span>
          <span>Trigger: {triggerLabels[execution.trigger_type] ?? execution.trigger_type}</span>
          {duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration}
            </span>
          )}
          {isLive ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                Live
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-destructive text-xs hover:text-destructive"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                <StopCircle className="mr-1 h-3 w-3" />
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() =>
                retryMutation.mutate({
                  workflowId: execution.workflow_id,
                  input: execution.input,
                })
              }
              disabled={retryMutation.isPending}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              {retryMutation.isPending ? 'Retrying...' : 'Retry'}
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {execution.error && (
        <div className="border-red-200 border-b bg-red-50 px-4 py-2 text-red-800 text-xs dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <span className="font-medium">Error:</span> {execution.error}
        </div>
      )}

      {/* Canvas + Panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ExecutionCanvas
            workflow={workflow}
            stepStatuses={mergedStatuses}
            onNodeClick={setSelectedStepId}
            onPaneClick={() => setSelectedStepId(null)}
          />
        </div>

        {selectedStep && (
          <StepExecutionPanel
            step={selectedStep}
            stepExecution={stepExecutionMap.get(selectedStepId!)}
            liveResult={mergedResults.get(selectedStepId!)}
            onClose={() => setSelectedStepId(null)}
          />
        )}
      </div>
    </div>
  );
}
