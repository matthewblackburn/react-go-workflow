import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { databaseApi } from '@/api/workflows';
import { Input } from '@/components/ui/input';

interface TableSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function TableSelect({ value, onChange }: TableSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < dropdownHeight && rect.top > spaceBelow;
      setPos({
        top: openUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ['database-tables'],
    queryFn: () => databaseApi.listTables(),
    enabled: open,
    staleTime: 30000,
  });

  const tables = (data as any)?.data as string[] | undefined;

  const filtered = useMemo(() => {
    if (!tables) return [];
    if (!search) return tables;
    const lower = search.toLowerCase();
    return tables.filter((t) => t.toLowerCase().includes(lower));
  }, [tables, search]);

  const displayValue = value || 'Select table...';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={`flex-1 text-left ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {displayValue}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="fixed z-[9999] rounded-md border bg-popover shadow-md max-h-[280px] flex flex-col"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="p-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables..."
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-[220px] p-1">
            {isLoading && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No tables found</p>
            )}
            {filtered.map((table) => (
              <button
                key={table}
                type="button"
                onClick={() => {
                  onChange(table);
                  setOpen(false);
                  setSearch('');
                }}
                className={`flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                  table === value ? 'bg-accent text-accent-foreground' : ''
                }`}
              >
                {table}
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setOpen(false);
            setSearch('');
          }}
        />
      )}
    </div>
  );
}
