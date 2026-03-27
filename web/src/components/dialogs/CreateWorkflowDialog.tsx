import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { workflowApi } from '@/api/workflows';
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

interface CreateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkflowDialog({ open, onOpenChange }: CreateWorkflowDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: workflowApi.create,
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      onOpenChange(false);
      setName('');
      setDescription('');
      toast.success('Workflow created');
      navigate(`/workflows/${wf.id}`);
    },
    onError: () => toast.error('Failed to create workflow'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Workflow</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ name, description });
          }}
        >
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="wf-create-name">Name</Label>
              <Input
                id="wf-create-name"
                placeholder="My Workflow"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wf-create-desc">Description (optional)</Label>
              <Textarea
                id="wf-create-desc"
                placeholder="What does this workflow do?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
