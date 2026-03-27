import { X } from 'lucide-react';
import { forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SecretKeysContext, WorkflowInputSchemaContext } from './StepNode';

interface StepOption {
  id: string;
  label: string;
  isCondition: boolean;
  outputSchema?: Record<string, any>;
}

interface MentionItem {
  id: string;
  label: string;
  prefix: string; // 'steps' or 'workflow'
  outputSchema?: Record<string, any>;
}

interface StepReferenceInputProps {
  value: string;
  onChange: (value: string) => void;
  currentNodeId: string;
  allStepNodes: StepOption[];
  workflowInputSchema?: Record<string, any>;
  placeholder?: string;
  multiline?: boolean;
}

type Segment =
  | { type: 'text'; value: string }
  | { type: 'ref'; stepId: string; path: string; raw: string; prefix: string };

const COMBINED_REF_REGEX =
  /\{\{(?:steps\.([^.}]+)\.([^}]*)|workflow\.input(?:\.([^}]*))?|secrets\.([^}]+))\}\}/g;

function parseSegments(
  value: string,
  idToName: Map<string, string>,
  nameToId: Map<string, string>,
): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(COMBINED_REF_REGEX)) {
    const start = match.index!;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: value.slice(lastIndex, start) });
    }

    if (match[1]) {
      // Steps reference: {{steps.<id>.<path>}}
      const ref = match[1];
      const resolvedId = idToName.has(ref) ? ref : nameToId.get(ref);
      if (resolvedId) {
        segments.push({
          type: 'ref',
          stepId: resolvedId,
          path: match[2],
          raw: match[0],
          prefix: 'steps',
        });
      } else {
        segments.push({ type: 'text', value: match[0] });
      }
    } else if (match[4]) {
      // Secrets reference: {{secrets.KEY_NAME}}
      segments.push({
        type: 'ref',
        stepId: match[4],
        path: '',
        raw: match[0],
        prefix: 'secrets',
      });
    } else {
      // Workflow input reference: {{workflow.input}} or {{workflow.input.<path>}}
      segments.push({
        type: 'ref',
        stepId: 'workflow',
        path: match[3] ?? '',
        raw: match[0],
        prefix: 'workflow',
      });
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < value.length) {
    segments.push({ type: 'text', value: value.slice(lastIndex) });
  }

  return segments;
}

function serializeSegments(segments: Segment[]): string {
  return segments
    .map((s) => {
      if (s.type === 'text') return s.value;
      if (s.prefix === 'secrets') return `{{secrets.${s.stepId}}}`;
      if (s.prefix === 'workflow') {
        return s.path ? `{{workflow.input.${s.path}}}` : '{{workflow.input}}';
      }
      return `{{steps.${s.stepId}.${s.path}}}`;
    })
    .join('');
}

/** Extract dot-separated paths from a schema, with configurable root prefix */
function extractSchemaPaths(schema: Record<string, any> | undefined, rootPrefix: string): string[] {
  if (!schema) return rootPrefix ? [rootPrefix] : [];
  const paths = rootPrefix ? [rootPrefix] : [];

  function walk(obj: Record<string, any>, prefix: string) {
    const props = obj.properties as Record<string, any> | undefined;
    if (!props) return;
    for (const [key, val] of Object.entries(props)) {
      const full = prefix ? `${prefix}.${key}` : key;
      paths.push(full);
      if (val.type === 'object' && val.properties) {
        walk(val, full);
      }
    }
  }

  walk(schema, rootPrefix);
  return paths;
}

/** Pill that shows @StepName with an editable path suffix and typeahead */
const pillColors: Record<string, string> = {
  steps: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  workflow: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
  secrets: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
};

const pillAccentColors: Record<string, string> = {
  steps: 'text-violet-400 dark:text-violet-500',
  workflow: 'text-sky-400 dark:text-sky-500',
  secrets: '',
};

const pillHoverColors: Record<string, string> = {
  steps: 'hover:bg-violet-200 dark:hover:bg-violet-800',
  workflow: 'hover:bg-sky-200 dark:hover:bg-sky-800',
  secrets: 'hover:bg-rose-200 dark:hover:bg-rose-800',
};

