import { useReactFlow } from "@xyflow/react";
import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    ArrowLeftRight,
    Loader2,
    Maximize,
    Play,
    Save,
    Settings,
    Sparkles,
    StickyNote,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BuilderToolbarProps {
    workflowName: string;
    onSave: () => void;
    onAddNote: () => void;
    onOpenSettings: () => void;
    onOpenIO: () => void;
    onOpenAIChat: () => void;
    onExecute: () => void;
    isSaving: boolean;
    isExecuting: boolean;
    hasUnsavedChanges: boolean;
    lastSavedAt: Date | null;
    executionStatus: string | null;
}

export function BuilderToolbar({
    workflowName,
    onSave,
    onAddNote,
    onOpenSettings,
    onOpenIO,
    onOpenAIChat,
    onExecute,
    isSaving,
    isExecuting,
    hasUnsavedChanges,
    lastSavedAt,
    executionStatus,
}: BuilderToolbarProps) {
    const { zoomIn, zoomOut, fitView } = useReactFlow();
    const navigate = useNavigate();

    const aiButtonRef = useRef<HTMLButtonElement>(null);
    const glowRef = useRef<HTMLSpanElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!aiButtonRef.current || !glowRef.current) return;
        const rect = aiButtonRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        glowRef.current.style.left = `${x}px`;
        glowRef.current.style.top = `${y}px`;
        glowRef.current.style.opacity = "1";
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (glowRef.current) glowRef.current.style.opacity = "0";
    }, []);

    return (
        <div className="flex h-12 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/workflows")}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="font-semibold text-sm">{workflowName}</h2>
                {hasUnsavedChanges ? (
                    <span className="text-muted-foreground text-xs">Unsaved changes</span>
                ) : lastSavedAt ? (
                    <span className="text-muted-foreground text-xs">
                        Saved {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                ) : null}
                {executionStatus === "running" && (
                    <span className="flex items-center gap-1.5 text-blue-600 text-xs dark:text-blue-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running...
                    </span>
                )}
                {executionStatus === "completed" && (
                    <span className="text-green-600 text-xs dark:text-green-400">Completed</span>
                )}
                {executionStatus === "failed" && <span className="text-red-600 text-xs dark:text-red-400">Failed</span>}
            </div>

            <div className="flex items-center gap-1">
                <Button
                    ref={aiButtonRef}
                    size="sm"
                    className="group relative h-8 overflow-hidden bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-indigo-500 hover:shadow-md hover:shadow-violet-500/30"
                    onClick={onOpenAIChat}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                >
                    <span
                        ref={glowRef}
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-200"
                        style={{
                            width: 80,
                            height: 80,
                            background: "radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)",
                        }}
                    />
                    <Sparkles className="relative mr-1.5 h-3.5 w-3.5 animate-shimmer transition-transform group-hover:rotate-12 group-hover:scale-110" />
                    <span className="relative">AI Assistant</span>
                </Button>

                <div className="mx-1 h-5 w-px bg-border" />

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

                <div className="mx-1 h-5 w-px bg-border" />

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

                <div className="mx-1 h-5 w-px bg-border" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenIO}>
                            <ArrowLeftRight className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Input / Output</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings}>
                            <Settings className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Workflow settings</TooltipContent>
                </Tooltip>

                <div className="mx-1 h-5 w-px bg-border" />

                <Button
                    data-tour="toolbar-save"
                    size="sm"
                    className="ml-2 h-8"
                    variant="outline"
                    onClick={onSave}
                    disabled={isSaving}
                >
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {isSaving ? "Saving..." : "Save"}
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
                    {isExecuting ? "Running..." : "Run"}
                </Button>
            </div>
        </div>
    );
}
