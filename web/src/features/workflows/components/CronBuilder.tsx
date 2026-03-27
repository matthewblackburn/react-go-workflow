import cronstrue from 'cronstrue';
import { Clock, Code } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CronBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

type Frequency = 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

const DAYS_OF_WEEK = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

function cronToHuman(expr: string): string {
  try {
    return cronstrue.toString(expr);
  } catch {
    return 'Invalid expression';
  }
}

export function detectFrequency(cron: string): Frequency {
  if (!cron) return 'daily';
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 'custom';

  const [min, hour, dom, , dow] = parts;

  if (min === '*' && hour === '*') return 'minute';
  if (min !== '*' && hour === '*') return 'hourly';
  if (min !== '*' && hour !== '*' && dom === '*' && dow === '*') return 'daily';
  if (min !== '*' && hour !== '*' && dom === '*' && dow !== '*') return 'weekly';
  if (min !== '*' && hour !== '*' && dom !== '*') return 'monthly';
  return 'custom';
}

export function parseCronParts(cron: string) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5)
    return { minute: '0', hour: '9', dayOfMonth: '1', dayOfWeek: '1', everyMinutes: '5' };
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    dayOfWeek: parts[4],
    everyMinutes: parts[0].startsWith('*/') ? parts[0].slice(2) : '5',
  };
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  // Emit default expression on mount if empty
  useEffect(() => {
    if (!value) {
      onChange('0 9 * * *');
    }
  }, [onChange, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<'builder' | 'custom'>(
    value && detectFrequency(value) === 'custom' ? 'custom' : 'builder',
  );
  const [frequency, setFrequency] = useState<Frequency>(() => {
    if (!value) return 'daily';
    const f = detectFrequency(value);
    return f === 'custom' ? 'daily' : f;
  });

  const parts = useMemo(() => parseCronParts(value || '0 9 * * *'), [value]);

  const buildCron = useCallback(
    (freq: Frequency, p: typeof parts) => {
      switch (freq) {
        case 'minute':
          return `*/${p.everyMinutes} * * * *`;
        case 'hourly':
          return `${p.minute} * * * *`;
        case 'daily':
          return `${p.minute} ${p.hour} * * *`;
        case 'weekly':
          return `${p.minute} ${p.hour} * * ${p.dayOfWeek}`;
        case 'monthly':
          return `${p.minute} ${p.hour} ${p.dayOfMonth} * *`;
        default:
          return value;
      }
    },
    [value],
  );

  function updateAndBuild(freq: Frequency, updates: Partial<typeof parts>) {
    const newParts = { ...parts, ...updates };
    const cron = buildCron(freq, newParts);
    onChange(cron);
  }

  function handleFrequencyChange(f: Frequency) {
    setFrequency(f);
    updateAndBuild(f, {});
  }

  const preview = value ? cronToHuman(value) : '';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('builder')}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
            mode === 'builder'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock className="h-3 w-3" />
          Builder
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
            mode === 'custom'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <Code className="h-3 w-3" />
          Custom
        </button>
      </div>

      {mode === 'custom' ? (
        <div className="space-y-2">
          <Label className="text-xs">Cron Expression</Label>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0 9 * * 1-5"
            className="font-mono"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Run every</Label>
            <Select value={frequency} onValueChange={(v) => handleFrequencyChange(v as Frequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minute">X minutes</SelectItem>
                <SelectItem value="hourly">Hour</SelectItem>
                <SelectItem value="daily">Day</SelectItem>
                <SelectItem value="weekly">Week</SelectItem>
                <SelectItem value="monthly">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === 'minute' && (
            <div className="space-y-2">
              <Label className="text-xs">Every how many minutes?</Label>
              <Input
                type="number"
                min={1}
                max={59}
                value={parts.everyMinutes}
                onChange={(e) => updateAndBuild(frequency, { everyMinutes: e.target.value })}
              />
            </div>
          )}

          {frequency === 'hourly' && (
            <div className="space-y-2">
              <Label className="text-xs">At minute</Label>
              <Input
                type="number"
                min={0}
                max={59}
                value={parts.minute}
                onChange={(e) => updateAndBuild(frequency, { minute: e.target.value })}
              />
            </div>
          )}

          {(frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly') && (
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <Label className="text-xs">Hour</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={parts.hour}
                  onChange={(e) => updateAndBuild(frequency, { hour: e.target.value })}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs">Minute</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={parts.minute}
                  onChange={(e) => updateAndBuild(frequency, { minute: e.target.value })}
                />
              </div>
            </div>
          )}

          {frequency === 'weekly' && (
            <div className="space-y-2">
              <Label className="text-xs">Day of week</Label>
              <Select
                value={parts.dayOfWeek}
                onValueChange={(v) => updateAndBuild(frequency, { dayOfWeek: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {frequency === 'monthly' && (
            <div className="space-y-2">
              <Label className="text-xs">Day of month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={parts.dayOfMonth}
                onChange={(e) => updateAndBuild(frequency, { dayOfMonth: e.target.value })}
              />
            </div>
          )}
        </div>
      )}

      {preview && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5">
          <Clock className="h-3 w-3 shrink-0" />
          {preview}
        </p>
      )}
    </div>
  );
}
