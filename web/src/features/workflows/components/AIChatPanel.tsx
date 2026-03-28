import { useMutation } from '@tanstack/react-query';
import { Key, Loader2, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { aiApi } from '@/api/ai';
import { secretApi } from '@/api/secrets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [missingSecrets, setMissingSecrets] = useState<string[]>([]);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [savingSecrets, setSavingSecrets] = useState(false);

  const mutation = useMutation({
    mutationFn: (userPrompt: string) => aiApi.generateWorkflow({ prompt: userPrompt }),
    onSuccess: (data) => {
      setSummary(data.summary);
      onWorkflowGenerated(data.steps, data.edges, data.input_schema);
      toast.success('Workflow generated');

      if (data.missing_secrets && data.missing_secrets.length > 0) {
        setMissingSecrets(data.missing_secrets);
        setSecretValues({});
      } else {
        setMissingSecrets([]);
      }
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
    setMissingSecrets([]);
    mutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSaveSecrets = async () => {
    setSavingSecrets(true);
    try {
      for (const key of missingSecrets) {
        const value = secretValues[key];
        if (!value) {
          toast.error(`Please enter a value for ${key}`);
          setSavingSecrets(false);
          return;
        }
        await secretApi.create({ key, value });
      }
      toast.success('Secrets saved');
      setMissingSecrets([]);
      setSecretValues({});
    } catch {
      toast.error('Failed to save secrets');
    } finally {
      setSavingSecrets(false);
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

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
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

          {missingSecrets.length > 0 && (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-500" />
                <p className="font-medium text-sm">Secrets required</p>
              </div>
              <p className="text-muted-foreground text-xs">
                This workflow references secrets that don't exist yet. Enter the values below to
                create them.
              </p>
              <div className="space-y-2">
                {missingSecrets.map((key) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{key}</Label>
                    <Input
                      type="password"
                      value={secretValues[key] ?? ''}
                      onChange={(e) =>
                        setSecretValues((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={`Enter value for ${key}`}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={handleSaveSecrets}
                disabled={savingSecrets}
              >
                {savingSecrets ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Key className="mr-1.5 h-3 w-3" />
                    Save Secrets
                  </>
                )}
              </Button>
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
