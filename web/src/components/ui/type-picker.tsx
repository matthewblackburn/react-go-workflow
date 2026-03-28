import { Check } from 'lucide-react';
import { useRef, useState } from 'react';

export interface TypeOption {
  value: string;
  label: string;
  letter: string;
  dot: string;
  bg: string;
  text: string;
  bracket?: string;
}

export const VALUE_TYPES: TypeOption[] = [
  { value: 'string', label: 'String', letter: 'S', dot: 'bg-green-500', bg: 'bg-green-500/15', text: 'text-green-500' },
  { value: 'number', label: 'Number', letter: 'N', dot: 'bg-blue-500', bg: 'bg-blue-500/15', text: 'text-blue-500' },
  { value: 'boolean', label: 'Boolean', letter: 'B', dot: 'bg-amber-500', bg: 'bg-amber-500/15', text: 'text-amber-500' },
  { value: 'datetime', label: 'Date/Time', letter: 'D', dot: 'bg-cyan-500', bg: 'bg-cyan-500/15', text: 'text-cyan-500' },
];

export const SCHEMA_TYPES: TypeOption[] = [
  { value: 'string', label: 'String', letter: 'S', dot: 'bg-green-500', bg: 'bg-green-500/15', text: 'text-green-500' },
  { value: 'number', label: 'Number', letter: 'N', dot: 'bg-blue-500', bg: 'bg-blue-500/15', text: 'text-blue-500' },
  { value: 'boolean', label: 'Boolean', letter: 'B', dot: 'bg-amber-500', bg: 'bg-amber-500/15', text: 'text-amber-500' },
  { value: 'object', label: 'Object', letter: 'O', dot: 'bg-violet-500', bg: 'bg-violet-500/15', text: 'text-violet-500', bracket: '{ }' },
  { value: 'array', label: 'Array', letter: 'A', dot: 'bg-pink-500', bg: 'bg-pink-500/15', text: 'text-pink-500', bracket: '[ ]' },
];

export function getTypeInfo(type: string, types: TypeOption[] = SCHEMA_TYPES): TypeOption {
  return types.find((t) => t.value === type) ?? types[0];
}

export function TypeBadge({
  type,
  types = VALUE_TYPES,
  onChange,
}: {
  type: string;
  types?: TypeOption[];
  onChange?: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const info = getTypeInfo(type, types);

  if (!onChange) {
    return (
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-bold text-[9px] ${info.bg} ${info.text}`}
      >
        {info.letter}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-bold text-[9px] ${info.bg} ${info.text}`}
      >
        {info.letter}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-9998" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-9999 mt-1 min-w-[130px] rounded-md border bg-popover p-1 shadow-md">
            {types.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  onChange(t.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
                <span className="flex-1 text-left">{t.label}</span>
                {t.value === type && <Check className="h-3 w-3 text-muted-foreground" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
