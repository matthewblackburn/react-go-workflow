import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useContext, useState } from 'react';
import { workflowApi } from '@/api/workflows';
import { JsonViewer } from '@/components/editors/CodeEditor';
import { JsonBuilder, RULES_OUTPUT, RULES_SCHEMA } from '@/components/json-builder/JsonBuilder';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TypeBadge, VALUE_TYPES } from '@/components/ui/type-picker';
import type { StepResult } from '@/hooks/useExecutionWS';
import type { StepType, Workflow } from '@/types/workflow';
import { SecretKeysContext } from './StepNode';
import { StepReferenceInput, useReferenceMenuItems } from './StepReferenceInput';
import { WaitForStepsSelect } from './WaitForStepsSelect';

interface StepOption {
  id: string;
  label: string;
  isCondition: boolean;
  stepTypeName?: string;
  outputSchema?: Record<string, any>;
}

interface ConfigPanelProps {
  stepName: string;
  stepType?: StepType;
  config: Record<string, any>;
  currentNodeId: string;
  allStepNodes: StepOption[];
  waitForStepIds: string[];
  waitForBranches: Record<string, 'true' | 'false'>;
  stepResult?: StepResult;
  workflowInputSchema?: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  onNameChange: (name: string) => void;
  onWaitForChange: (ids: string[]) => void;
  onBranchChange: (branches: Record<string, 'true' | 'false'>) => void;
  onClose: () => void;
}

function formatDuration(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ResultsTab({ result }: { result: StepResult }) {
  const duration = formatDuration(result.startedAt, result.completedAt);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        {result.status === 'completed' && <CircleCheck className="h-4 w-4 text-green-500" />}
        {result.status === 'failed' && <CircleX className="h-4 w-4 text-red-500" />}
        {result.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        <span className="font-medium text-sm capitalize">{result.status}</span>
        {duration && <span className="text-muted-foreground text-xs">{duration}</span>}
      </div>

      {result.error && (
        <div className="space-y-1">
          <Label className="text-red-500 text-xs">Error</Label>
          <pre className="max-h-120px overflow-auto whitespace-pre-wrap rounded-md bg-red-50 p-3 text-red-700 text-xs dark:bg-red-950 dark:text-red-300">
            {result.error}
          </pre>
        </div>
      )}

      {result.output && (
        <div className="space-y-1">
          <Label className="text-xs">Output</Label>
          <JsonViewer data={result.output} maxHeight="300px" />
        </div>
      )}

      {!result.output && !result.error && result.status === 'completed' && (
        <p className="text-muted-foreground text-xs">No output data</p>
      )}
    </div>
  );
}

export function ConfigPanel({
  stepName,
  stepType,
  config,
  currentNodeId,
  allStepNodes,
  waitForStepIds,
  waitForBranches,
  stepResult,
  workflowInputSchema,
  onConfigChange,
  onNameChange,
  onWaitForChange,
  onBranchChange,
  onClose,
}: ConfigPanelProps) {
  const hasResult = !!stepResult;

  return (
    <div className="flex h-full min-h-0 w-80 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold text-sm">{stepName}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {hasResult ? (
        <Tabs defaultValue="configure" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full rounded-none border-b bg-transparent px-2">
            <TabsTrigger value="configure" className="flex-1 text-xs">
              Configure
            </TabsTrigger>
            <TabsTrigger value="results" className="flex-1 gap-1.5 text-xs">
              Results
              {stepResult?.status === 'completed' && (
                <CircleCheck className="h-3 w-3 text-green-500" />
              )}
              {stepResult?.status === 'failed' && <CircleX className="h-3 w-3 text-red-500" />}
              {stepResult?.status === 'running' && (
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="results" className="mt-0 min-h-0 flex-1">
            <ScrollArea className="h-full">
              <ResultsTab result={stepResult!} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="configure" className="mt-0 min-h-0 flex-1">
            <ScrollArea className="h-full">
              <ConfigureContent
                stepName={stepName}
                stepType={stepType}
                config={config}
                currentNodeId={currentNodeId}
                allStepNodes={allStepNodes}
                waitForStepIds={waitForStepIds}
                waitForBranches={waitForBranches}
                onConfigChange={onConfigChange}
                onNameChange={onNameChange}
                onWaitForChange={onWaitForChange}
                onBranchChange={onBranchChange}
                workflowInputSchema={workflowInputSchema}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ConfigureContent
            stepName={stepName}
            stepType={stepType}
            config={config}
            currentNodeId={currentNodeId}
            allStepNodes={allStepNodes}
            waitForStepIds={waitForStepIds}
            waitForBranches={waitForBranches}
            onConfigChange={onConfigChange}
            onNameChange={onNameChange}
            onWaitForChange={onWaitForChange}
            onBranchChange={onBranchChange}
          />
        </ScrollArea>
      )}
    </div>
  );
}

// ── Typed value input (type badge + matching input) ──

function detectValueType(val: string): string {
  if (val === 'true' || val === 'false') return 'boolean';
  if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return 'datetime';
  if (val !== '' && !Number.isNaN(Number(val)) && !val.startsWith('{{')) return 'number';
  return 'string';
}

function TypedValueInput({
  value,
  onChange,
  currentNodeId,
  allStepNodes,
  workflowInputSchema,
}: {
  value: string;
  onChange: (value: string) => void;
  currentNodeId: string;
  allStepNodes: StepOption[];
  workflowInputSchema?: Record<string, any>;
}) {
  const [valueType, setValueType] = useState(() => detectValueType(value));

  const handleTypeChange = (newType: string) => {
    setValueType(newType);
    if (newType === 'boolean') onChange('false');
    else if (newType === 'number') onChange('0');
    else if (newType === 'datetime') onChange(new Date().toISOString());
    else onChange('');
  };

  return (
    <div className="flex items-center gap-1.5">
      <TypeBadge type={valueType} types={VALUE_TYPES} onChange={handleTypeChange} />

      {valueType === 'boolean' ? (
        <div className="flex flex-1 items-center gap-2">
          <Checkbox
            checked={value === 'true'}
            onCheckedChange={(v) => onChange(v ? 'true' : 'false')}
          />
          <span className="text-muted-foreground text-xs">
            {value === 'true' ? 'True' : 'False'}
          </span>
        </div>
      ) : valueType === 'datetime' ? (
        <Input
          type="datetime-local"
          value={toLocalDatetime(value)}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val ? new Date(val).toISOString() : '');
          }}
          className="h-8 flex-1 text-xs"
        />
      ) : valueType === 'number' ? (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 flex-1 text-xs"
        />
      ) : (
        <div className="flex-1">
          <StepReferenceInput
            value={value}
            onChange={onChange}
            currentNodeId={currentNodeId}
            allStepNodes={allStepNodes}
            workflowInputSchema={workflowInputSchema}
            placeholder="Enter value..."
          />
        </div>
      )}
    </div>
  );
}

