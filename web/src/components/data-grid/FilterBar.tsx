import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface FilterFieldConfig {
  field: string;
  label: string;
  type: 'text' | 'exact' | 'bool' | 'date';
  options?: { value: string; label: string }[];
}

type Operator =
  | 'contains'
  | 'not_contains'
  | 'is'
  | 'is_not'
  | 'starts_with'
  | 'ends_with'
  | 'any'
  | 'none'
  | 'after'
  | 'before'
  | 'between';

const TEXT_OPERATORS: { value: Operator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
];

const EXACT_OPERATORS: { value: Operator; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'any', label: 'is any of' },
  { value: 'none', label: 'is none of' },
];

const BOOL_OPERATORS: { value: Operator; label: string }[] = [{ value: 'is', label: 'is' }];

const DATE_OPERATORS: { value: Operator; label: string }[] = [
  { value: 'after', label: 'after' },
  { value: 'before', label: 'before' },
  { value: 'between', label: 'between' },
];

function getOperatorsForType(type: FilterFieldConfig['type']) {
  switch (type) {
    case 'text':
      return TEXT_OPERATORS;
    case 'exact':
      return EXACT_OPERATORS;
    case 'bool':
      return BOOL_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
  }
}

function defaultOperator(type: FilterFieldConfig['type']): Operator {
  switch (type) {
    case 'text':
      return 'contains';
    case 'exact':
      return 'is';
    case 'bool':
      return 'is';
    case 'date':
      return 'after';
  }
}

function isMultiValueOp(op: Operator): boolean {
  return op === 'any' || op === 'none';
}

function encode(op: Operator, value: string): string {
  return `${op}:${value}`;
}

function decode(
  raw: string,
  fieldType: FilterFieldConfig['type'],
): { op: Operator; value: string } {
  const idx = raw.indexOf(':');
  if (idx > 0) {
    const maybeOp = raw.slice(0, idx) as Operator;
    const allOps = getOperatorsForType(fieldType);
    if (allOps.some((o) => o.value === maybeOp)) {
      return { op: maybeOp, value: raw.slice(idx + 1) };
    }
  }
  return { op: defaultOperator(fieldType), value: raw };
}

interface DraftFilter {
  field: string;
  op: Operator;
  value: string | null;
}

interface FilterBarProps {
  fields: FilterFieldConfig[];
  filters: Record<string, string>;
  onFilterChange: (column: string, value: string) => void;
}

