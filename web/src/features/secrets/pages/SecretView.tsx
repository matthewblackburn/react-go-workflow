import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, Copy, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { secretApi } from '@/api/secrets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function SecretView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: secret, isLoading } = useQuery({
    queryKey: ['secret', id],
    queryFn: () => secretApi.get(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => secretApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      toast.success('Secret deleted');
      navigate('/secrets');
    },
    onError: () => toast.error('Failed to delete secret'),
  });

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
      <div className="mb-6">
        <Link
          to="/secrets"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to secrets
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold font-mono">{secret.key}</h1>
            </div>
            {secret.description && (
              <p className="mt-2 text-muted-foreground">{secret.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/secrets/${id}/edit`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => deleteMutation.mutate()}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="divide-y">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Key</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{secret.key}</span>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(secret.key);
                  toast.success('Copied key');
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Value</span>
            <Badge variant="secondary" className="font-mono">
              ••••••••
            </Badge>
          </div>
          {secret.description && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">Description</span>
              <span className="text-sm">{secret.description}</span>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Created</span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {new Date(secret.date_created).toLocaleString()}
            </span>
          </div>
          {secret.date_updated && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">Updated</span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {new Date(secret.date_updated).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Usage</span>
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                {'{{'}secrets.{secret.key}
                {'}}'}
              </code>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(`{{secrets.${secret.key}}}`);
                  toast.success('Copied expression');
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
