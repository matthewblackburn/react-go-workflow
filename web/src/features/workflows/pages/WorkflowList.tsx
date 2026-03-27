import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Clock, Copy, Database, Globe, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { workflowApi } from '@/api/workflows';
import type { BulkAction } from '@/components/data-grid/DataGrid';
import { DataGrid } from '@/components/data-grid/DataGrid';
import { FilterBar, type FilterFieldConfig } from '@/components/data-grid/FilterBar';
import { CreateWorkflowDialog } from '@/components/dialogs/CreateWorkflowDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTableState } from '@/hooks/useTableState';
import type { Workflow } from '@/types/workflow';

const statusColors: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const FILTER_CONFIG: FilterFieldConfig[] = [
  { field: 'name', label: 'Name', type: 'text' },
  {
    field: 'status',
    label: 'Status',
    type: 'exact',
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'active', label: 'Active' },
      { value: 'archived', label: 'Archived' },
    ],
  },
];

const columns: ColumnDef<Workflow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="block max-w-xs truncate text-muted-foreground">
        {row.original.description || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant="secondary" className={statusColors[row.original.status]}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'triggers',
    header: 'Triggers',
    cell: ({ row }) => {
      const tc = row.original.trigger_config;
      const triggers: string[] = ['Manual'];
      if (tc?.cron_enabled) triggers.push('Cron');
      if (tc?.webhook_enabled) triggers.push('Webhook');
      if (tc?.db_event_enabled) triggers.push('DB Event');
      return <span className="text-muted-foreground text-xs">{triggers.join(', ')}</span>;
    },
  },
  {
    accessorKey: 'date_created',
    header: 'Created',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {new Date(row.original.date_created).toLocaleDateString()}
      </span>
    ),
  },
];

function WorkflowTile({ workflow }: { workflow: Workflow }) {
  return (
    <div className="group relative rounded-lg border bg-card p-5 transition-shadow hover:shadow-md">
      <div className="mb-3">
        <h3 className="truncate font-semibold">{workflow.name}</h3>
        {workflow.description && (
          <p className="mt-1 truncate text-muted-foreground text-sm">{workflow.description}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Badge variant="secondary" className={statusColors[workflow.status]}>
          {workflow.status}
        </Badge>
        <div className="space-y-0.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Play className="h-3 w-3 shrink-0" />
            <span>Manual</span>
          </div>
          {workflow.trigger_config?.cron_enabled && (
            <div className="flex items-center gap-1.5 truncate">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="opacity-60">Cron:</span>
              <span className="font-mono">
                {workflow.trigger_config?.cron_expression || (
                  <span className="italic opacity-60">not configured</span>
                )}
              </span>
            </div>
          )}
          {workflow.trigger_config?.webhook_enabled && workflow.webhook_slug && (
            <div className="flex items-center gap-1.5 truncate">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="opacity-60">Webhook:</span>
              <span className="truncate font-mono text-[10px]">{`/webhooks/${workflow.webhook_slug}`}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(
                    `${window.location.origin}/webhooks/${workflow.webhook_slug}`,
                  );
                  toast.success('Copied webhook URL');
                }}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}
          {workflow.trigger_config?.db_event_enabled && (
            <div className="flex items-center gap-1.5 truncate">
              <Database className="h-3 w-3 shrink-0" />
              <span className="opacity-60">DB Event:</span>
              <span>
                {workflow.trigger_config?.db_table || '—'} (
                {workflow.trigger_config?.db_event || 'insert'})
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const bulkActions: BulkAction[] = [
  {
    label: 'Copy IDs',
    action: async (ids) => {
      await navigator.clipboard.writeText(ids.join('\n'));
      toast.success(`Copied ${ids.length} workflow ID${ids.length > 1 ? 's' : ''}`);
    },
  },
];

export default function WorkflowList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const table = useTableState();

  const viewMode = (searchParams.get('view') as 'table' | 'grid') || 'grid';

  const { data, isLoading } = useQuery({
    queryKey: ['workflows', table.queryParams],
    queryFn: () => workflowApi.list(table.queryParams),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => workflowApi.clone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow duplicated');
    },
    onError: () => toast.error('Failed to duplicate workflow'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workflowApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow deleted');
    },
    onError: () => toast.error('Failed to delete workflow'),
  });

  const workflows: Workflow[] = data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <DataGrid
        title="Workflows"
        columns={columns}
        data={workflows}
        isLoading={isLoading}
        pagination={
          data ? { total: data.total, limit: data.limit, offset: data.offset } : undefined
        }
        onPageChange={table.onPageChange}
        onRowClick={(wf) => navigate(`/workflows/${wf.id}`)}
        bulkActions={bulkActions}
        rowActions={{
          routePrefix: '/workflows',
          onDelete: (id) => deleteMutation.mutate(String(id)),
          extraItems: [
            {
              label: 'Duplicate',
              onClick: (wf) => cloneMutation.mutate(wf.id),
            },
          ],
        }}
        sort={table.sort}
        onSort={table.onSort}
        sortableColumns={['name', 'status', 'date_created']}
        filters={table.filters}
        onFilterChange={table.onFilterChange}
        filterableColumns={['name', 'status']}
        toolbarLeft={
          <FilterBar
            fields={FILTER_CONFIG}
            filters={table.filters}
            onFilterChange={table.onFilterChange}
          />
        }
        headerActions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Workflow
          </Button>
        }
        tileRenderer={(wf) => <WorkflowTile workflow={wf} />}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (mode === 'grid') {
                next.delete('view');
              } else {
                next.set('view', mode);
              }
              return next;
            },
            { replace: true },
          );
        }}
        emptyMessage="No workflows yet"
      />
      <CreateWorkflowDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
