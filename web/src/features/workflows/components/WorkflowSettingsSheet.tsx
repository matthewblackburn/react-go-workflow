import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Loader2,
  Play,
  Save,
  X,
} from 'lucide-react';
import { useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { executionApi, workflowApi } from '@/api/workflows';
import { JsonViewer } from '@/components/editors/CodeEditor';
import {
  JsonBuilder,
  RULES_OUTPUT,
} from '@/components/json-builder/JsonBuilder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { Workflow, WorkflowExecution } from '@/types/workflow';
import { CronBuilder } from './CronBuilder';
import { SecretKeysContext, StepNodesContext, WorkflowInputSchemaContext } from './StepNode';
import { useReferenceMenuItems } from './StepReferenceInput';
import { TableSelect } from './TableSelect';
import { TimezoneSelect } from './TimezoneSelect';

interface WorkflowSettingsSheetProps {
  workflow: Workflow | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDuration(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const statusIcons: Record<string, React.ReactNode> = {
  completed: <CircleCheck className="h-4 w-4 text-green-500" />,
  failed: <CircleX className="h-4 w-4 text-red-500" />,
  running: <Play className="h-4 w-4 fill-blue-500 text-blue-500" />,
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  cancelled: <CircleX className="h-4 w-4 text-muted-foreground" />,
};

function GeneralTab({ workflow, onSaved }: { workflow: Workflow; onSaved: () => void }) {
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? '');
  const [status, setStatus] = useState(workflow.status);
  const [concurrency, setConcurrency] = useState(workflow.concurrency);
  const [timeout, setTimeout] = useState(workflow.timeout_seconds ?? 0);

  useEffect(() => {
    setName(workflow.name);
    setDescription(workflow.description ?? '');
    setStatus(workflow.status);
    setConcurrency(workflow.concurrency);
    setTimeout(workflow.timeout_seconds ?? 0);
  }, [workflow]);

  const mutation = useMutation({
    mutationFn: () =>
      workflowApi.update(workflow.id, {
        name,
        description,
        status,
        concurrency,
        timeout_seconds: timeout || undefined,
      }),
    onSuccess: () => {
      toast.success('Settings saved');
      onSaved();
    },
    onError: () => toast.error('Failed to save settings'),
  });

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="wf-name">Name</Label>
            <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wf-desc">Description</Label>
            <Textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does this workflow do?"
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Workflow['status'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Concurrency</Label>
            <Select
              value={concurrency}
              onValueChange={(v) => setConcurrency(v as Workflow['concurrency'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow parallel runs</SelectItem>
                <SelectItem value="skip">Skip if already running</SelectItem>
                <SelectItem value="queue">Queue and run sequentially</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              What happens when this workflow is triggered while already running
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wf-timeout">Timeout (seconds)</Label>
            <Input
              id="wf-timeout"
              type="number"
              value={timeout || ''}
              onChange={(e) => setTimeout(Number(e.target.value))}
              placeholder="No timeout"
              min={1}
              max={86400}
            />
            <p className="text-[11px] text-muted-foreground">
              Maximum time the workflow can run before being cancelled
            </p>
          </div>
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>
    </>
  );
}

function TriggerSection({
  title,
  description,
  icon,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${enabled ? 'border-primary/30 bg-primary/5' : 'border-border'}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">{title}</h4>
            <button
              type="button"
              onClick={() => onToggle(!enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                enabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {enabled && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

function TriggersTab({ workflow, onSaved }: { workflow: Workflow; onSaved: () => void }) {
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>(
    workflow.trigger_config ?? {},
  );
  const [webhookSlug, setWebhookSlug] = useState(workflow.webhook_slug ?? '');

  useEffect(() => {
    setTriggerConfig(workflow.trigger_config ?? {});
    setWebhookSlug(workflow.webhook_slug ?? '');
  }, [workflow]);

  const mutation = useMutation({
    mutationFn: () => {
      const updates: Partial<Workflow> = { trigger_config: triggerConfig };
      if (webhookSlug) {
        (updates as any).webhook_slug = webhookSlug;
      }
      return workflowApi.update(workflow.id, updates);
    },
    onSuccess: () => {
      toast.success('Trigger settings saved');
      onSaved();
    },
    onError: () => toast.error('Failed to save trigger settings'),
  });

  function updateConfig(key: string, value: any) {
    setTriggerConfig((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTrigger(key: string, enabled: boolean) {
    setTriggerConfig((prev) => ({ ...prev, [`${key}_enabled`]: enabled }));
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          <p className="text-muted-foreground text-xs">
            All workflows can be run manually. Enable additional triggers below.
          </p>

          <TriggerSection
            title="Schedule (Cron)"
            description="Run this workflow on a recurring schedule"
            icon={<Clock className="h-4 w-4" />}
            enabled={triggerConfig.cron_enabled ?? false}
            onToggle={(v) => toggleTrigger('cron', v)}
          >
            <CronBuilder
              value={triggerConfig.cron_expression ?? ''}
              onChange={(v) => updateConfig('cron_expression', v)}
            />
            <div className="space-y-2">
              <Label className="text-xs">Timezone</Label>
              <TimezoneSelect
                value={triggerConfig.cron_timezone ?? ''}
                onChange={(v) => updateConfig('cron_timezone', v)}
              />
            </div>
          </TriggerSection>

          <TriggerSection
            title="Webhook"
            description="Trigger via HTTP POST request"
            icon={<Globe className="h-4 w-4" />}
            enabled={triggerConfig.webhook_enabled ?? !!workflow.webhook_slug}
            onToggle={(v) => {
              toggleTrigger('webhook', v);
              // Generate a slug when enabling if none exists
              if (v && !webhookSlug) {
                setWebhookSlug(crypto.randomUUID());
              }
            }}
          >
            {webhookSlug ? (
              <div className="space-y-2">
                <Label className="text-xs">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/webhooks/${webhookSlug}`}
                    className="font-mono text-[11px]"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/webhooks/${webhookSlug}`,
                      );
                      toast.success('Copied to clipboard');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setWebhookSlug(crypto.randomUUID())}
              >
                Generate Webhook URL
              </Button>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                id="webhook-sync"
                checked={triggerConfig.webhook_sync ?? false}
                onCheckedChange={(v) => updateConfig('webhook_sync', !!v)}
              />
              <label htmlFor="webhook-sync" className="text-xs">
                Wait for completion (sync mode)
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {triggerConfig.webhook_sync
                ? 'Webhook requests will wait for the workflow to finish and return the output.'
                : 'Send a POST request to this URL to trigger the workflow. The request body becomes the workflow input.'}
            </p>
          </TriggerSection>

          <TriggerSection
            title="Database Event"
            description="Trigger when a database table changes"
            icon={<Database className="h-4 w-4" />}
            enabled={triggerConfig.db_event_enabled ?? false}
            onToggle={(v) => toggleTrigger('db_event', v)}
          >
            <div className="space-y-2">
              <Label className="text-xs">Table Name</Label>
              <TableSelect
                value={triggerConfig.db_table ?? ''}
                onChange={(v) => updateConfig('db_table', v)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Event Type</Label>
              <Select
                value={triggerConfig.db_event ?? 'insert'}
                onValueChange={(v) => updateConfig('db_event', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="insert">Insert</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TriggerSection>
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Triggers
        </Button>
      </div>
    </>
  );
}

function JsonModal({
  title,
  data,
  open,
  onOpenChange,
}: {
  title: string;
  data: Record<string, any>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-[90vw] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <JsonViewer data={data} maxHeight="60vh" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExecutionDetail({ executionId }: { executionId: string }) {
  const [modalData, setModalData] = useState<{ title: string; data: Record<string, any> } | null>(
    null,
  );
  const { data, isLoading } = useQuery({
    queryKey: ['execution', executionId],
    queryFn: () => executionApi.get(executionId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const execution = data as WorkflowExecution | undefined;
  const steps = execution?.edges?.step_executions ?? [];

  if (steps.length === 0) {
    return (
      <div className="space-y-2 px-4 py-2">
        <p className="text-muted-foreground text-xs">No step data available</p>
        {execution?.error && (
          <pre className="whitespace-pre-wrap break-words rounded bg-red-50 p-2 text-[11px] text-red-500 dark:bg-red-950">
            {execution.error}
          </pre>
        )}
        {execution?.output && Object.keys(execution.output).length > 0 && (
          <details>
            <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
              Output
            </summary>
            <JsonViewer data={execution.output} />
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 px-2 pb-2">
      {steps.map((step) => {
        const duration = formatDuration(step.started_at, step.completed_at);
        const stepName = step.edges?.step?.name ?? step.step_id;
        return (
          <div key={step.id} className="rounded-md bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              {statusIcons[step.status] ?? statusIcons.pending}
              <span className="flex-1 truncate font-medium text-xs">{stepName}</span>
              <span className="text-[10px] text-muted-foreground capitalize">{step.status}</span>
              {duration && <span className="text-[10px] text-muted-foreground">{duration}</span>}
            </div>
            {step.error && (
              <pre className="mt-1.5 overflow-hidden whitespace-pre-wrap break-words text-[10px] text-red-500">
                {step.error}
              </pre>
            )}
            {step.output && Object.keys(step.output).length > 0 && (
              <details className="group mt-1.5">
                <summary className="flex cursor-pointer list-none items-center text-[10px] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="mr-1 h-3 w-3 shrink-0 -rotate-90 transition-transform group-open:rotate-0" />
                  Output
                  <button
                    type="button"
                    className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      setModalData({ title: stepName, data: step.output! });
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </summary>
                <JsonViewer data={step.output} />
              </details>
            )}
          </div>
        );
      })}
      <JsonModal
        title={`${modalData?.title ?? ''} — Output`}
        data={modalData?.data ?? {}}
        open={!!modalData}
        onOpenChange={(open) => {
          if (!open) setModalData(null);
        }}
      />
    </div>
  );
}

export function InputTab({ workflow, onSaved }: { workflow: Workflow; onSaved: () => void }) {
  const [schema, setSchema] = useState<Record<string, any> | undefined>(workflow.input_schema);

  useEffect(() => {
    setSchema(workflow.input_schema);
  }, [workflow]);

  const mutation = useMutation({
    mutationFn: () => workflowApi.update(workflow.id, { input_schema: schema ?? {} }),
    onSuccess: () => {
      toast.success('Input schema saved');
      onSaved();
    },
    onError: () => toast.error('Failed to save input schema'),
  });

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <p className="text-muted-foreground text-xs">
            Define the fields this workflow expects when triggered. Reference them in steps using{' '}
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/15 px-1 py-0.5 font-medium text-[10px] text-sky-500">
              @Workflow Input
            </span>
          </p>
          <JsonBuilder value={schema} onChange={setSchema} />
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Input Schema
        </Button>
      </div>
    </>
  );
}

export function OutputTab({ workflow, onSaved }: { workflow: Workflow; onSaved: () => void }) {
  const [outputSchema, setOutputSchema] = useState<Record<string, any> | undefined>(
    workflow.output_schema,
  );
  const allStepNodes = useContext(StepNodesContext);
  const workflowInputSchema = useContext(WorkflowInputSchemaContext);

  useEffect(() => {
    setOutputSchema(workflow.output_schema);
  }, [workflow]);

  const mutation = useMutation({
    mutationFn: () => workflowApi.update(workflow.id, { output_schema: outputSchema ?? {} }),
    onSuccess: () => {
      toast.success('Output mapping saved');
      onSaved();
    },
    onError: () => toast.error('Failed to save output mapping'),
  });

  const secretKeys = useContext(SecretKeysContext);
  const variables = allStepNodes
    .filter((s) => s.stepTypeName === 'set_variable' && s.outputSchema?.properties)
    .flatMap((s) => {
      const props = s.outputSchema?.properties as Record<string, any> | undefined;
      if (!props) return [];
      return Object.keys(props).map((varName) => ({
        stepLabel: s.label,
        variableName: varName,
      }));
    });
  const valueMenuItems = useReferenceMenuItems({
    allStepNodes,
    workflowInputSchema,
    secretKeys,
    variables,
  });

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <p className="text-muted-foreground text-xs">
            Define the output this workflow produces. Set each field's value using{' '}
            <span className="inline-flex items-center gap-0.5 rounded bg-violet-500/15 px-1 py-0.5 font-medium text-[10px] text-violet-500">
              @Step
            </span>{' '}
            references. When triggered via a synchronous webhook, this is returned in the response.
          </p>
          <JsonBuilder
            value={outputSchema}
            onChange={setOutputSchema}
            rules={RULES_OUTPUT}
            emit="values"
            valueMenuItems={valueMenuItems}
          />
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Output Mapping
        </Button>
      </div>
    </>
  );
}

function NotificationsTab({ workflow, onSaved }: { workflow: Workflow; onSaved: () => void }) {
  const [settings, setSettings] = useState<
    { enabled: boolean; channel: string; config: Record<string, any>; notify_on: string }[]
  >(() => {
    const ns = workflow.edges?.notification_settings ?? [];
    if (ns.length === 0) {
      return [
        { enabled: false, channel: 'in_app', config: {}, notify_on: 'failure' },
        { enabled: false, channel: 'webhook', config: {}, notify_on: 'failure' },
      ];
    }
    // Ensure both channels exist
    const result = ns.map((s) => ({
      enabled: s.enabled,
      channel: s.channel,
      config: s.config ?? {},
      notify_on: s.notify_on,
    }));
    if (!result.find((s) => s.channel === 'in_app')) {
      result.unshift({ enabled: false, channel: 'in_app', config: {}, notify_on: 'failure' });
    }
    if (!result.find((s) => s.channel === 'webhook')) {
      result.push({ enabled: false, channel: 'webhook', config: {}, notify_on: 'failure' });
    }
    return result;
  });

  useEffect(() => {
    const ns = workflow.edges?.notification_settings ?? [];
    if (ns.length > 0) {
      const result = ns.map((s) => ({
        enabled: s.enabled,
        channel: s.channel,
        config: s.config ?? {},
        notify_on: s.notify_on,
      }));
      if (!result.find((s) => s.channel === 'in_app')) {
        result.unshift({ enabled: false, channel: 'in_app', config: {}, notify_on: 'failure' });
      }
      if (!result.find((s) => s.channel === 'webhook')) {
        result.push({ enabled: false, channel: 'webhook', config: {}, notify_on: 'failure' });
      }
      setSettings(result);
    }
  }, [workflow]);

  const mutation = useMutation({
    mutationFn: () =>
      workflowApi.update(workflow.id, {
        notification_settings: settings.filter((s) => s.enabled),
      } as any),
    onSuccess: () => {
      toast.success('Notification settings saved');
      onSaved();
    },
    onError: () => toast.error('Failed to save notification settings'),
  });

  function updateSetting(channel: string, updates: Partial<(typeof settings)[0]>) {
    setSettings((prev) => prev.map((s) => (s.channel === channel ? { ...s, ...updates } : s)));
  }

  const channelLabels: Record<string, string> = {
    in_app: 'In-App Notifications',
    webhook: 'Webhook',
  };
  const channelDescriptions: Record<string, string> = {
    in_app: 'Show notifications in the bell icon when this workflow completes or fails',
    webhook: 'POST a JSON payload to a URL when this workflow completes or fails',
  };

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          <p className="text-muted-foreground text-xs">
            Get notified when this workflow finishes running.
          </p>

          {settings.map((setting) => (
            <TriggerSection
              key={setting.channel}
              title={channelLabels[setting.channel] ?? setting.channel}
              description={channelDescriptions[setting.channel] ?? ''}
              icon={
                setting.channel === 'in_app' ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <Globe className="h-4 w-4" />
                )
              }
              enabled={setting.enabled}
              onToggle={(v) => updateSetting(setting.channel, { enabled: v })}
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Notify on</Label>
                  <Select
                    value={setting.notify_on}
                    onValueChange={(v) => updateSetting(setting.channel, { notify_on: v })}
                  >
                    <SelectTrigger size="sm" className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="failure">Failure only</SelectItem>
                      <SelectItem value="success">Success only</SelectItem>
                      <SelectItem value="all">All completions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {setting.channel === 'webhook' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Webhook URL</Label>
                    <Input
                      value={setting.config.url ?? ''}
                      onChange={(e) =>
                        updateSetting('webhook', {
                          config: { ...setting.config, url: e.target.value },
                        })
                      }
                      placeholder="https://example.com/webhook"
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </div>
            </TriggerSection>
          ))}
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t p-4">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? 'Saving...' : 'Save Notifications'}
        </Button>
      </div>
    </>
  );
}

function HistoryTab({ workflowId }: { workflowId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['workflow-executions', workflowId],
    queryFn: () => workflowApi.listExecutions(workflowId),
    refetchOnWindowFocus: true,
  });

  const executions = (data as any)?.data as WorkflowExecution[] | undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!executions?.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground text-sm">No executions yet</p>
        <p className="mt-1 text-muted-foreground text-xs">Click Run to execute this workflow</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {executions.map((exec) => {
        const duration = formatDuration(exec.started_at, exec.completed_at);
        const isExpanded = expandedId === exec.id;
        return (
          <div key={exec.id}>
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : exec.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              {statusIcons[exec.status] ?? statusIcons.pending}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {exec.trigger_type}
                  </Badge>
                  <span className="text-muted-foreground text-xs capitalize">{exec.status}</span>
                </div>
                {exec.error && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-red-500">{exec.error}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-muted-foreground text-xs">
                  {timeAgo(exec.started_at ?? exec.date_created)}
                </p>
                {duration && <p className="text-[10px] text-muted-foreground">{duration}</p>}
              </div>
            </button>
            {isExpanded && <ExecutionDetail executionId={exec.id} />}
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowSettingsSheet({
  workflow,
  open,
  onOpenChange,
}: WorkflowSettingsSheetProps) {
  const queryClient = useQueryClient();

  const handleSaved = useCallback(() => {
    if (workflow) {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] });
    }
  }, [queryClient, workflow]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[400px] flex-col gap-0 p-0 sm:w-[440px]" showCloseButton={false}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-sm">Workflow Settings</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {workflow ? (
          <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="w-full rounded-none border-b bg-transparent px-4">
              <TabsTrigger value="general" className="flex-1 text-xs">
                General
              </TabsTrigger>
              <TabsTrigger value="triggers" className="flex-1 text-xs">
                Triggers
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex-1 text-xs">
                Notifications
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 text-xs">
                History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-0 flex min-h-0 flex-1 flex-col">
              <GeneralTab workflow={workflow} onSaved={handleSaved} />
            </TabsContent>
            <TabsContent value="triggers" className="mt-0 flex min-h-0 flex-1 flex-col">
              <TriggersTab workflow={workflow} onSaved={handleSaved} />
            </TabsContent>
            <TabsContent value="notifications" className="mt-0 flex min-h-0 flex-1 flex-col">
              <NotificationsTab workflow={workflow} onSaved={handleSaved} />
            </TabsContent>
            <TabsContent value="history" className="mt-0 min-h-0 flex-1">
              <ScrollArea className="h-full">
                <HistoryTab workflowId={workflow.id} />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