// ── Key-value pair editor (for headers, object with additionalProperties) ──

function KeyValueEditor({
  value,
  onChange,
  currentNodeId,
  allStepNodes,
  workflowInputSchema,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  currentNodeId: string;
  allStepNodes: StepOption[];
  workflowInputSchema?: Record<string, any>;
}) {
  const entries = Object.entries(value ?? {});

  const updateEntry = (idx: number, key: string, val: string) => {
    const newEntries = [...entries];
    newEntries[idx] = [key, val];
    onChange(Object.fromEntries(newEntries));
  };

  const removeEntry = (idx: number) => {
    const newEntries = entries.filter((_, i) => i !== idx);
    onChange(Object.fromEntries(newEntries));
  };

  const addEntry = () => {
    onChange({ ...value, '': '' });
  };

  return (
    <div className="space-y-1.5">
      {entries.map(([k, v], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: order is stable
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={k}
            onChange={(e) => updateEntry(i, e.target.value, v)}
            placeholder="Key"
            className="h-7 flex-1 text-xs"
          />
          <div className="flex-1">
            <StepReferenceInput
              value={v}
              onChange={(val) => updateEntry(i, k, val)}
              currentNodeId={currentNodeId}
              allStepNodes={allStepNodes}
              workflowInputSchema={workflowInputSchema}
              placeholder="Value"
            />
          </div>
          <button
            type="button"
            onClick={() => removeEntry(i)}
            className="p-1 text-muted-foreground hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Add
      </button>
    </div>
  );
}

// ── String array editor (for parameters) ──

function StringArrayEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const items = value ?? [];

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: order is stable
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder ?? `Item ${i + 1}`}
            className="h-7 flex-1 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="p-1 text-muted-foreground hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Add
      </button>
    </div>
  );
}

