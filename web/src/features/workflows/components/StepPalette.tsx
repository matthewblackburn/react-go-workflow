import { useDraggable } from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import * as LucideIcons from 'lucide-react';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { stepTypeApi } from '@/api/workflows';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { StepType } from '@/types/workflow';

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

const categoryLabels: Record<string, string> = {
  action: 'Actions',
  logic: 'Logic',
  utility: 'Utilities',
  trigger: 'Triggers',
};

const categoryOrder = ['action', 'logic', 'utility', 'trigger'];

function DraggablePaletteItem({
  stepType,
  isFirstItem,
}: {
  stepType: StepType;
  isFirstItem?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${stepType.id}`,
    data: { stepType },
  });

  const Icon = getIcon(stepType.icon);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          {...(isFirstItem ? { 'data-tour': 'step-palette-item' } : {})}
          className={`flex cursor-grab items-center gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent active:cursor-grabbing ${
            isDragging ? 'opacity-50' : ''
          }`}
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{stepType.display_name}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[200px]">
        <p className="text-xs">{stepType.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function StepPalette() {
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['step-types'],
    queryFn: () => stepTypeApi.list(),
  });

  const stepTypes = data?.data ?? [];
  const filtered = search
    ? stepTypes.filter(
        (st) =>
          st.display_name.toLowerCase().includes(search.toLowerCase()) ||
          st.description.toLowerCase().includes(search.toLowerCase()),
      )
    : stepTypes;

  const grouped = categoryOrder
    .map((cat) => ({
      category: cat,
      label: categoryLabels[cat] ?? cat,
      types: filtered.filter((st) => st.category === cat),
    }))
    .filter((g) => g.types.length > 0);

  return (
    <div
      data-tour="step-palette"
      className="flex h-full min-h-0 w-64 flex-col border-r bg-background"
    >
      <div className="border-b p-3">
        <h3 className="mb-2 font-semibold text-sm">Steps</h3>
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search steps..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {grouped.map((group) => (
            <div key={group.category} className="mb-4">
              <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                {group.label}
              </p>
              <div className="grid gap-1.5">
                {group.types.map((st, i) => (
                  <DraggablePaletteItem
                    key={st.id}
                    stepType={st}
                    isFirstItem={group.category === grouped[0]?.category && i === 0}
                  />
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No steps match your search
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
