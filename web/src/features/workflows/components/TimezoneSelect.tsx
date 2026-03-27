import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
}

// Get all IANA timezones from the browser
function getTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    // Fallback for older browsers
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Sao_Paulo',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Moscow',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Kolkata',
      'Asia/Dubai',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Pacific/Auckland',
    ];
  }
}

function getUtcOffset(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    return offset;
  } catch {
    return '';
  }
}

export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
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

  const timezones = useMemo(() => getTimezones(), []);
  const filtered = useMemo(() => {
    if (!search) return timezones;
    const lower = search.toLowerCase();
    return timezones.filter((tz) => tz.toLowerCase().includes(lower));
  }, [timezones, search]);

  const displayValue = value || 'Select timezone...';
  const offset = value ? getUtcOffset(value) : '';

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
          {offset && <span className="ml-1 text-xs text-muted-foreground">{offset}</span>}
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
              placeholder="Search timezones..."
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-[220px] p-1">
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No timezones found</p>
            )}
            {filtered.map((tz) => (
              <button
                key={tz}
                type="button"
                onClick={() => {
                  onChange(tz);
                  setOpen(false);
                  setSearch('');
                }}
                className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground ${
                  tz === value ? 'bg-accent text-accent-foreground' : ''
                }`}
              >
                <span>{tz.replace(/_/g, ' ')}</span>
                <span className="text-[10px] text-muted-foreground">{getUtcOffset(tz)}</span>
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
