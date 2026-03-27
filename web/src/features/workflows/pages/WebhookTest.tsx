import { useQuery } from '@tanstack/react-query';
import { Copy, Play, Terminal } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { workflowApi } from '@/api/workflows';
import { JsonViewer } from '@/components/editors/CodeEditor';
import {
  JsonBuilder,
  RULES_JSON,
  schemaToTree,
  treeToJson,
} from '@/components/json-builder/JsonBuilder';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Workflow } from '@/types/workflow';

export default function WebhookTest() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonValue, setJsonValue] = useState<Record<string, any> | undefined>(undefined);
  const [response, setResponse] = useState<{ data: any; error?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [waitForResult, setWaitForResult] = useState(false);

  const { data: workflowsData } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.list({ limit: 100 }),
  });

  const webhookWorkflows = (workflowsData?.data ?? []).filter(
    (wf: Workflow) => wf.trigger_config?.webhook_enabled && wf.webhook_slug,
  );

  const selectedWorkflow = webhookWorkflows.find((wf: Workflow) => wf.id === selectedId);
  const baseWebhookUrl = selectedWorkflow
    ? `${window.location.origin}/webhooks/${selectedWorkflow.webhook_slug}`
    : '';
  const webhookUrl =
    waitForResult && baseWebhookUrl ? `${baseWebhookUrl}?wait=true` : baseWebhookUrl;

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setResponse(null);
      const wf = webhookWorkflows.find((w: Workflow) => w.id === id);
      if (wf?.input_schema) {
        // Convert schema to default values so JsonBuilder shows editable values
        const defaults = treeToJson(schemaToTree(wf.input_schema));
        setJsonValue(defaults);
      } else {
        setJsonValue(undefined);
      }
    },
    [webhookWorkflows],
  );

  const getPayload = useCallback(() => {
    return jsonValue ?? {};
  }, [jsonValue]);

  const handleSend = useCallback(async () => {
    if (!webhookUrl) return;
    setSending(true);
    setResponse(null);

    try {
      const payload = getPayload();
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setResponse({ data });
        toast.success('Webhook sent successfully');
      } else {
        setResponse({ data, error: `HTTP ${res.status}` });
        toast.error(`Webhook returned ${res.status}`);
      }
    } catch (err) {
      setResponse({ data: null, error: String(err) });
      toast.error('Failed to send webhook');
    } finally {
      setSending(false);
    }
  }, [webhookUrl, getPayload]);

  const handleCopyCurl = useCallback(() => {
    const payload = getPayload();
    const curl = `curl -X POST \\\n  '${webhookUrl}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(payload, null, 2)}'`;
    navigator.clipboard.writeText(curl);
    toast.success('Copied cURL command');
  }, [webhookUrl, getPayload]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Test Webhook</h1>
        <p className="text-muted-foreground">
          Select a webhook-enabled workflow and send a test payload
        </p>
      </div>

      <div className="space-y-6">
        {/* Workflow selector */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Workflow</span>
          <Select value={selectedId ?? ''} onValueChange={handleSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select a webhook-enabled workflow..." />
            </SelectTrigger>
            <SelectContent>
              {webhookWorkflows.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground">
                  No workflows with webhooks enabled
                </div>
              ) : (
                webhookWorkflows.map((wf: Workflow) => (
                  <SelectItem key={wf.id} value={wf.id}>
                    {wf.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {selectedWorkflow && (
          <>
            {/* Webhook URL */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Webhook URL</span>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <code className="flex-1 text-sm font-mono truncate">{webhookUrl}</code>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    toast.success('Copied webhook URL');
                  }}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Input builder */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Input Payload</span>
              <div className="rounded-md border p-3">
                {selectedWorkflow.input_schema ? (
                  <JsonBuilder
                    value={jsonValue}
                    onChange={setJsonValue}
                    rules={RULES_JSON}
                    emit="values"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    This workflow has no input schema defined. The webhook will be sent with an
                    empty payload.
                  </p>
                )}
              </div>
            </div>

            {/* Options + Actions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wait-for-result"
                  checked={waitForResult}
                  onCheckedChange={(v) => setWaitForResult(!!v)}
                />
                <label htmlFor="wait-for-result" className="text-sm">
                  Wait for result (sync mode)
                </label>
              </div>
              {waitForResult && (
                <p className="text-xs text-muted-foreground">
                  The request will wait up to 30 seconds for the workflow to complete and return the
                  output.
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button onClick={handleSend} disabled={sending}>
                  <Play className="mr-2 h-4 w-4" />
                  {sending
                    ? waitForResult
                      ? 'Waiting...'
                      : 'Sending...'
                    : waitForResult
                      ? 'Send & Wait'
                      : 'Send Webhook'}
                </Button>
                <Button variant="outline" onClick={handleCopyCurl}>
                  <Terminal className="mr-2 h-4 w-4" />
                  Copy as cURL
                </Button>
              </div>
            </div>

            {/* Response */}
            {response && (
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  Response
                  {response.error && (
                    <span className="ml-2 text-xs text-red-500">{response.error}</span>
                  )}
                </span>
                <div className="rounded-md border overflow-hidden">
                  {response.data ? (
                    <JsonViewer data={response.data} maxHeight="200px" />
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">No response body</p>
                  )}
                </div>
                {response.data?.execution_id && (
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => navigate(`/executions/${response.data.execution_id}`)}
                  >
                    View execution →
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
