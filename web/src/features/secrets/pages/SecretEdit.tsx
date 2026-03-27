import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { secretApi } from '@/api/secrets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function SecretEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: secret, isLoading } = useQuery({
    queryKey: ['secret', id],
    queryFn: () => secretApi.get(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { value?: string; description?: string }) => secretApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      queryClient.invalidateQueries({ queryKey: ['secret', id] });
      toast.success('Secret updated');
      navigate(`/secrets/${id}`);
    },
    onError: () => toast.error('Failed to update secret'),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = form.get('value') as string;
    const description = form.get('description') as string;

    const data: { value?: string; description?: string } = { description };
    if (value) data.value = value;
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!secret) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Secret not found</h2>
          <Link to="/secrets" className="mt-2 text-sm text-primary hover:underline">
            Back to secrets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        to={`/secrets/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to secret
      </Link>

      <h1 className="text-2xl font-bold mb-6">
        Edit Secret <span className="font-mono text-muted-foreground">{secret.key}</span>
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key">Key</Label>
            <Input id="key" value={secret.key} disabled className="font-mono bg-muted" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              name="value"
              type="password"
              placeholder="Leave empty to keep current value"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Secret values are encrypted and cannot be viewed. Enter a new value to replace the
              existing one.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={secret.description ?? ''}
              placeholder="What is this secret used for?"
              rows={3}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(`/secrets/${id}`)}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
