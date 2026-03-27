import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Circle, CircleCheck, CircleX, Clock, Loader2, MinusCircle } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { executionApi, workflowApi } from '@/api/workflows';
import type { BulkAction } from '@/components/data-grid/DataGrid';
import { DataGrid } from '@/components/data-grid/DataGrid';
import { FilterBar, type FilterFieldConfig } from '@/components/data-grid/FilterBar';
import { Badge } from '@/components/ui/badge';
import { useTableState } from '@/hooks/useTableState';
import type { WorkflowExecution } from '@/types/workflow';

const statusConfig = {
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
} as const;

const triggerLabels: Record<string, string> = {
  manual: 'Manual',
  cron: 'Cron',
  webhook: 'Webhook',
  database_event: 'DB Event',
};

function formatDuration(start?: string, end?: string): string {
  if (!start) return '—';
  if (!end) return 'Running...';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const columns: ColumnDef<WorkflowExecution, unknown>[] = [
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const cfg = statusConfig[row.original.status] ?? statusConfig.pending;
      const StatusIcon = cfg.icon;
      return (
        <Badge variant="secondary" className={`gap-1 ${cfg.className}`}>
          <StatusIcon
            className={`h-3 w-3 ${row.original.status === 'running' ? 'animate-spin' : ''}`}
          />
          {cfg.label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'workflow',
    header: 'Workflow',
    cell: ({ row }) => (
      <span className="font-medium">{row.original.edges?.workflow?.name ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'trigger_type',
    header: 'Trigger',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {triggerLabels[row.original.trigger_type] ?? row.original.trigger_type}
      </span>
    ),
  },
  {
    accessorKey: 'started_at',
    header: 'Started',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatTime(row.original.started_at)}</span>
    ),
  },
  {
    accessorKey: 'duration',
    header: 'Duration',
    cell: ({ row }) => (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Clock className="h-3 w-3" />
        {formatDuration(row.original.started_at, row.original.completed_at)}
      </span>
    ),
  },
  {
    accessorKey: 'date_created',
    header: 'Created',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatTime(row.original.date_created)}</span>
    ),
  },
];

const bulkActions: BulkAction[] = [
  {
    label: 'Copy IDs',
    action: async (ids) => {
      await navigator.clipboard.writeText(ids.join('\n'));
      toast.success(`Copied ${ids.length} execution ID${ids.length > 1 ? 's' : ''}`);
    },
  },
];

export default function ExecutionList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const table = useTableState();

  const cancelMutation = useMutation({
    mutationFn: (id: string) => executionApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      toast.success('Cancellation requested');
    },
    onError: () => toast.error('Failed to cancel execution'),
  });

  const retryMutation = useMutation({
    mutationFn: (exec: WorkflowExecution) => workflowApi.execute(exec.workflow_id, exec.input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      toast.success('Execution restarted');
      navigate(`/executions/${data.execution_id}`);
    },
    onError: () => toast.error('Failed to retry execution'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['executions', table.queryParams],
    queryFn: () => executionApi.list(table.queryParams),
  });

  const { data: workflowsData } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.list(),
  });

  const executions = data?.data ?? [];
  const workflows = workflowsData?.data ?? [];

  // Build filter config with dynamic workflow options
  const filterConfig: FilterFieldConfig[] = useMemo(
    () => [
      {
        field: 'status',
        label: 'Status',
        type: 'exact',
        options: [
          { value: 'pending', label: 'Pending' },
          { value: 'running', label: 'Running' },
          { value: 'completed', label: 'Completed' },
          { value: 'failed', label: 'Failed' },
          { value: 'cancelled', label: 'Cancelled' },
        ],
      },
      {
        field: 'trigger_type',
        label: 'Trigger',
        type: 'exact',
        options: [
          { value: 'manual', label: 'Manual' },
          { value: 'cron', label: 'Cron' },
          { value: 'webhook', label: 'Webhook' },
          { value: 'database_event', label: 'DB Event' },
        ],
      },
      {
        field: 'workflow_id',
        label: 'Workflow',
        type: 'exact',
        options: workflows.map((wf) => ({ value: wf.id, label: wf.name })),
      },
      { field: 'started_at', label: 'Started', type: 'date' },
      { field: 'completed_at', label: 'Completed', type: 'date' },
    ],
    [workflows],
  );

  return (
    <div className="flex h-full flex-col">
      <DataGrid
        title="Executions"
        columns={columns}
        data={executions}
        isLoading={isLoading}
        pagination={
          data ? { total: data.total, limit: data.limit, offset: data.offset } : undefined
        }
        onPageChange={table.onPageChange}
        onRowClick={(exec) => navigate(`/executions/${exec.id}`)}
        rowActions={{
          routePrefix: '/executions',
          extraItems: [
            {
              label: 'Retry',
              onClick: (exec) => {
                if (
                  exec.status === 'completed' ||
                  exec.status === 'failed' ||
                  exec.status === 'cancelled'
                ) {
                  retryMutation.mutate(exec);
                } else {
                  toast.error('Only finished executions can be retried');
                }
              },
            },
            {
              label: 'Cancel',
              className: 'text-destructive',
              separator: true,
              onClick: (exec) => {
                if (exec.status === 'running' || exec.status === 'pending') {
                  cancelMutation.mutate(exec.id);
                } else {
                  toast.error('Only running executions can be cancelled');
                }
              },
            },
          ],
        }}
        bulkActions={bulkActions}
        sort={table.sort}
        onSort={table.onSort}
        sortableColumns={['status', 'trigger_type', 'started_at', 'date_created']}
        filters={table.filters}
        onFilterChange={table.onFilterChange}
        filterableColumns={['status', 'trigger_type']}
        toolbarLeft={
          <FilterBar
            fields={filterConfig}
            filters={table.filters}
            onFilterChange={table.onFilterChange}
          />
        }
        emptyMessage="No executions found"
      />
    </div>
  );
}