export function RefPill({
  stepName,
  path,
  pathPrefix,
  outputSchema,
  onPathChange,
  onRemove,
  prefix = 'steps',
}: {
  stepName: string;
  path: string;
  pathPrefix?: string;
  outputSchema?: Record<string, any>;
  onPathChange?: (path: string) => void;
  onRemove: () => void;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(!path && !!onPathChange);
  const [editPath, setEditPath] = useState(path);
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [pathWidth, setPathWidth] = useState<number | null>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const pathSpanRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  const allPaths = useMemo(
    () => extractSchemaPaths(outputSchema, pathPrefix ?? 'output'),
    [outputSchema, pathPrefix],
  );
  const suggestions = useMemo(() => {
    if (!editPath) return allPaths;
    const lower = editPath.toLowerCase();
    return allPaths.filter((p) => p.toLowerCase().startsWith(lower) && p !== editPath);
  }, [allPaths, editPath]);

  useEffect(() => {
    setEditPath(path);
  }, [path]);

  useEffect(() => {
    if (editing) {
      // Delay focus to ensure it wins over any competing focus from insertRef
      setTimeout(() => pathInputRef.current?.focus(), 50);
    }
  }, [editing]);

  useEffect(() => {
    setSuggestionIdx(0);
  }, []);

  const commitPath = useCallback(
    (newPath: string) => {
      const finalPath = newPath || path;
      setEditPath(finalPath);
      setEditing(false);
      if (finalPath !== path) onPathChange?.(finalPath);
    },
    [path, onPathChange],
  );

  return (
    <span
      ref={pillRef}
      className={`relative inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium max-w-full overflow-hidden ${pillColors[prefix] ?? pillColors.steps}`}
    >
      <span className="font-semibold truncate">@{stepName}</span>
      {!onPathChange ? null : (
        <>
          <span className="opacity-40">&rarr;</span>
          {editing ? (
            <>
              <input
                ref={pathInputRef}
                value={editPath}
                onChange={(e) => {
                  setEditPath(e.target.value);
                  setPathWidth(null);
                  setSuggestionIdx(0);
                }}
                onBlur={() => commitPath(editPath)}
                onKeyDown={(e) => {
                  if (suggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSuggestionIdx((i) => Math.min(i + 1, suggestions.length - 1));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSuggestionIdx((i) => Math.max(i - 1, 0));
                      return;
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      setEditPath(suggestions[suggestionIdx]);
                      return;
                    }
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (suggestions.length > 0 && suggestions[suggestionIdx]) {
                      commitPath(suggestions[suggestionIdx]);
                    } else {
                      commitPath(editPath);
                    }
                  }
                  if (e.key === 'Escape') {
                    setEditing(false);
                    setEditPath(path);
                  }
                  e.stopPropagation();
                }}
                className="bg-transparent outline-none font-[inherit] text-[inherit] opacity-70 border-none appearance-none"
                style={{
                  padding: 0,
                  margin: 0,
                  width:
                    pathWidth && editPath === path
                      ? `${pathWidth}px`
                      : `${Math.max(editPath.length, 1)}ch`,
                }}
              />
              {suggestions.length > 0 &&
                createPortal(
                  <div
                    style={{
                      position: 'fixed',
                      top: (pillRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                      left: pillRef.current?.getBoundingClientRect().left ?? 0,
                    }}
                    className="z-[9999] max-h-32 w-max min-w-[120px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md pointer-events-auto"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    {suggestions.map((s, i) => (
                      <div
                        key={s}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          commitPath(s);
                        }}
                        className={`flex w-full cursor-pointer rounded-sm px-2 py-1 text-[11px] text-left ${
                          i === suggestionIdx
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        {s}
                      </div>
                    ))}
                  </div>,
                  pillRef.current?.closest('.react-flow') ?? document.body,
                )}
            </>
          ) : (
            <span
              ref={pathSpanRef}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (pathSpanRef.current && path) setPathWidth(pathSpanRef.current.offsetWidth);
                setEditing(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (pathSpanRef.current && path) setPathWidth(pathSpanRef.current.offsetWidth);
                  setEditing(true);
                }
              }}
              className="opacity-60 hover:opacity-100 cursor-text min-w-[2ch] truncate"
            >
              {path || (
                <span className={pillAccentColors[prefix] ?? pillAccentColors.steps}>path</span>
              )}
            </span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={`ml-0.5 rounded-sm ${pillHoverColors[prefix] ?? pillHoverColors.steps}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function StepReferenceInput({
  value,
  onChange,
  currentNodeId,
  allStepNodes,
  workflowInputSchema,
  placeholder,
  multiline,
}: StepReferenceInputProps) {
  const contextInputSchema = useContext(WorkflowInputSchemaContext);
  const secretKeys = useContext(SecretKeysContext);
  const resolvedInputSchema = workflowInputSchema ?? contextInputSchema;
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorSegmentIdx, setCursorSegmentIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep fresh refs for values used in insertRef to avoid stale closures
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const idToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allStepNodes) map.set(s.id, s.label);
    return map;
  }, [allStepNodes]);

  const nameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allStepNodes) map.set(s.label, s.id);
    return map;
  }, [allStepNodes]);

  const idToSchema = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const s of allStepNodes) {
      if (s.outputSchema) map.set(s.id, s.outputSchema);
    }
    return map;
  }, [allStepNodes]);

  const segments = useMemo(
    () => parseSegments(String(value), idToName, nameToId),
    [value, idToName, nameToId],
  );

  const mentionItems: MentionItem[] = useMemo(() => {
    const items: MentionItem[] = allStepNodes
      .filter((s) => s.id !== currentNodeId)
      .map((s) => ({
        id: s.id,
        label: s.label,
        prefix: 'steps',
        outputSchema: s.outputSchema,
      }));
    // Add workflow input option
    items.push({
      id: 'workflow',
      label: 'Workflow Input',
      prefix: 'workflow',
      outputSchema: resolvedInputSchema,
    });
    // Add secret keys
    for (const key of secretKeys) {
      items.push({
        id: key,
        label: `Secret: ${key}`,
        prefix: 'secrets',
      });
    }
    return items;
  }, [allStepNodes, currentNodeId, resolvedInputSchema, secretKeys]);

  const filteredSteps = useMemo(() => {
    if (!mentionFilter) return mentionItems;
    const lower = mentionFilter.toLowerCase();
    return mentionItems.filter((s) => s.label.toLowerCase().includes(lower));
  }, [mentionItems, mentionFilter]);

  useEffect(() => {
    setMentionIndex(0);
  }, []);

  const removeRef = useCallback(
    (segIndex: number) => {
      const newSegments = segments.filter((_, i) => i !== segIndex);
      onChange(serializeSegments(newSegments));
    },
    [segments, onChange],
  );

  const updateRefPath = useCallback(
    (segIndex: number, newPath: string) => {
      const newSegments = [...segments];
      const seg = newSegments[segIndex];
      if (seg.type === 'ref') {
        newSegments[segIndex] = { ...seg, path: newPath };
        onChange(serializeSegments(newSegments));
      }
    },
    [segments, onChange],
  );

  const insertRef = useCallback((item: MentionItem) => {
    const ref =
      item.prefix === 'secrets'
        ? `{{secrets.${item.id}}}`
        : item.prefix === 'workflow'
          ? '{{workflow.input}}'
          : `{{steps.${item.id}.output}}`;
    const currentValue = String(valueRef.current);

    // Find the @ trigger in the current value and replace from there
    const atPos = currentValue.lastIndexOf('@');
    const newValue = atPos >= 0 ? currentValue.slice(0, atPos) + ref : currentValue + ref;
    onChangeRef.current(newValue);

    setShowMention(false);
    setMentionFilter('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showMention) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((i) => Math.min(i + 1, filteredSteps.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (filteredSteps[mentionIndex]) {
            insertRef(filteredSteps[mentionIndex]);
          }
        } else if (e.key === 'Escape') {
          setShowMention(false);
          setMentionFilter('');
        }
      }
    },
    [showMention, filteredSteps, mentionIndex, insertRef],
  );

  const checkForMention = useCallback((text: string, cursorPos: number) => {
    const textBeforeCursor = text.slice(0, cursorPos);
    const atPos = textBeforeCursor.lastIndexOf('@');
    if (atPos >= 0 && (atPos === 0 || textBeforeCursor[atPos - 1] === ' ')) {
      const filter = textBeforeCursor.slice(atPos + 1);
      if (!filter.includes('}}')) {
        setShowMention(true);
        setMentionFilter(filter);
        return;
      }
    }
    setShowMention(false);
    setMentionFilter('');
  }, []);

  // Close mention dropdown on outside click
  useEffect(() => {
    if (!showMention) return;
    const handler = (e: MouseEvent) => {
      if (
        mentionRef.current &&
        !mentionRef.current.contains(e.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowMention(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMention]);

  const hasRefs = segments.some((s) => s.type === 'ref');

  const textOnly = useMemo(() => {
    if (hasRefs) return '';
    return segments.map((s) => (s.type === 'text' ? s.value : '')).join('');
  }, [segments, hasRefs]);

  const inputClassName =
    'min-w-[40px] max-w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground';

  // Simple mode: no refs yet, plain input
  if (!hasRefs) {
    return (
      <div ref={containerRef} className="relative">
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={textOnly}
            onChange={(e) => {
              checkForMention(e.target.value, e.target.selectionStart ?? 0);
              onChange(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setCursorSegmentIdx(0)}
            placeholder={placeholder}
            rows={4}
            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={textOnly}
            onChange={(e) => {
              checkForMention(e.target.value, e.target.selectionStart ?? 0);
              onChange(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setCursorSegmentIdx(0)}
            placeholder={placeholder}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        )}
        {showMention && filteredSteps.length > 0 && (
          <MentionDropdown
            ref={mentionRef}
            steps={filteredSteps}
            activeIndex={mentionIndex}
            onSelect={insertRef}
            anchorRef={containerRef}
          />
        )}
      </div>
    );
  }

  // Ensure there's always a text segment between/after refs so the user can type
  const trailingEmpty: Segment = { type: 'text', value: '' };
  const renderSegments: Segment[] =
    segments.length === 0 || segments[segments.length - 1].type === 'ref'
      ? [...segments, trailingEmpty]
      : segments;

  // Mixed mode: pills + inline text inputs
  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1 min-h-9 w-full overflow-visible rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs focus-within:ring-1 focus-within:ring-ring cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {renderSegments.map((seg, i) => {
          if (seg.type === 'ref') {
            const name =
              seg.prefix === 'secrets'
                ? 'Secret'
                : seg.prefix === 'workflow'
                  ? 'Workflow Input'
                  : (idToName.get(seg.stepId) ?? seg.stepId);
            const schema =
              seg.prefix === 'workflow'
                ? resolvedInputSchema
                : seg.prefix === 'secrets'
                  ? {
                      type: 'object',
                      properties: Object.fromEntries(
                        secretKeys.map((k) => [k, { type: 'string' }]),
                      ),
                    }
                  : idToSchema.get(seg.stepId);
            const path = seg.prefix === 'secrets' ? seg.stepId : seg.path;
            const segIdx = segments.indexOf(seg);
            return (
              <RefPill
                key={`ref-${seg.prefix}-${seg.stepId}`}
                prefix={seg.prefix}
                stepName={name}
                path={path}
                pathPrefix={seg.prefix === 'secrets' || seg.prefix === 'workflow' ? '' : 'output'}
                outputSchema={schema}
                onPathChange={
                  seg.prefix === 'secrets'
                    ? (newKey) => {
                        // Rebuild the secret ref with the new key
                        const newSegments = [...segments];
                        newSegments[segIdx] = {
                          ...seg,
                          stepId: newKey,
                          raw: `{{secrets.${newKey}}}`,
                        };
                        onChange(serializeSegments(newSegments));
                      }
                    : (newPath) => updateRefPath(segIdx, newPath)
                }
                onRemove={() => removeRef(segIdx)}
              />
            );
          }
          return (
            <input // biome-ignore lint/suspicious/noArrayIndexKey: stable keys for focus
              key={`text-${i}`}
              ref={
                i === renderSegments.length - 1 || cursorSegmentIdx === i
                  ? (inputRef as React.RefObject<HTMLInputElement>)
                  : undefined
              }
              value={seg.value}
              onChange={(e) => {
                // Map renderSegments index back to real segments index
                const realIdx = segments.indexOf(seg);
                if (realIdx >= 0) {
                  const newSegments = [...segments];
                  newSegments[realIdx] = { type: 'text', value: e.target.value };
                  checkForMention(e.target.value, e.target.selectionStart ?? 0);
                  setCursorSegmentIdx(i);
                  onChange(serializeSegments(newSegments));
                } else {
                  // This is the injected trailing empty text segment
                  checkForMention(e.target.value, e.target.selectionStart ?? 0);
                  setCursorSegmentIdx(i);
                  onChange(
                    serializeSegments([...segments, { type: 'text', value: e.target.value }]),
                  );
                }
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setCursorSegmentIdx(i)}
              placeholder={i === 0 && renderSegments.length === 1 ? placeholder : undefined}
              className={inputClassName}
              style={{ width: `${Math.max(seg.value.length, 2)}ch` }}
            />
          );
        })}
      </div>
      {showMention && filteredSteps.length > 0 && (
        <MentionDropdown
          ref={mentionRef}
          steps={filteredSteps}
          activeIndex={mentionIndex}
          onSelect={insertRef}
          anchorRef={containerRef}
        />
      )}
    </div>
  );
}

interface MentionDropdownProps {
  steps: MentionItem[];
  activeIndex: number;
  onSelect: (item: MentionItem) => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

const MentionDropdown = forwardRef<HTMLDivElement, MentionDropdownProps>(
  ({ steps, activeIndex, onSelect, anchorRef }, ref) => {
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

    useEffect(() => {
      if (anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    }, [anchorRef]);

    // Render into the closest .react-flow wrapper so it sits above the canvas
    const portalTarget = anchorRef.current?.closest('.react-flow') ?? document.body;

    return createPortal(
      <div
        ref={ref}
        style={{ position: 'fixed', top: pos.top, left: pos.left, width: Math.max(pos.width, 180) }}
        className="z-[9999] max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md pointer-events-auto"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {steps.map((step, i) => (
          <div
            key={step.id}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(step);
            }}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs ${
              i === activeIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <span className="truncate">{step.label}</span>
            {step.prefix === 'workflow' && (
              <span className="text-[9px] text-muted-foreground ml-auto shrink-0">trigger</span>
            )}
          </div>
        ))}
      </div>,
      portalTarget,
    );
  },
);
MentionDropdown.displayName = 'MentionDropdown';