export function FilterBar({ fields, filters, onFilterChange }: FilterBarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [pillOrder, setPillOrder] = useState<string[]>(() => Object.keys(filters));
  const [drafts, setDrafts] = useState<Record<string, DraftFilter>>({});
  const [editingSegment, setEditingSegment] = useState<{
    field: string;
    segment: 'field' | 'operator' | 'value';
  } | null>(null);

  const getFieldConfig = useCallback(
    (field: string) => fields.find((f) => f.field === field),
    [fields],
  );

  const allTracked = new Set([...pillOrder, ...Object.keys(drafts)]);
  for (const key of Object.keys(filters)) {
    if (!allTracked.has(key)) {
      pillOrder.push(key);
    }
  }

  const pills: { field: string; op: Operator; value: string | null }[] = [];
  const seen = new Set<string>();
  for (const field of pillOrder) {
    if (seen.has(field)) continue;
    seen.add(field);
    if (drafts[field]) {
      pills.push(drafts[field]);
    } else if (filters[field]) {
      const config = getFieldConfig(field);
      if (config) {
        const { op, value } = decode(filters[field], config.type);
        pills.push({ field, op, value });
      }
    }
  }

  const usedFields = new Set(pills.map((p) => p.field));
  const availableFields = fields.filter((f) => !usedFields.has(f.field));

  const commitFilter = useCallback(
    (field: string, op: Operator, value: string) => {
      onFilterChange(field, encode(op, value));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [onFilterChange],
  );

  const handleAddField = useCallback(
    (field: string) => {
      setAddOpen(false);
      const config = getFieldConfig(field);
      if (!config) return;
      setDrafts((prev) => ({
        ...prev,
        [field]: { field, op: defaultOperator(config.type), value: null },
      }));
      setPillOrder((prev) => (prev.includes(field) ? prev : [...prev, field]));
    },
    [getFieldConfig],
  );

  const handleRemove = useCallback(
    (field: string) => {
      onFilterChange(field, '');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      setPillOrder((prev) => prev.filter((f) => f !== field));
      if (editingSegment?.field === field) setEditingSegment(null);
    },
    [onFilterChange, editingSegment],
  );

  const handleFieldSwap = useCallback(
    (oldField: string, newField: string) => {
      onFilterChange(oldField, '');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[oldField];
        return next;
      });
      const config = getFieldConfig(newField);
      if (!config) return;
      setDrafts((prev) => ({
        ...prev,
        [newField]: { field: newField, op: defaultOperator(config.type), value: null },
      }));
      setPillOrder((prev) => prev.map((f) => (f === oldField ? newField : f)));
      setEditingSegment(null);
    },
    [onFilterChange, getFieldConfig],
  );

  const handleOpChange = useCallback(
    (field: string, currentValue: string | null, newOp: Operator) => {
      const config = getFieldConfig(field);
      if (!config) return;
      const oldEntry =
        drafts[field] ??
        (filters[field]
          ? (() => {
              const d = decode(filters[field], config.type);
              return { field, ...d };
            })()
          : null);
      const oldOp = oldEntry?.op ?? defaultOperator(config.type);
      const wasMulti = isMultiValueOp(oldOp);
      const nowMulti = isMultiValueOp(newOp);

      let newValue = currentValue;
      if (newValue !== null && wasMulti && !nowMulti) {
        newValue = newValue.split(',')[0] ?? '';
      }

      if (newValue !== null && newValue !== '') {
        commitFilter(field, newOp, newValue);
      } else {
        setDrafts((prev) => ({
          ...prev,
          [field]: { field, op: newOp, value: null },
        }));
        if (filters[field]) {
          onFilterChange(field, '');
        }
      }
      setEditingSegment(null);
    },
    [getFieldConfig, drafts, filters, commitFilter, onFilterChange],
  );

  const handleValueChange = useCallback(
    (field: string, op: Operator, newValue: string) => {
      if (newValue !== '') {
        commitFilter(field, op, newValue);
      } else {
        setDrafts((prev) => ({
          ...prev,
          [field]: { field, op, value: null },
        }));
        if (filters[field]) {
          onFilterChange(field, '');
        }
      }
    },
    [commitFilter, filters, onFilterChange],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map(({ field, op, value }) => {
        const config = getFieldConfig(field);
        if (!config) return null;
        return (
          <FilterPill
            key={field}
            config={config}
            op={op}
            value={value}
            allFields={fields}
            usedFields={usedFields}
            editingSegment={editingSegment?.field === field ? editingSegment.segment : null}
            onEditSegment={(segment) =>
              setEditingSegment(
                editingSegment?.field === field && editingSegment.segment === segment
                  ? null
                  : { field, segment },
              )
            }
            onCloseSegment={() => setEditingSegment(null)}
            onOpChange={(newOp) => handleOpChange(field, value, newOp)}
            onValueChange={(v) => handleValueChange(field, op, v)}
            onFieldSwap={(newField) => handleFieldSwap(field, newField)}
            onRemove={() => handleRemove(field)}
          />
        );
      })}
      {availableFields.length > 0 && (
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1">
            {availableFields.map((f) => (
              <button
                key={f.field}
                type="button"
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => handleAddField(f.field)}
              >
                {f.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ── Filter Pill ────────────────────────────────────────────────────────────

function FilterPill({
  config,
  op,
  value,
  allFields,
  usedFields,
  editingSegment,
  onEditSegment,
  onCloseSegment,
  onOpChange,
  onValueChange,
  onFieldSwap,
  onRemove,
}: {
  config: FilterFieldConfig;
  op: Operator;
  value: string | null;
  allFields: FilterFieldConfig[];
  usedFields: Set<string>;
  editingSegment: 'field' | 'operator' | 'value' | null;
  onEditSegment: (segment: 'field' | 'operator' | 'value') => void;
  onCloseSegment: () => void;
  onOpChange: (newOp: Operator) => void;
  onValueChange: (value: string) => void;
  onFieldSwap: (newField: string) => void;
  onRemove: () => void;
}) {
  const operators = getOperatorsForType(config.type);
  const operatorLabel = operators.find((o) => o.value === op)?.label ?? op;
  const displayValue = getDisplayValue(config, op, value);
  const isDraft = value === null;
  const swappableFields = allFields.filter(
    (f) => f.field === config.field || !usedFields.has(f.field),
  );

  return (
    <div
      className={`group flex h-7 items-center rounded-md border bg-background text-sm ${isDraft ? 'border-dashed border-muted-foreground/40' : 'border-border'}`}
    >
      {/* Field name */}
      <Popover
        open={editingSegment === 'field'}
        onOpenChange={(open) => {
          if (!open) onCloseSegment();
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded-l-md border-r border-border px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => onEditSegment('field')}
          >
            {config.label}
            <ChevronDown className="size-3 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1">
          {swappableFields.map((f) => (
            <button
              key={f.field}
              type="button"
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${f.field === config.field ? 'font-medium' : ''}`}
              onClick={() => {
                if (f.field !== config.field) onFieldSwap(f.field);
                onCloseSegment();
              }}
            >
              {f.field === config.field ? (
                <Check className="size-3" />
              ) : (
                <span className="size-3" />
              )}
              {f.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Operator */}
      <Popover
        open={editingSegment === 'operator'}
        onOpenChange={(open) => {
          if (!open) onCloseSegment();
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 border-r border-border px-2 py-1 text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => onEditSegment('operator')}
          >
            {operatorLabel}
            <ChevronDown className="size-3 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1">
          {operators.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${op === o.value ? 'font-medium' : ''}`}
              onClick={() => onOpChange(o.value)}
            >
              {op === o.value ? <Check className="size-3" /> : <span className="size-3" />}
              {o.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Value */}
      <Popover
        open={editingSegment === 'value'}
        onOpenChange={(open) => {
          if (!open) onCloseSegment();
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-1 transition-colors hover:bg-accent ${isDraft ? 'text-muted-foreground/50 italic' : ''}`}
            onClick={() => onEditSegment('value')}
          >
            <span className="max-w-36 truncate">{displayValue}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1">
          <ValueEditor
            config={config}
            op={op}
            value={value ?? ''}
            onChange={onValueChange}
            onClose={onCloseSegment}
          />
        </PopoverContent>
      </Popover>

      {/* Remove */}
      <button
        type="button"
        className="flex items-center self-stretch rounded-r-md border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

// ── Value editors ──────────────────────────────────────────────────────────

function ValueEditor({
  config,
  op,
  value,
  onChange,
  onClose,
}: {
  config: FilterFieldConfig;
  op: Operator;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  if (config.type === 'bool') return <BoolEditor value={value} onChange={onChange} />;
  if (config.type === 'date') return <DateEditor op={op} value={value} onChange={onChange} />;
  if (config.type === 'exact' && config.options) {
    if (isMultiValueOp(op))
      return <MultiSelectEditor value={value} options={config.options} onChange={onChange} />;
    return (
      <SingleSelectEditor
        value={value}
        options={config.options}
        onChange={onChange}
        onClose={onClose}
      />
    );
  }
  return <TextEditor value={value} onChange={onChange} onClose={onClose} />;
}

function TextEditor({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <Input
      ref={ref}
      defaultValue={value}
      placeholder="Type to filter..."
      className="h-8 text-sm"
      onChange={(e) => {
        clearTimeout(debounceRef.current);
        const v = e.target.value;
        debounceRef.current = setTimeout(() => onChange(v), 300);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') onClose();
      }}
    />
  );
}

function SingleSelectEditor({
  value,
  options,
  onChange,
  onClose,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${value === opt.value ? 'font-medium' : ''}`}
          onClick={() => {
            onChange(opt.value);
            onClose();
          }}
        >
          <span
            className={`flex size-4 items-center justify-center rounded-full border ${value === opt.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
          >
            {value === opt.value && <Check className="size-3" />}
          </span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MultiSelectEditor({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const selected = new Set(value.split(',').filter(Boolean));
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next).join(','));
  };

  return (
    <div className="flex flex-col">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          onClick={() => toggle(opt.value)}
        >
          <span
            className={`flex size-4 items-center justify-center rounded-sm border ${selected.has(opt.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
          >
            {selected.has(opt.value) && <Check className="size-3" />}
          </span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function BoolEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ];
  return (
    <div className="flex flex-col">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${value === opt.value ? 'font-medium' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          <span
            className={`flex size-4 items-center justify-center rounded-full border ${value === opt.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
          >
            {value === opt.value && <Check className="size-3" />}
          </span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DateEditor({
  op,
  value,
  onChange,
}: {
  op: Operator;
  value: string;
  onChange: (value: string) => void;
}) {
  const isBetween = op === 'between';
  const parts = value.split(',');
  const val1 = parts[0] ?? '';
  const val2 = parts[1] ?? '';

  if (isBetween) {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <label htmlFor="filter-date-from" className="text-xs text-muted-foreground mb-1 block">
            From
          </label>
          <Input
            id="filter-date-from"
            type="date"
            className="h-8 text-sm"
            defaultValue={val1}
            onChange={(e) => onChange(`${e.target.value},${val2}`)}
          />
        </div>
        <div>
          <label htmlFor="filter-date-to" className="text-xs text-muted-foreground mb-1 block">
            To
          </label>
          <Input
            id="filter-date-to"
            type="date"
            className="h-8 text-sm"
            defaultValue={val2}
            onChange={(e) => onChange(`${val1},${e.target.value}`)}
          />
        </div>
      </div>
    );
  }

  return (
    <Input
      type="date"
      className="h-8 text-sm"
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function formatDateDisplay(value: string): string {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

function getDisplayValue(config: FilterFieldConfig, op: Operator, value: string | null): string {
  if (value === null || value === '') return '...';
  if (config.type === 'bool') return value === 'true' ? 'Yes' : 'No';
  if (config.type === 'date') {
    if (op === 'between') {
      const [from, to] = value.split(',');
      if (from && to) return `${formatDateDisplay(from)} – ${formatDateDisplay(to)}`;
      if (from) return `${formatDateDisplay(from)} – ...`;
      return '...';
    }
    return formatDateDisplay(value);
  }
  if (config.type === 'text') return value;
  if (config.options) {
    if (isMultiValueOp(op)) {
      const values = value.split(',').filter(Boolean);
      if (values.length === 0) return '...';
      if (values.length === 1)
        return config.options.find((o) => o.value === values[0])?.label ?? values[0];
      return `${values.length} selected`;
    }
    return config.options.find((o) => o.value === value)?.label ?? value;
  }
  return value;
}
