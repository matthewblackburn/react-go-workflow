import { Check, ChevronDown, Import, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SchemaField {
  name: string;
  type: string;
  description: string;
  default?: any;
  properties?: SchemaField[];
  items?: SchemaField;
}

export interface JsonBuilderRules {
  showKey: boolean;
  editableKey: boolean;
  showValue: boolean;
  editableValue: boolean;
  canAddFields: boolean;
  canRemoveFields: boolean;
  canChangeType: boolean;
}

export interface ValueMenuItem {
  label: string;
  icon?: React.ReactNode;
  /** Renders the custom input for this value type */
  render: (props: { value: string; onChange: (v: string) => void }) => React.ReactNode;
  /** Returns true if a saved value string belongs to this menu item (for restoring UI state) */
  match: (value: string) => boolean;
  /** Initial value to seed when this menu item is selected from the type picker */
  seed?: string;
}

export const RULES_SCHEMA: JsonBuilderRules = {
  showKey: true,
  editableKey: true,
  showValue: false,
  editableValue: false,
  canAddFields: true,
  canRemoveFields: true,
  canChangeType: true,
};

export const RULES_JSON: JsonBuilderRules = {
  showKey: true,
  editableKey: false,
  showValue: true,
  editableValue: true,
  canAddFields: false,
  canRemoveFields: false,
  canChangeType: false,
};

export const RULES_OUTPUT: JsonBuilderRules = {
  showKey: true,
  editableKey: true,
  showValue: true,
  editableValue: true,
  canAddFields: true,
  canRemoveFields: true,
  canChangeType: true,
};

type EmitMode = 'schema' | 'values';

interface JsonBuilderProps {
  value: Record<string, any> | undefined;
  onChange: (data: Record<string, any> | undefined) => void;
  rules?: JsonBuilderRules;
  /** How to serialize the tree: 'schema' emits JSON Schema, 'values' emits flat JSON values */
  emit?: EmitMode;
  /** Custom value input types shown in a dropdown when editing values */
  valueMenuItems?: ValueMenuItem[];
}

// ── Type config ──────────────────────────────────────────────────────────────

const TYPES = [
  { value: 'string', label: 'String', letter: 'S', dot: 'bg-green-500', text: 'text-green-500' },
  { value: 'number', label: 'Number', letter: 'N', dot: 'bg-blue-500', text: 'text-blue-500' },
  { value: 'boolean', label: 'Boolean', letter: 'B', dot: 'bg-amber-500', text: 'text-amber-500' },
  {
    value: 'object',
    label: 'Object',
    letter: 'O',
    dot: 'bg-violet-500',
    text: 'text-violet-500',
    bracket: '{ }',
  },
  {
    value: 'array',
    label: 'Array',
    letter: 'A',
    dot: 'bg-pink-500',
    text: 'text-pink-500',
    bracket: '[ ]',
  },
];

function getType(type: string) {
  return TYPES.find((t) => t.value === type) ?? TYPES[0];
}

/** Returns the matched menu item for the current field value, or undefined */
function getMatchedMenuItem(
  field: SchemaField,
  valueMenuItems?: ValueMenuItem[],
): ValueMenuItem | undefined {
  if (!valueMenuItems || field.type !== 'string') return undefined;
  return valueMenuItems.find((mi) => mi.match(String(field.default ?? '')));
}

// ── Type picker popup ────────────────────────────────────────────────────────

function TypePickerPopup({
  anchorRef,
  value,
  onSelect,
  onClose,
  valueMenuItems,
  onMenuItemSelect,
  activeMenuItemLabel,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  value?: string;
  onSelect: (type: string) => void;
  onClose: () => void;
  valueMenuItems?: ValueMenuItem[];
  onMenuItemSelect?: (item: ValueMenuItem) => void;
  activeMenuItemLabel?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const dropH = 250;
      const spaceBelow = window.innerHeight - rect.bottom;
      setPos({
        top: spaceBelow < dropH && rect.top > spaceBelow ? rect.top - dropH - 4 : rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [anchorRef]);

  if (!pos) return null;

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] rounded-md border bg-popover p-1 shadow-md min-w-[130px]"
        style={{ top: pos.top, left: pos.left }}
      >
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onSelect(t.value)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
            <span className="flex-1 text-left">{t.label}</span>
            {t.value === value && !activeMenuItemLabel && (
              <Check className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ))}
        {valueMenuItems && valueMenuItems.length > 0 && onMenuItemSelect && (
          <>
            <div className="my-1 border-t" />
            {valueMenuItems.map((mi) => (
              <button
                key={mi.label}
                type="button"
                onClick={() => {
                  onMenuItemSelect(mi);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
              >
                <span className="h-2.5 w-2.5 flex items-center justify-center shrink-0">
                  {mi.icon}
                </span>
                <span className="flex-1 text-left">{mi.label}</span>
                {mi.label === activeMenuItemLabel && (
                  <Check className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}

// ── Schema ↔ Tree ────────────────────────────────────────────────────────────

export function schemaToTree(schema: Record<string, any> | undefined): SchemaField[] {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties as Record<string, any>).map(([name, prop]) => {
    const p = prop as Record<string, any>;
    const field: SchemaField = {
      name,
      type: p.type ?? 'string',
      description: p.description ?? '',
      default: p.default,
    };
    if (p.type === 'object' && p.properties) {
      field.properties = schemaToTree(p);
    }
    if (p.type === 'array' && p.items) {
      const ip = p.items as Record<string, any>;
      field.items = {
        name: 'items',
        type: ip.type ?? 'string',
        description: '',
        default: ip.default,
        properties: ip.type === 'object' && ip.properties ? schemaToTree(ip) : undefined,
        items: ip.type === 'array' && ip.items ? parseArrayItems(ip.items) : undefined,
      };
    }
    return field;
  });
}

function parseArrayItems(itemSchema: Record<string, any>): SchemaField {
  return {
    name: 'items',
    type: itemSchema.type ?? 'string',
    description: '',
    properties:
      itemSchema.type === 'object' && itemSchema.properties ? schemaToTree(itemSchema) : undefined,
    items:
      itemSchema.type === 'array' && itemSchema.items
        ? parseArrayItems(itemSchema.items)
        : undefined,
  };
}

export function treeToSchema(fields: SchemaField[]): Record<string, any> | undefined {
  const valid = fields.filter((f) => f.name.trim() !== '');
  if (valid.length === 0) return undefined;
  const properties: Record<string, any> = {};
  for (const f of valid) {
    properties[f.name] = fieldToProp(f);
  }
  return { type: 'object', properties };
}

function fieldToProp(field: SchemaField): Record<string, any> {
  const prop: Record<string, any> = { type: field.type };
  if (field.description) prop.description = field.description;
  if (field.default !== undefined && field.default !== '') prop.default = field.default;
  if (field.type === 'object' && field.properties?.length) {
    const nested = treeToSchema(field.properties);
    if (nested) prop.properties = nested.properties;
  }
  if (field.type === 'array' && field.items) {
    prop.items = fieldToProp(field.items);
  }
  return prop;
}

// ── JSON → Schema inference ──────────────────────────────────────────────────

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'string';
}

function jsonValueToSchema(value: unknown): Record<string, any> {
  const type = inferType(value);
  if (type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const properties: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = jsonValueToSchema(v);
    }
    return { type: 'object', properties };
  }
  if (type === 'array' && Array.isArray(value) && value.length > 0) {
    return { type: 'array', items: jsonValueToSchema(value[0]) };
  }
  const prop: Record<string, any> = { type };
  if (value !== null && value !== undefined && type !== 'object' && type !== 'array') {
    prop.default = value;
  }
  return prop;
}

export function jsonToSchema(json: unknown): Record<string, any> | undefined {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    return jsonValueToSchema(json) as Record<string, any>;
  }
  if (Array.isArray(json) && json.length > 0) {
    return {
      type: 'object',
      properties: {
        items: { type: 'array', items: jsonValueToSchema(json[0]) },
      },
    };
  }
  return undefined;
}

// ── Tree → JSON value extraction ─────────────────────────────────────────

function fieldToValue(field: SchemaField): any {
  if (field.type === 'object') {
    const obj: Record<string, any> = {};
    for (const child of field.properties ?? []) {
      if (child.name.trim()) obj[child.name] = fieldToValue(child);
    }
    return obj;
  }
  if (field.type === 'array' && field.items) {
    const itemVal = fieldToValue(field.items);
    return itemVal !== undefined ? [itemVal] : [];
  }
  if (field.type === 'boolean') return field.default ?? false;
  if (field.type === 'number') return field.default ?? 0;
  return field.default ?? '';
}

/** Extracts actual JSON values from a SchemaField tree (used in json mode). */
export function treeToJson(fields: SchemaField[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const f of fields) {
    if (f.name.trim()) result[f.name] = fieldToValue(f);
  }
  return result;
}

/** Convert a flat JSON value object into a SchemaField tree (for json/output modes). */
function valueToTree(obj: Record<string, any> | undefined): SchemaField[] {
  if (!obj || typeof obj !== 'object') return [];
  const schema = jsonToSchema(obj);
  if (!schema) return [];
  return schemaToTree(schema);
}

// ── Tree connector ───────────────────────────────────────────────────────────

function TreeConnector() {
  return (
    <span className="shrink-0 flex items-center" style={{ width: '18px', marginLeft: '-18px' }}>
      <span className="h-px w-full bg-border/50" />
    </span>
  );
}

// ── Collapsed value display (with menu item support) ─────────────────────────

function CollapsedValue({
  field,
  update,
  onEdit,
  valueMenuItems,
}: {
  field: SchemaField;
  update: (patch: Partial<SchemaField>) => void;
  onEdit: () => void;
  valueMenuItems?: ValueMenuItem[];
}) {
  const matchedItem = valueMenuItems?.find((mi) => mi.match(String(field.default ?? '')));

  if (matchedItem) {
    return (
      <div className="ml-1 flex-1 min-w-[40px]">
        {matchedItem.render({
          value: String(field.default ?? ''),
          onChange: (v) => update({ default: v || undefined }),
        })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className="rounded px-1.5 h-5 text-[11px] leading-5 text-muted-foreground hover:bg-muted/50 transition-colors ml-1 truncate"
    >
      {field.type === 'boolean' ? (
        field.default ? (
          'true'
        ) : (
          'false'
        )
      ) : field.default !== undefined && field.default !== '' ? (
        String(field.default)
      ) : (
        <span className="italic">empty</span>
      )}
    </button>
  );
}

// ── Value input (handles menu items + plain inputs) ──────────────────────────

function ValueInput({
  field,
  valueRef,
  update,
  valueMenuItems,
}: {
  field: SchemaField;
  valueRef: React.RefObject<HTMLInputElement | null>;
  update: (patch: Partial<SchemaField>) => void;
  valueMenuItems?: ValueMenuItem[];
}) {
  const matchedItem = valueMenuItems?.find((mi) => mi.match(String(field.default ?? '')));

  if (field.type === 'boolean') {
    return (
      <button
        type="button"
        onClick={() => update({ default: !field.default })}
        className={`rounded px-2 h-5 text-[10px] leading-5 font-medium ${
          field.default
            ? 'bg-green-500/15 text-green-600 dark:text-green-400'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {field.default ? 'true' : 'false'}
      </button>
    );
  }

  if (field.type === 'number') {
    return (
      <Input
        ref={valueRef}
        type="number"
        value={field.default ?? ''}
        onChange={(e) => update({ default: e.target.value ? Number(e.target.value) : undefined })}
        placeholder="value"
        className="!h-5 !text-[11px] !min-h-0 !py-0 !shadow-none !border-0 !leading-5 w-16 bg-muted/30 px-1.5 rounded focus-visible:ring-0 focus-visible:bg-muted/50 shrink-0"
      />
    );
  }

  if (matchedItem) {
    return (
      <div className="flex-1 min-w-[40px] ml-1">
        {matchedItem.render({
          value: String(field.default ?? ''),
          onChange: (v) => update({ default: v || undefined }),
        })}
      </div>
    );
  }

  return (
    <Input
      ref={valueRef}
      value={field.default ?? ''}
      onChange={(e) => update({ default: e.target.value || undefined })}
      placeholder="value"
      className="!h-5 !text-[11px] !min-h-0 !py-0 !shadow-none !border-0 !leading-5 flex-1 min-w-[40px] bg-muted/30 px-1.5 rounded focus-visible:ring-0 focus-visible:bg-muted/50"
    />
  );
}

// ── Field row (recursive) ────────────────────────────────────────────────────

function FieldRow({
  field,
  siblingNames,
  isArrayItem,
  depth = 0,
  onChange,
  onRemove,
  rules = RULES_SCHEMA,
  valueMenuItems,
}: {
  field: SchemaField;
  siblingNames?: string[];
  isArrayItem?: boolean;
  depth?: number;
  onChange: (field: SchemaField) => void;
  onRemove?: () => void;
  rules?: JsonBuilderRules;
  valueMenuItems?: ValueMenuItem[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(!field.name && !isArrayItem);
  const [focusTarget, setFocusTarget] = useState<'name' | 'value'>('name');
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const typeRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const isContainer = field.type === 'object' || field.type === 'array';
  const typeInfo = getType(field.type);
  const matchedMenuItem = getMatchedMenuItem(field, valueMenuItems);
  const isDuplicate =
    !isArrayItem &&
    field.name.trim() !== '' &&
    (siblingNames?.filter((n) => n === field.name).length ?? 0) > 1;

  const update = useCallback(
    (u: Partial<SchemaField>) => {
      const next = { ...field, ...u };
      if (u.type && u.type !== field.type) {
        if (u.type === 'object') {
          next.properties = next.properties ?? [];
          next.items = undefined;
          next.default = undefined;
        } else if (u.type === 'array') {
          next.items = next.items ?? { name: 'items', type: 'string', description: '' };
          next.properties = undefined;
          next.default = undefined;
        } else {
          next.properties = undefined;
          next.items = undefined;
        }
      }
      onChange(next);
    },
    [field, onChange],
  );

  // Auto-focus the target field when entering edit mode
  useEffect(() => {
    if (!editing) return;
    setTimeout(() => {
      if (focusTarget === 'value' && valueRef.current) {
        valueRef.current.focus();
      } else if (nameRef.current) {
        nameRef.current.focus();
      }
    }, 10);
  }, [editing, focusTarget]);

  const childNames = useMemo(() => (field.properties ?? []).map((c) => c.name), [field.properties]);

  // Display mode: show as clickable buttons
  if (!editing && !isArrayItem) {
    return (
      <div>
        <div className="group flex items-center gap-1 py-[3px]">
          {depth > 0 && <TreeConnector />}
          {/* Type indicator */}
          {rules.canChangeType ? (
            <button
              ref={typeRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTypePickerOpen(true);
              }}
              className={`h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${matchedMenuItem ? '' : `${typeInfo.dot}/15 ${typeInfo.text}`}`}
            >
              {matchedMenuItem ? matchedMenuItem.icon : typeInfo.letter}
            </button>
          ) : (
            <span
              className={`h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${matchedMenuItem ? '' : `${typeInfo.dot}/15 ${typeInfo.text}`}`}
            >
              {matchedMenuItem ? matchedMenuItem.icon : typeInfo.letter}
            </span>
          )}

          {/* Name */}
          {rules.editableKey ? (
            <button
              type="button"
              onClick={() => {
                setFocusTarget('name');
                setEditing(true);
              }}
              className={`rounded px-1.5 h-5 text-[11px] leading-5 font-mono text-left truncate hover:bg-muted/50 transition-colors ${
                isDuplicate ? 'text-red-500' : 'text-foreground'
              }`}
            >
              {field.name || <span className="text-muted-foreground italic">unnamed</span>}
            </button>
          ) : (
            <span
              className={`px-1.5 h-5 text-[11px] leading-5 font-mono text-foreground truncate ${isDuplicate ? 'text-red-500' : ''}`}
            >
              {field.name}
            </span>
          )}

          {/* Bracket for containers */}
          {isContainer && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono ml-1"
            >
              {typeInfo.bracket}
            </button>
          )}

          {/* Clickable value for leaf types when values are shown */}
          {rules.showValue && !isContainer && (
            <CollapsedValue
              field={field}
              update={update}
              onEdit={() => {
                setFocusTarget('value');
                setEditing(true);
              }}
              valueMenuItems={valueMenuItems}
            />
          )}

          <span className="flex-1" />

          {onRemove && rules.canRemoveFields && (
            <button
              type="button"
              onClick={onRemove}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>

        {typePickerOpen && rules.canChangeType && (
          <TypePickerPopup
            anchorRef={typeRef}
            value={field.type}
            onSelect={(t) => {
              update({ type: t, default: matchedMenuItem ? undefined : field.default });
              setTypePickerOpen(false);
            }}
            onClose={() => setTypePickerOpen(false)}
            valueMenuItems={valueMenuItems}
            activeMenuItemLabel={matchedMenuItem?.label}
            onMenuItemSelect={(mi) => {
              update({ type: 'string', default: mi.seed ?? '{{' });
              setTypePickerOpen(false);
            }}
          />
        )}

        {/* Children */}
        {expanded && field.type === 'object' && (
          <ObjectChildren
            field={field}
            childNames={childNames}
            depth={depth}
            onChange={onChange}
            rules={rules}
            valueMenuItems={valueMenuItems}
          />
        )}
        {expanded && field.type === 'array' && field.items && (
          <ArrayChildren
            field={field}
            depth={depth}
            onChange={onChange}
            rules={rules}
            valueMenuItems={valueMenuItems}
          />
        )}
      </div>
    );
  }

  // Edit mode: show inputs
  return (
    <div>
      <div
        ref={rowRef}
        className="group flex items-center gap-1 py-[3px]"
        onBlur={(e) => {
          if (rowRef.current && !rowRef.current.contains(e.relatedTarget as Node)) {
            setEditing(false);
          }
        }}
      >
        {depth > 0 && <TreeConnector />}
        {/* Type indicator */}
        {!isArrayItem &&
          (!rules.canChangeType ? (
            <span
              className={`h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${matchedMenuItem ? '' : `${typeInfo.dot}/15 ${typeInfo.text}`}`}
            >
              {matchedMenuItem ? matchedMenuItem.icon : typeInfo.letter}
            </span>
          ) : (
            <button
              ref={typeRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTypePickerOpen(true);
              }}
              className={`h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${matchedMenuItem ? '' : `${typeInfo.dot}/15 ${typeInfo.text}`}`}
            >
              {matchedMenuItem ? matchedMenuItem.icon : typeInfo.letter}
            </button>
          ))}

        {/* Name input or array item label */}
        {isArrayItem ? (
          <span className="text-[11px] text-muted-foreground italic shrink-0 pl-1">items</span>
        ) : !rules.editableKey ? (
          <span className="text-[11px] font-mono text-foreground px-1.5 shrink-0">
            {field.name}
          </span>
        ) : (
          <Input
            ref={nameRef}
            value={field.name}
            onChange={(e) => update({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(false);
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="name"
            className={`!h-5 !text-[11px] !min-h-0 !py-0 !shadow-none !border-0 !leading-5 font-mono bg-muted/30 px-1.5 rounded border-none shadow-none focus-visible:ring-0 focus-visible:bg-muted/50 w-24 shrink-0 ${
              isDuplicate ? 'text-red-500 bg-red-500/10' : ''
            }`}
          />
        )}

        {/* Type selector for array items (schema mode only) */}
        {isArrayItem && !!rules.canChangeType && (
          <button
            ref={typeRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setTypePickerOpen(true);
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] hover:bg-muted transition-colors shrink-0"
          >
            <span className={`h-2 w-2 rounded-full ${typeInfo.dot}`} />
            <span>{typeInfo.label}</span>
            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
          </button>
        )}

        {/* Value inputs — shown in JSON and output modes */}
        {!isContainer && !isArrayItem && rules.showValue && (
          <ValueInput
            field={field}
            valueRef={valueRef}
            update={update}
            valueMenuItems={valueMenuItems}
          />
        )}

        {/* Bracket for containers */}
        {isContainer && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            {typeInfo.bracket}
          </button>
        )}

        <span className="flex-1" />

        {onRemove && rules.canRemoveFields && (
          <button
            type="button"
            onClick={onRemove}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {typePickerOpen && !!rules.canChangeType && (
        <TypePickerPopup
          anchorRef={typeRef}
          value={field.type}
          onSelect={(t) => {
            update({ type: t });
            setTypePickerOpen(false);
          }}
          onClose={() => setTypePickerOpen(false)}
        />
      )}

      {/* Children */}
      {expanded && field.type === 'object' && (
        <ObjectChildren
          field={field}
          childNames={childNames}
          depth={depth}
          onChange={onChange}
          rules={rules}
          valueMenuItems={valueMenuItems}
        />
      )}
      {expanded && field.type === 'array' && field.items && (
        <ArrayChildren
          field={field}
          depth={depth}
          onChange={onChange}
          rules={rules}
          valueMenuItems={valueMenuItems}
        />
      )}
    </div>
  );
}

// ── Children wrappers ────────────────────────────────────────────────────────

function ObjectChildren({
  field,
  childNames,
  depth,
  onChange,
  rules = RULES_SCHEMA,
  valueMenuItems,
}: {
  field: SchemaField;
  childNames: string[];
  depth: number;
  onChange: (field: SchemaField) => void;
  rules?: JsonBuilderRules;
  valueMenuItems?: ValueMenuItem[];
}) {
  const addRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastChildRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState<number | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const children = field.properties ?? [];

  useEffect(() => {
    if (containerRef.current && lastChildRef.current) {
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const lastChildRect = lastChildRef.current.getBoundingClientRect();
      // Line goes from top of container to center of last child's first row (~13px from top of last child)
      setLineHeight(lastChildRect.top - containerTop + 13);
    }
  });

  return (
    <div className="ml-7">
      <div
        ref={containerRef}
        className="relative"
        style={{ marginLeft: '-18px', paddingLeft: '18px' }}
      >
        <div
          className="absolute w-px bg-border/50"
          style={{ left: 0, top: 0, height: lineHeight ?? 0 }}
        />
        {children.map((child, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fields can have empty names
          <div key={i} ref={i === children.length - 1 ? lastChildRef : undefined}>
            <FieldRow
              field={child}
              siblingNames={childNames}
              depth={depth + 1}
              rules={rules}
              valueMenuItems={valueMenuItems}
              onChange={(c) => {
                const next = [...children];
                next[i] = c;
                onChange({ ...field, properties: next });
              }}
              onRemove={
                !rules.canRemoveFields
                  ? undefined
                  : () => onChange({ ...field, properties: children.filter((_, j) => j !== i) })
              }
            />
          </div>
        ))}
      </div>
      {rules.canAddFields && (
        <>
          <button
            ref={addRef}
            type="button"
            onClick={() => setAddPickerOpen(true)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground py-1 ml-1 transition-colors"
          >
            <Plus className="h-2.5 w-2.5" />
            ADD
          </button>
          {addPickerOpen && (
            <TypePickerPopup
              anchorRef={addRef}
              onSelect={(t) => {
                const newField: SchemaField = { name: '', type: t, description: '' };
                if (t === 'object') newField.properties = [];
                if (t === 'array')
                  newField.items = { name: 'items', type: 'string', description: '' };
                onChange({ ...field, properties: [...(field.properties ?? []), newField] });
                setAddPickerOpen(false);
              }}
              onClose={() => setAddPickerOpen(false)}
              valueMenuItems={valueMenuItems}
              onMenuItemSelect={(mi) => {
                const newField: SchemaField = {
                  name: '',
                  type: 'string',
                  description: '',
                  default: mi.seed ?? '{{',
                };
                onChange({ ...field, properties: [...(field.properties ?? []), newField] });
                setAddPickerOpen(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function ArrayChildren({
  field,
  depth,
  onChange,
  rules = RULES_SCHEMA,
  valueMenuItems,
}: {
  field: SchemaField;
  depth: number;
  onChange: (field: SchemaField) => void;
  rules?: JsonBuilderRules;
  valueMenuItems?: ValueMenuItem[];
}) {
  return (
    <div className="ml-7">
      <div className="relative" style={{ marginLeft: '-14px', paddingLeft: '18px' }}>
        <div className="absolute w-px bg-border/50" style={{ left: 0, top: 0, height: '13px' }} />
        <FieldRow
          field={field.items!}
          isArrayItem
          depth={depth + 1}
          rules={rules}
          valueMenuItems={valueMenuItems}
          onChange={(items) => onChange({ ...field, items })}
        />
      </div>
    </div>
  );
}

// ── Root editor ──────────────────────────────────────────────────────────────

export function JsonBuilder({
  value,
  onChange,
  rules = RULES_SCHEMA,
  emit = 'schema',
  valueMenuItems,
}: JsonBuilderProps) {
  const parseValue = emit === 'schema' ? schemaToTree : valueToTree;
  const [fields, setFields] = useState<SchemaField[]>(() => parseValue(value));
  const internalUpdateRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  useEffect(() => {
    if (internalUpdateRef.current) {
      internalUpdateRef.current = false;
      return;
    }
    setFields(parseValue(value));
  }, [value, parseValue]);

  const updateAndEmit = useCallback(
    (newFields: SchemaField[]) => {
      setFields(newFields);
      internalUpdateRef.current = true;
      if (emit === 'values') {
        const json = treeToJson(newFields);
        onChange(Object.keys(json).length > 0 ? json : undefined);
      } else {
        onChange(treeToSchema(newFields));
      }
    },
    [onChange, emit],
  );

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          const schema = jsonToSchema(json);
          if (schema) {
            const imported = schemaToTree(schema);
            updateAndEmit([...fields, ...imported]);
            toast.success(`Imported ${imported.length} field${imported.length !== 1 ? 's' : ''}`);
          } else {
            toast.error('Could not infer schema from JSON');
          }
        } catch {
          toast.error('Invalid JSON file');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
    },
    [fields, updateAndEmit],
  );

  const fieldNames = useMemo(() => fields.map((f) => f.name), [fields]);

  return (
    <div>
      {fields.map((field, i) => (
        <FieldRow // biome-ignore lint/suspicious/noArrayIndexKey: fields can have empty names
          key={i}
          field={field}
          siblingNames={fieldNames}
          rules={rules}
          valueMenuItems={valueMenuItems}
          onChange={(f) => {
            const next = [...fields];
            next[i] = f;
            updateAndEmit(next);
          }}
          onRemove={
            !rules.canRemoveFields
              ? undefined
              : () => updateAndEmit(fields.filter((_, j) => j !== i))
          }
        />
      ))}

      {!rules.canAddFields ? (
        fields.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground italic">No fields defined</p>
        ) : null
      ) : (
        <>
          <div className="flex items-center gap-3 pt-2 mt-1 border-t border-border/30">
            <button
              ref={addRef}
              type="button"
              onClick={() => setAddPickerOpen(true)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-2.5 w-2.5" />
              Add
            </button>
            <span className="h-3 w-px bg-border/30" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Import className="h-2.5 w-2.5" />
              Import
            </button>
            {fields.length > 0 && (
              <>
                <span className="h-3 w-px bg-border/30" />
                <button
                  type="button"
                  onClick={() => updateAndEmit([])}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                  Clear
                </button>
              </>
            )}
          </div>
          {addPickerOpen && (
            <TypePickerPopup
              anchorRef={addRef}
              onSelect={(t) => {
                const newField: SchemaField = { name: '', type: t, description: '' };
                if (t === 'object') newField.properties = [];
                if (t === 'array')
                  newField.items = { name: 'items', type: 'string', description: '' };
                updateAndEmit([...fields, newField]);
                setAddPickerOpen(false);
              }}
              onClose={() => setAddPickerOpen(false)}
              valueMenuItems={valueMenuItems}
              onMenuItemSelect={(mi) => {
                const newField: SchemaField = {
                  name: '',
                  type: 'string',
                  description: '',
                  default: mi.seed ?? '{{',
                };
                updateAndEmit([...fields, newField]);
                setAddPickerOpen(false);
              }}
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
        </>
      )}
    </div>
  );
}
