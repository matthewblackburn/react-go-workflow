import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { type User, userApi } from '@/api/users';
import { DataGrid } from '@/components/data-grid/DataGrid';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const columns: ColumnDef<User, unknown>[] = [
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => <span className="font-medium">{row.original.email}</span>,
  },
  {
    accessorKey: 'time_joined',
    header: 'Joined',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatDate(row.original.time_joined)}</span>
    ),
  },
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => (
      <code className="text-[11px] text-muted-foreground">{row.original.id}</code>
    ),
  },
];

export default function UserList() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.list({ limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted');
    },
    onError: () => toast.error('Failed to delete user'),
  });

  const users = data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <DataGrid
        title="Users"
        columns={columns}
        data={users}
        isLoading={isLoading}
        rowActions={{
          onDelete: (id) => deleteMutation.mutate(String(id)),
        }}
        emptyMessage="No users yet"
      />
    </div>
  );
}
