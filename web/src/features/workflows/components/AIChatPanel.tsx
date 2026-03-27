import { useMutation } from '@tanstack/react-query';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { aiApi } from '@/api/ai';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { GeneratedEdge, GeneratedStep } from '@/types/ai';

interface AIChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorkflowGenerated: (
    steps: GeneratedStep[],
    edges: GeneratedEdge[],
    inputSchema?: Record<string, unknown>,
  ) => void;
}

export function AIChatPanel({ open, onOpenChange, onWorkflowGenerated }: AIChatPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [summary, setSummary] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (userPrompt: string) => aiApi.generateWorkflow({ prompt: userPrompt }),
    onSuccess: (data) => {
      setSummary(data.summary);
      onWorkflowGenerated(data.steps, data.edges, data.input_schema);
      toast.success('Workflow generated');
    },
    onError: (err: any) => {
      const message = err?.message || 'Failed to generate workflow. Please try again.';
      toast.error(message);
    },
  });

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || mutation.isPending) return;
    setSummary(null);
    mutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[400px] flex-col gap-0 p-0 sm:w-[440px]">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Workflow Generator
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 p-6">
          <p className="text-muted-foreground text-sm">
            Describe what you want your workflow to do, and AI will generate the steps and
            connections for you.
          </p>

          <Textarea
            placeholder="e.g. When a webhook fires, fetch user data from an API, check if the user is active, and send a notification email if they are"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={5}
            className="resize-none"
            disabled={mutation.isPending}
          />

          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || mutation.isPending}
            className="w-full"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Generate Workflow
              </>
            )}
          </Button>

          {summary && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="mb-1 font-medium text-sm">Generated workflow</p>
              <p className="text-muted-foreground text-sm">{summary}</p>
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Tip: After generating, you can tweak individual steps in the config panel. Press{' '}
            <kbd className="rounded border bg-muted px-1 text-[10px]">Cmd+Enter</kbd> to generate.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
