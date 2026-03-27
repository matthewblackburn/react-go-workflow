import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { secretApi } from '@/api/secrets';
import type { BulkAction } from '@/components/data-grid/DataGrid';
import { DataGrid } from '@/components/data-grid/DataGrid';
import { FilterBar, type FilterFieldConfig } from '@/components/data-grid/FilterBar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTableState } from '@/hooks/useTableState';
import type { Secret } from '@/types/secret';

const FILTER_CONFIG: FilterFieldConfig[] = [{ field: 'search', label: 'Key', type: 'text' }];

const columns: ColumnDef<Secret, unknown>[] = [
  {
    accessorKey: 'key',
    header: 'Key',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono font-medium">{row.original.key}</span>
      </div>
    ),
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.description || '—'}</span>
    ),
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

const bulkActions: BulkAction[] = [
  {
    label: 'Copy IDs',
    action: async (ids) => {
      await navigator.clipboard.writeText(ids.join('\n'));
      toast.success(`Copied ${ids.length} secret ID${ids.length > 1 ? 's' : ''}`);
    },
  },
  {
    label: 'Delete',
    variant: 'destructive',
    action: async (ids) => {
      await Promise.all(ids.map((id) => secretApi.delete(id)));
      toast.success(`Deleted ${ids.length} secret${ids.length > 1 ? 's' : ''}`);
    },
  },
];

function CreateSecretDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: secretApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      toast.success('Secret created');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to create secret'),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      key: form.get('key') as string,
      value: form.get('value') as string,
      description: (form.get('description') as string) || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Secret</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              name="key"
              required
              placeholder="API_KEY"
              className="font-mono"
              pattern="[A-Za-z_][A-Za-z0-9_]*"
              title="Letters, numbers, and underscores only"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              name="value"
              type="password"
              required
              placeholder="sk-..."
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="What is this secret used for?"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SecretList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const table = useTableState();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['secrets', table.queryParams],
    queryFn: () => secretApi.list(table.queryParams),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      toast.success('Secret deleted');
    },
    onError: () => toast.error('Failed to delete secret'),
  });

  const secrets = data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <DataGrid
        title="Secrets"
        columns={columns}
        data={secrets}
        isLoading={isLoading}
        pagination={
          data ? { total: data.total, limit: data.limit, offset: data.offset } : undefined
        }
        onPageChange={table.onPageChange}
        onRowClick={(s) => navigate(`/secrets/${s.id}`)}
        bulkActions={bulkActions}
        rowActions={{
          routePrefix: '/secrets',
          onDelete: (id) => deleteMutation.mutate(String(id)),
          extraItems: [
            {
              label: 'Edit',
              onClick: (s) => navigate(`/secrets/${s.id}/edit`),
            },
          ],
        }}
        sort={table.sort}
        onSort={table.onSort}
        sortableColumns={['key', 'date_created']}
        filters={table.filters}
        onFilterChange={table.onFilterChange}
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
            New Secret
          </Button>
        }
        emptyMessage="No secrets yet"
      />

      <CreateSecretDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
