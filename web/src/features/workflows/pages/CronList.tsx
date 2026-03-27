import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { type ActiveCron, cronApi } from '@/api/workflows';
import { DataGrid } from '@/components/data-grid/DataGrid';

function formatTime(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

const columns: ColumnDef<ActiveCron & { id: string }, unknown>[] = [
  {
    accessorKey: 'workflow_name',
    header: 'Workflow',
    cell: ({ row }) => (
      <Link
        to={`/workflows/${row.original.workflow_id}`}
        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.workflow_name}
        <ExternalLink className="h-3 w-3" />
      </Link>
    ),
  },
  {
    accessorKey: 'expression',
    header: 'Expression',
    cell: ({ getValue }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{getValue<string>()}</code>
    ),
  },
  {
    accessorKey: 'next_run',
    header: 'Next Run',
    cell: ({ getValue }) => formatTime(getValue<string>()),
  },
  {
    accessorKey: 'prev_run',
    header: 'Last Run',
    cell: ({ getValue }) => formatTime(getValue<string>()),
  },
];

export default function CronList() {
  const { data, isLoading } = useQuery({
    queryKey: ['active-crons'],
    queryFn: () => cronApi.list(),
    refetchInterval: 15000,
  });

  const rows = useMemo(
    () => (data?.data ?? []).map((c) => ({ ...c, id: c.workflow_id })),
    [data],
  );

  return (
    <div className="p-6">
      <DataGrid
        title="Active Crons"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No active cron jobs. Enable a cron trigger on a workflow and set it to active."
      />
    </div>
  );
}
