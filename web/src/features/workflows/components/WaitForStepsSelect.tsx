import { ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface StepOption {
  id: string;
  label: string;
  isCondition: boolean;
  outputSchema?: Record<string, any>;
}

interface WaitForStepsSelectProps {
  currentNodeId: string;
  allStepNodes: StepOption[];
  selectedIds: string[];
  branches: Record<string, 'true' | 'false'>;
  onChange: (ids: string[]) => void;
  onBranchChange: (branches: Record<string, 'true' | 'false'>) => void;
}

export function WaitForStepsSelect({
  currentNodeId,
  allStepNodes,
  selectedIds,
  branches,
  onChange,
  onBranchChange,
}: WaitForStepsSelectProps) {
  const availableSteps = allStepNodes.filter((s) => s.id !== currentNodeId);
  const selectedSteps = availableSteps.filter((s) => selectedIds.includes(s.id));

  function toggle(step: StepOption) {
    if (selectedIds.includes(step.id)) {
      onChange(selectedIds.filter((id) => id !== step.id));
      // Clean up branch entry
      if (branches[step.id]) {
        const next = { ...branches };
        delete next[step.id];
        onBranchChange(next);
      }
    } else {
      onChange([...selectedIds, step.id]);
      // Default condition steps to 'true' (Yes) branch
      if (step.isCondition) {
        onBranchChange({ ...branches, [step.id]: 'true' });
      }
    }
  }

  function remove(stepId: string) {
    onChange(selectedIds.filter((id) => id !== stepId));
    if (branches[stepId]) {
      const next = { ...branches };
      delete next[stepId];
      onBranchChange(next);
    }
  }

  function toggleBranch(stepId: string) {
    const current = branches[stepId] ?? 'true';
    onBranchChange({ ...branches, [stepId]: current === 'true' ? 'false' : 'true' });
  }

  if (availableSteps.length === 0) {
    return <p className="text-xs text-muted-foreground">No other steps available</p>;
  }

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between h-auto min-h-9 px-3 py-2"
          >
            <span className="text-xs text-muted-foreground">
              {selectedSteps.length === 0 ? 'No dependencies' : `${selectedSteps.length} selected`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
          {availableSteps.map((step) => (
            <DropdownMenuCheckboxItem
              key={step.id}
              checked={selectedIds.includes(step.id)}
              onCheckedChange={() => toggle(step)}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="truncate text-xs">{step.label}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedSteps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSteps.map((step) => {
            const branch = branches[step.id];
            const branchLabel = branch === 'true' ? 'Yes' : branch === 'false' ? 'No' : null;

            return (
              <Badge key={step.id} variant="secondary" className="gap-1 text-[10px] pr-1">
                {step.label}
                {step.isCondition && branchLabel && (
                  <button
                    type="button"
                    onClick={() => toggleBranch(step.id)}
                    className={`ml-0.5 rounded px-1 py-0 text-[9px] font-bold ${
                      branch === 'true'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    }`}
                  >
                    {branchLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(step.id)}
                  className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