// ── Workflow picker (for sub_workflow) ──

function WorkflowPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { data } = useQuery({
    queryKey: ['workflows-picker'],
    queryFn: () => workflowApi.list({ limit: 100 }),
  });
  const workflows: Workflow[] = data?.data ?? [];

  return (
    <Select value={value || 'none'} onValueChange={(v) => onChange(v === 'none' ? '' : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Select a workflow..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        {workflows.map((wf) => (
          <SelectItem key={wf.id} value={wf.id}>
            {wf.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Convert an ISO string to the format datetime-local expects: YYYY-MM-DDTHH:mm */
function toLocalDatetime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

function ConfigureContent({
  stepName,
  stepType,
  config,
  currentNodeId,
  allStepNodes,
  waitForStepIds,
  waitForBranches,
  workflowInputSchema,
  onConfigChange,
  onNameChange,
  onWaitForChange,
  onBranchChange,
}: {
  stepName: string;
  stepType?: StepType;
  config: Record<string, any>;
  currentNodeId: string;
  allStepNodes: StepOption[];
  waitForStepIds: string[];
  waitForBranches: Record<string, 'true' | 'false'>;
  workflowInputSchema?: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  onNameChange: (name: string) => void;
  onWaitForChange: (ids: string[]) => void;
  onBranchChange: (branches: Record<string, 'true' | 'false'>) => void;
}) {
  const schema = stepType?.config_schema;
  const properties = (schema?.properties as Record<string, any>) ?? {};

  function updateField(key: string, value: any) {
    onConfigChange({ ...config, [key]: value });
  }

  const secretKeys = useContext(SecretKeysContext);

  const variables = allStepNodes
    .filter((s) => s.id !== currentNodeId && s.stepTypeName === 'set_variable' && s.outputSchema?.properties)
    .flatMap((s) => {
      const props = s.outputSchema?.properties as Record<string, any> | undefined;
      if (!props) return [];
      return Object.keys(props).map((varName) => ({
        stepLabel: s.label,
        variableName: varName,
      }));
    });

  const referenceMenuItems = useReferenceMenuItems({
    allStepNodes,
    currentNodeId,
    workflowInputSchema,
    secretKeys,
    variables,
  });

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <Label htmlFor="step-name">Step Name</Label>
        <Input
          id="step-name"
          value={stepName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Name this step"
        />
      </div>

      {stepType && <p className="text-muted-foreground text-xs">{stepType.description}</p>}

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">Wait for steps</Label>
        <p className="text-[11px] text-muted-foreground">
          This step runs after the selected steps complete
        </p>
        <WaitForStepsSelect
          currentNodeId={currentNodeId}
          allStepNodes={allStepNodes}
          selectedIds={waitForStepIds}
          branches={waitForBranches}
          onChange={onWaitForChange}
          onBranchChange={onBranchChange}
        />
      </div>

      {stepType?.output_schema?.dynamicOutput && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs">Output Schema</Label>
            <p className="text-[11px] text-muted-foreground">
              Define the fields this step will output so other steps can reference them
            </p>
            <div className="rounded-md border p-3">
              <JsonBuilder
                value={config._outputSchema as Record<string, any> | undefined}
                onChange={(v) => onConfigChange({ ...config, _outputSchema: v })}
                rules={RULES_SCHEMA}
                emit="schema"
              />
            </div>
          </div>
        </>
      )}

      {Object.keys(properties).length > 0 && (
        <>
          <Separator />
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Configuration
          </p>
        </>
      )}

      {Object.entries(properties).map(([key, fieldDef]) => {
        const field = fieldDef as Record<string, any>;
        const title = (field.title as string) ?? key;
        const description = field.description as string | undefined;
        const fieldType = field.type as string;
        const enumValues = field.enum as string[] | undefined;
        const format = field.format as string | undefined;
        const placeholder = field.placeholder as string | undefined;
        const currentValue = config[key] ?? field.default ?? '';

        // Conditional visibility
        if (field.dependsOn) {
          const dep = field.dependsOn as Record<string, any>;
          if (dep.notEqual && (config[dep.field] === dep.notEqual || !config[dep.field]))
            return null;
          if (dep.equals && config[dep.field] !== dep.equals) return null;
        }

        // Object with additionalProperties → key-value editor
        const hasAdditionalProps = fieldType === 'object' && field.additionalProperties;

        // Array of strings → string list editor
        const isStringArray = fieldType === 'array' && field.items?.type === 'string';


        // Workflow picker
        const isWorkflowPicker = format === 'workflow-picker';

        // Boolean toggle
        const isBoolField = fieldType === 'boolean';

        const isStringField =
          !enumValues &&
          !hasAdditionalProps &&
          !isStringArray &&
          !isWorkflowPicker &&
          !isBoolField &&
          fieldType !== 'number' &&
          format !== 'password' &&
          format !== 'datetime' &&
          format !== 'typed-value';
        const isMultiline = format === 'textarea' || format === 'json' || format === 'sql';

        return (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`field-${key}`} className="text-xs">
              {title}
            </Label>
            {isWorkflowPicker ? (
              <WorkflowPicker value={String(currentValue)} onChange={(v) => updateField(key, v)} />
            ) : format === 'json-builder' ? (
              <div className="rounded-md border p-3">
                <JsonBuilder
                  value={(config[key] as Record<string, any>) ?? undefined}
                  onChange={(v) => updateField(key, v)}
                  rules={RULES_OUTPUT}
                  emit="values"
                  valueMenuItems={referenceMenuItems}
                />
              </div>
            ) : hasAdditionalProps ? (
              <KeyValueEditor
                value={(config[key] as Record<string, string>) ?? {}}
                onChange={(v) => updateField(key, v)}
                currentNodeId={currentNodeId}
                allStepNodes={allStepNodes}
                workflowInputSchema={workflowInputSchema}
              />
            ) : isStringArray ? (
              <StringArrayEditor
                value={(config[key] as string[]) ?? []}
                onChange={(v) => updateField(key, v)}
                placeholder={placeholder}
              />
            ) : isBoolField ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`field-${key}`}
                  checked={!!currentValue}
                  onCheckedChange={(v) => updateField(key, !!v)}
                />
                <label htmlFor={`field-${key}`} className="text-muted-foreground text-xs">
                  {currentValue ? 'Enabled' : 'Disabled'}
                </label>
              </div>
            ) : enumValues ? (
              <Select value={String(currentValue)} onValueChange={(v) => updateField(key, v)}>
                <SelectTrigger id={`field-${key}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {enumValues.map((val) => (
                    <SelectItem key={val} value={val}>
                      {val}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : format === 'typed-value' ? (
              <TypedValueInput
                value={String(currentValue)}
                onChange={(v) => updateField(key, v)}
                currentNodeId={currentNodeId}
                allStepNodes={allStepNodes}
                workflowInputSchema={workflowInputSchema}
              />
            ) : format === 'datetime' ? (
              <Input
                id={`field-${key}`}
                type="datetime-local"
                value={toLocalDatetime(String(currentValue))}
                onChange={(e) => {
                  const val = e.target.value;
                  updateField(key, val ? new Date(val).toISOString() : '');
                }}
                className="text-xs"
              />
            ) : format === 'password' ? (
              <Input
                id={`field-${key}`}
                type="password"
                value={String(currentValue)}
                onChange={(e) => updateField(key, e.target.value)}
                placeholder={placeholder}
              />
            ) : fieldType === 'number' ? (
              <Input
                id={`field-${key}`}
                type="number"
                value={currentValue}
                onChange={(e) => updateField(key, Number(e.target.value))}
                placeholder={placeholder}
                min={field.minimum as number | undefined}
                max={field.maximum as number | undefined}
              />
            ) : isStringField ? (
              <StepReferenceInput
                value={String(currentValue)}
                onChange={(v) => updateField(key, v)}
                currentNodeId={currentNodeId}
                allStepNodes={allStepNodes}
                workflowInputSchema={workflowInputSchema}
                placeholder={placeholder ?? `Enter ${title.toLowerCase()}...`}
                multiline={isMultiline}
              />
            ) : (
              <Input
                id={`field-${key}`}
                value={String(currentValue)}
                onChange={(e) => updateField(key, e.target.value)}
                placeholder={placeholder ?? `Enter ${title.toLowerCase()}...`}
              />
            )}
            {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
          </div>
        );
      })}

    </div>
  );
}
