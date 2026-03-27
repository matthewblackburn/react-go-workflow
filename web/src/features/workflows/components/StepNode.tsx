import { Handle, type NodeProps, Position } from '@xyflow/react';
import * as LucideIcons from 'lucide-react';
import { createContext, memo, useCallback, useContext } from 'react';
import { Badge } from '@/components/ui/badge';
import type { StepType } from '@/types/workflow';
import { StepReferenceInput } from './StepReferenceInput';

export type StepNodeOption = {
  id: string;
  label: string;
  isCondition: boolean;
  outputSchema?: Record<string, any>;
};

export const StepNodesContext = createContext<StepNodeOption[]>([]);
export const WorkflowInputSchemaContext = createContext<Record<string, any> | undefined>(undefined);
export const SecretKeysContext = createContext<string[]>([]);
export const ReadOnlyContext = createContext(false);

export interface StepNodeData {
  label: string;
  description?: string;
  stepType?: StepType;
  config?: Record<string, any>;
  waitForStepIds?: string[];
  /** For condition step dependencies: maps stepId → 'true' (Yes) or 'false' (No) */
  waitForBranches?: Record<string, 'true' | 'false'>;
  selected?: boolean;
}

type IconComponent = React.ComponentType<{ className?: string }>;

function getIcon(iconName?: string): IconComponent {
  if (!iconName) return LucideIcons.Box;
  const pascalName = iconName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  const icon = (LucideIcons as Record<string, any>)[pascalName];
  return (icon as IconComponent) ?? LucideIcons.Box;
}

const categoryColors: Record<string, string> = {
  trigger: 'border-purple-400 bg-purple-50 dark:bg-purple-950',
  action: 'border-blue-400 bg-blue-50 dark:bg-blue-950',
  logic: 'border-amber-400 bg-amber-50 dark:bg-amber-950',
  utility: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950',
};

const categoryBadgeColors: Record<string, string> = {
  trigger: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  action: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  logic: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  utility: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
};

interface QuickEditField {
  key: string;
  title: string;
  placeholder?: string;
  multiline?: boolean;
}

function getQuickEditFields(stepType?: StepType): QuickEditField[] {
  if (!stepType?.config_schema) return [];
  const props = stepType.config_schema.properties as Record<string, any> | undefined;
  if (!props) return [];

  const fields: QuickEditField[] = [];
  for (const [key, field] of Object.entries(props)) {
    if (!(field as any).quickEdit) continue;
    const f = field as Record<string, any>;
    const format = f.format as string | undefined;
    fields.push({
      key,
      title: (f.title as string) ?? key,
      placeholder: f.placeholder as string | undefined,
      multiline: format === 'textarea' || format === 'json' || format === 'sql',
    });
  }
  return fields;
}

function StepNodeComponent({ id, data, selected }: NodeProps & { data: StepNodeData }) {
  const Icon = getIcon(data.stepType?.icon);
  const category = data.stepType?.category ?? 'action';
  const outputs = data.stepType?.config_schema?.outputs as
    | { name: string; label: string; color?: string }[]
    | undefined;
  const hasMultipleOutputs = outputs && outputs.length > 1;
  const readOnly = useContext(ReadOnlyContext);
  const quickEditFields = readOnly ? [] : getQuickEditFields(data.stepType);
  const allStepNodes = useContext(StepNodesContext);
  const workflowInputSchema = useContext(WorkflowInputSchemaContext);

  const updateField = useCallback(
    (key: string, value: string) => {
      window.dispatchEvent(
        new CustomEvent('node-quick-edit', {
          detail: { nodeId: id, key, value },
        }),
      );
    },
    [id],
  );

  return (
    <div
      className={`w-[260px] rounded-lg border-2 px-4 py-3 shadow-sm transition-shadow ${
        categoryColors[category] ?? categoryColors.action
      } ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!h-3 !w-3 !border-2 !bg-background"
      />

      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-background/60 p-1.5">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm leading-tight">{data.label}</p>
          {data.stepType && (
            <Badge
              variant="secondary"
              className={`mt-1 px-1.5 py-0 text-[10px] ${categoryBadgeColors[category] ?? ''}`}
            >
              {data.stepType.display_name}
            </Badge>
          )}
        </div>
      </div>

      {quickEditFields.length > 0 && (
        <div className="nodrag nowheel mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {quickEditFields.map((field) => (
            <div key={field.key}>
              <span className="block font-medium text-[9px] text-muted-foreground uppercase tracking-wider">
                {field.title}
              </span>
              <div className="mt-0.5">
                <StepReferenceInput
                  value={String(data.config?.[field.key] ?? '')}
                  onChange={(v) => updateField(field.key, v)}
                  currentNodeId={id}
                  allStepNodes={allStepNodes}
                  workflowInputSchema={workflowInputSchema}
                  placeholder={field.placeholder}
                  multiline={field.multiline}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMultipleOutputs ? (
        outputs.map((output, i) => (
          <Handle
            key={output.name}
            type="source"
            position={Position.Right}
            id={output.name}
            isConnectable={false}
            className="!h-3 !w-3 !border-2"
            style={{
              top: `${((i + 1) / (outputs.length + 1)) * 100}%`,
              backgroundColor: output.color ?? 'hsl(var(--background))',
            }}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          className="!h-3 !w-3 !border-2 !bg-background"
        />
      )}
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
