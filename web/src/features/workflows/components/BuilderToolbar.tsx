import { useReactFlow } from '@xyflow/react';
import {
  LayoutDashboard,
  Loader2,
  Maximize,
  Play,
  Save,
  Settings,
  StickyNote,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface BuilderToolbarProps {
  workflowName: string;
  onSave: () => void;
  onAddNote: () => void;
  onAutoLayout: () => void;
  onOpenSettings: () => void;
  onExecute: () => void;
  isSaving: boolean;
  isExecuting: boolean;
  hasUnsavedChanges: boolean;
  executionStatus: string | null;
}

export function BuilderToolbar({
  workflowName,
  onSave,
  onAddNote,
  onAutoLayout,
  onOpenSettings,
  onExecute,
  isSaving,
  isExecuting,
  hasUnsavedChanges,
  executionStatus,
}: BuilderToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex h-12 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-sm">{workflowName}</h2>
        {hasUnsavedChanges && (
          <span className="text-muted-foreground text-xs">Unsaved changes</span>
        )}
        {executionStatus === 'running' && (
          <span className="flex items-center gap-1.5 text-blue-600 text-xs dark:text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running...
          </span>
        )}
        {executionStatus === 'completed' && (
          <span className="text-green-600 text-xs dark:text-green-400">Completed</span>
        )}
        {executionStatus === 'failed' && (
          <span className="text-red-600 text-xs dark:text-red-400">Failed</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-tour="toolbar-note"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onAddNote}
            >
              <StickyNote className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add a note</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAutoLayout}>
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Auto layout</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomIn()}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomOut()}>
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => fitView({ padding: 0.2 })}
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit to view</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings}>
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Workflow settings</TooltipContent>
        </Tooltip>

        <Button
          data-tour="toolbar-save"
          size="sm"
          className="ml-2 h-8"
          variant="outline"
          onClick={onSave}
          disabled={isSaving}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>

        <Button
          data-tour="toolbar-run"
          size="sm"
          className="h-8 bg-green-600 text-white hover:bg-green-700"
          onClick={onExecute}
          disabled={isExecuting}
        >
          {isExecuting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          {isExecuting ? 'Running...' : 'Run'}
        </Button>
      </div>
    </div>
  );
}
