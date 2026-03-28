import {
    Background,
    BackgroundVariant,
    type Node,
    Position,
    ReactFlow,
    ReactFlowProvider,
    type Edge as RFEdge,
    useNodesState,
    useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
    DndContext,
    type DragEndEvent,
    DragOverlay,
    type DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as LucideIcons from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { secretApi } from "@/api/secrets";
import { workflowApi } from "@/api/workflows";
import { JsonBuilder, RULES_JSON, schemaToTree, treeToJson } from "@/components/json-builder/JsonBuilder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useExecutionWS } from "@/hooks/useExecutionWS";
import type { GeneratedEdge, GeneratedStep } from "@/types/ai";
import type { CanvasNote, StepType, WorkflowEdge, WorkflowStep } from "@/types/workflow";
import { AIChatPanel } from "../components/AIChatPanel";
import { IOPanel } from "../components/IOPanel";
import { BuilderToolbar } from "../components/BuilderToolbar";
import { ConfigPanel } from "../components/ConfigPanel";
import { ExecutionDrawer } from "../components/ExecutionDrawer";
import { GuidedTour } from "../components/GuidedTour";
import { LabeledEdge } from "../components/LabeledEdge";
import { NoteConfigPanel } from "../components/NoteConfigPanel";
import {
    SecretKeysContext,
    StepNode,
    type StepNodeData,
    StepNodesContext,
    WorkflowInputSchemaContext,
} from "../components/StepNode";
import { StepPalette } from "../components/StepPalette";
import { StickyNote, type StickyNoteData } from "../components/StickyNote";
import { WorkflowSettingsSheet } from "../components/WorkflowSettingsSheet";
import { getLayoutedNodes } from "../utils/autoLayout";
import { computeEdges, extractStepReferences } from "../utils/computeEdges";
import { applyExecutionStyles } from "../utils/executionStyles";

const nodeTypes = {
    stepNode: StepNode,
    stickyNote: StickyNote,
};

const edgeTypes = {
    labeled: LabeledEdge,
};

const NODE_HEIGHT = 80;
const NODE_GAP = 60;

const dragPreviewColors: Record<string, string> = {
    trigger: "border-purple-400 bg-purple-50 dark:bg-purple-950",
    action: "border-blue-400 bg-blue-50 dark:bg-blue-950",
    logic: "border-amber-400 bg-amber-50 dark:bg-amber-950",
    utility: "border-emerald-400 bg-emerald-50 dark:bg-emerald-950",
};

function getIcon(iconName?: string): React.ComponentType<{ className?: string }> {
    if (!iconName) return LucideIcons.Box;
    const pascalName = iconName
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("");
    const icon = (LucideIcons as Record<string, any>)[pascalName];
    return (icon as React.ComponentType<{ className?: string }>) ?? LucideIcons.Box;
}

function DragPreview({ stepType }: { stepType: StepType }) {
    const colorClass = dragPreviewColors[stepType.category] ?? dragPreviewColors.action;
    const Icon = getIcon(stepType.icon);
    return (
        <div className={`min-w-[180px] rounded-lg border-2 px-4 py-3 opacity-90 shadow-lg ${colorClass}`}>
            <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/60 p-1.5">
                    <Icon className="h-4 w-4" />
                </div>
                <p className="font-medium text-sm">{stepType.display_name}</p>
            </div>
        </div>
    );
}

/** Derive a JSON-Schema-like object from an actual runtime value, for autocomplete. */
function schemaFromValue(value: unknown): Record<string, any> {
    if (value === null || value === undefined) return { type: "object" };
    if (Array.isArray(value)) {
        return { type: "array", items: value.length > 0 ? schemaFromValue(value[0]) : {} };
    }
    if (typeof value === "object") {
        const properties: Record<string, any> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            properties[k] = schemaFromValue(v);
        }
        return { type: "object", properties };
    }
    return { type: typeof value };
}

function makeStepNode(id: string, position: { x: number; y: number }, data: StepNodeData): Node {
    return {
        id,
        type: "stepNode",
        position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        data: data as unknown as Record<string, unknown>,
    };
}

function WorkflowBuilderInner() {
    const { id } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [draggingStepType, setDraggingStepType] = useState<StepType | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveRef = useRef<(() => void) | null>(null);
    const markDirty = useCallback(() => {
        setHasUnsavedChanges(true);
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(() => {
            saveRef.current?.();
        }, 1500);
    }, []);
    const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [ioPanelOpen, setIOPanelOpen] = useState(false);
    const [aiChatOpen, setAIChatOpen] = useState(false);
    const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
    const [executeInputValue, setExecuteInputValue] = useState<Record<string, any> | undefined>(undefined);

    // WebSocket for live execution updates
    const {
        events,
        stepStatuses,
        stepResults,
        executionStatus,
        executionError,
        reset: resetWS,
    } = useExecutionWS(currentExecutionId);

    // Update node styles based on execution status
    useEffect(() => {
        if (stepStatuses.size === 0) return;
        setNodes((nds) => applyExecutionStyles(nds, stepStatuses));
    }, [stepStatuses, setNodes]);

    // Clear execution styling when execution completes
    useEffect(() => {
        if (executionStatus === "completed" || executionStatus === "failed") {
            setIsExecuting(false);
            if (executionStatus === "completed") {
                toast.success("Workflow completed successfully");
            } else {
                toast.error(executionError || "Workflow execution failed");
            }
        }
    }, [executionStatus, executionError]);

    // Listen for edge branch toggle events from clickable edge labels
    useEffect(() => {
        const handler = (e: Event) => {
            const { sourceId, targetId, branch } = (e as CustomEvent).detail;
            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id !== targetId) return n;
                    const data = n.data as unknown as StepNodeData;
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            waitForBranches: { ...(data.waitForBranches ?? {}), [sourceId]: branch },
                        },
                    };
                }),
            );
            markDirty();
        };
        window.addEventListener("toggle-edge-branch", handler);
        return () => window.removeEventListener("toggle-edge-branch", handler);
    }, [setNodes, markDirty]);

    // Listen for quick-edit changes from inline node fields
    useEffect(() => {
        const handler = (e: Event) => {
            const { nodeId, key, value } = (e as CustomEvent).detail;
            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id !== nodeId) return n;
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            config: { ...(n.data as any).config, [key]: value },
                        },
                    };
                }),
            );
            markDirty();
        };
        window.addEventListener("node-quick-edit", handler);
        return () => window.removeEventListener("node-quick-edit", handler);
    }, [setNodes, markDirty]);

    // Map step type IDs to StepType objects
    const stepTypeMapRef = useRef<Map<string, StepType>>(new Map());
    const initializedRef = useRef(false);
    const prevEdgeKeyRef = useRef("");

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const { fitView } = useReactFlow();

    // Load workflow
    const { data: workflow } = useQuery({
        queryKey: ["workflow", id],
        queryFn: () => workflowApi.get(id!),
        enabled: !!id,
    });

    // Load step types
    const { data: stepTypesData } = useQuery({
        queryKey: ["step-types"],
        queryFn: async () => {
            const res = await (await fetch("/v1/step-types")).json();
            return res as { data: StepType[] };
        },
    });

    // Load secret keys for @mention autocomplete
    const { data: secretsData } = useQuery({
        queryKey: ["secret-keys"],
        queryFn: () => secretApi.list({ limit: 100 }),
    });
    const secretKeys = useMemo(() => (secretsData?.data ?? []).map((s) => s.key), [secretsData]);

    // Initialize canvas from workflow data (only once)
    // On load: existing API edges → waitForStepIds, then auto-layout
    useMemo(() => {
        if (initializedRef.current) return;
        if (!workflow?.edges || !stepTypesData?.data) return;

        initializedRef.current = true;

        const stepTypes = stepTypesData.data;
        const stMap = new Map(stepTypes.map((st) => [st.id, st]));
        stepTypeMapRef.current = stMap;

        // Build step ID set and name→id map for template reference detection
        const steps = workflow.edges.steps ?? [];
        const allStepIds = new Set(steps.map((s: WorkflowStep) => s.id));
        const stepNameToId = new Map(steps.map((s: WorkflowStep) => [s.name, s.id]));

        // For each step, find which source IDs are already referenced in its config
        const configRefsMap = new Map<string, Set<string>>();
        for (const step of steps as WorkflowStep[]) {
            const refs = extractStepReferences(step.config ?? {}, allStepIds, stepNameToId);
            configRefsMap.set(step.id, refs);
        }

        // Build waitForStepIds and waitForBranches from saved edges,
        // but skip edges that are already covered by template references in config
        const waitForMap = new Map<string, string[]>();
        const branchMap = new Map<string, Record<string, "true" | "false">>();
        for (const edge of (workflow.edges.edges ?? []) as WorkflowEdge[]) {
            const configRefs = configRefsMap.get(edge.target_step_id);
            const isCoveredByTemplate = configRefs?.has(edge.source_step_id) ?? false;

            if (!isCoveredByTemplate) {
                const existing = waitForMap.get(edge.target_step_id) ?? [];
                existing.push(edge.source_step_id);
                waitForMap.set(edge.target_step_id, existing);
            }

            // Always preserve branch info (needed for both template and wait-for edges)
            if (edge.source_output === "true" || edge.source_output === "false") {
                const branches = branchMap.get(edge.target_step_id) ?? {};
                branches[edge.source_step_id] = edge.source_output;
                branchMap.set(edge.target_step_id, branches);
            }
        }

        const initialNodes: Node[] = (steps as WorkflowStep[]).map((step) =>
            makeStepNode(
                step.id,
                { x: step.position_x, y: step.position_y },
                {
                    label: step.name,
                    description: step.description,
                    stepType: step.edges?.step_type ?? stMap.get(step.step_type_id),
                    config: step.config ?? {},
                    waitForStepIds: waitForMap.get(step.id) ?? [],
                    waitForBranches: branchMap.get(step.id) ?? {},
                },
            ),
        );

        const noteNodes: Node[] = (workflow.edges.canvas_notes ?? []).map((note: CanvasNote) => {
            const size = note.width || 200;
            return {
                id: note.id,
                type: "stickyNote",
                position: { x: note.position_x, y: note.position_y },
                style: { width: size, height: size },
                width: size,
                height: size,
                data: { content: note.content ?? "", color: note.color } satisfies StickyNoteData,
            };
        });

        // Auto-layout on load — also set initial edge key so the effect doesn't re-run
        const edges = computeEdges(initialNodes);
        const layouted = getLayoutedNodes(initialNodes, edges);
        setNodes([...layouted, ...noteNodes]);
        prevEdgeKeyRef.current = edges.map((e) => `${e.source}:${e.sourceHandle ?? ""}->${e.target}`).join(",");
    }, [workflow, stepTypesData, setNodes]);

    // Derive edges from node configs and waitForStepIds
    const computedEdges: RFEdge[] = useMemo(() => {
        return computeEdges(nodes.filter((n) => n.type === "stepNode"));
    }, [nodes]);

    // Auto-layout whenever edges change or node measurements become available
    const prevLayoutKeyRef = useRef("");
    const initialFitDoneRef = useRef(false);
    useEffect(() => {
        const stepNodes = nodes.filter((n) => n.type === "stepNode");
        if (stepNodes.length === 0) return;

        const edgeKey = computedEdges.map((e) => `${e.source}:${e.sourceHandle ?? ""}->${e.target}`).join(",");

        const measureKey = stepNodes
            .map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`)
            .join(",");

        const layoutKey = `${edgeKey}|${measureKey}`;
        if (layoutKey === prevLayoutKeyRef.current) return;
        prevLayoutKeyRef.current = layoutKey;
        prevEdgeKeyRef.current = edgeKey;

        const otherNodes = nodes.filter((n) => n.type !== "stepNode");
        const layouted = getLayoutedNodes(stepNodes, computedEdges);
        setNodes([...layouted, ...otherNodes]);

        // Only fitView on initial load, not on subsequent changes
        if (!initialFitDoneRef.current) {
            initialFitDoneRef.current = true;
            setTimeout(() => fitView({ padding: 0.2 }), 50);
        }
    }, [computedEdges, nodes, setNodes, fitView]);

    // Step nodes list for config panel / step pickers.
    // For steps with dynamicFields (e.g. json_parse), build output schema from
    // user-defined output_fields in the step config.
    // Falls back to runtime output if available, then static schema.
    const allStepNodes = useMemo(() => {
        return nodes
            .filter((n) => n.type === "stepNode")
            .map((n) => {
                const d = n.data as unknown as StepNodeData;
                let outputSchema = d.stepType?.output_schema;

                // Use user-defined output schema from config (e.g. json_parse)
                if (outputSchema?.dynamicOutput && d.config?._outputSchema) {
                    outputSchema = d.config._outputSchema as Record<string, any>;
                }

                // set_variable: derive output schema from variable_name in config
                if (d.stepType?.name === "set_variable" && d.config?.variable_name) {
                    const varName = String(d.config.variable_name);
                    outputSchema = { type: "object", properties: { [varName]: { type: "string" } } };
                }

                // Override with runtime output shape if available
                const result = stepResults.get(n.id);
                if (result?.output && typeof result.output === "object") {
                    outputSchema = schemaFromValue(result.output);
                }

                return {
                    id: n.id,
                    label: d.label,
                    stepTypeName: d.stepType?.name,
                    isCondition: ((d.stepType?.config_schema?.outputs as any[])?.length ?? 0) > 1,
                    outputSchema,
                };
            });
    }, [nodes, stepResults]);

    // Step info for AI diagnosis
    const stepInfoMap = useMemo(() => {
        const map = new Map<string, { name: string; stepType: string; config: Record<string, any> }>();
        for (const n of nodes) {
            if (n.type !== "stepNode") continue;
            const d = n.data as unknown as StepNodeData;
            map.set(n.id, {
                name: d.label,
                stepType: d.stepType?.name ?? "unknown",
                config: d.config ?? {},
            });
        }
        return map;
    }, [nodes]);

    // Select node
    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.type === "stepNode" || node.type === "stickyNote") {
            setSelectedNodeId(node.id);
        }
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
    }, []);

    // Handle drag from palette — new nodes stack below existing ones
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const stepType = (event.active.data.current as any)?.stepType as StepType | undefined;
        setDraggingStepType(stepType ?? null);
    }, []);
    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active } = event;
            const stepType = (active.data.current as any)?.stepType as StepType | undefined;
            if (!stepType) return;

            // Position new node below the last step node
            const stepNodes = nodes.filter((n) => n.type === "stepNode");
            let position: { x: number; y: number };
            if (stepNodes.length === 0) {
                position = { x: 0, y: 0 };
            } else {
                const maxY = Math.max(...stepNodes.map((n) => n.position.y));
                const firstX = stepNodes[0].position.x;
                position = { x: firstX, y: maxY + NODE_HEIGHT + NODE_GAP };
            }

            const newId = crypto.randomUUID();
            const newNode = makeStepNode(newId, position, {
                label: stepType.display_name,
                stepType,
                config: {},
                waitForStepIds: [],
            });

            stepTypeMapRef.current.set(stepType.id, stepType);
            setNodes((nds) => [...nds, newNode]);
            setSelectedNodeId(newId);
            markDirty();
            setDraggingStepType(null);
        },
        [setNodes, nodes, markDirty],
    );

    // Add sticky note
    const handleAddNote = useCallback(() => {
        const newNode: Node = {
            id: crypto.randomUUID(),
            type: "stickyNote",
            position: { x: 200, y: 200 },
            style: { width: 200, height: 200 },
            data: { content: "", color: "yellow" } satisfies StickyNoteData,
        };
        setNodes((nds) => [...nds, newNode]);
        markDirty();
    }, [setNodes, markDirty]);

    // Handle AI-generated workflow
    const handleAIWorkflowGenerated = useCallback(
        (steps: GeneratedStep[], edges: GeneratedEdge[], inputSchema?: Record<string, unknown>) => {
            const stMap = stepTypeMapRef.current;

            // Build name→id map from generated steps
            const nameToId = new Map(steps.map((s) => [s.name, s.id]));

            // Build waitForStepIds and waitForBranches from edges
            const waitForMap = new Map<string, string[]>();
            const branchMap = new Map<string, Record<string, "true" | "false">>();
            for (const edge of edges) {
                const sourceId = nameToId.get(edge.source_step_name);
                const targetId = nameToId.get(edge.target_step_name);
                if (!sourceId || !targetId) continue;

                const existing = waitForMap.get(targetId) ?? [];
                existing.push(sourceId);
                waitForMap.set(targetId, existing);

                if (edge.source_output === "true" || edge.source_output === "false") {
                    const branches = branchMap.get(targetId) ?? {};
                    branches[sourceId] = edge.source_output;
                    branchMap.set(targetId, branches);
                }
            }

            // Create nodes
            const newNodes = steps.map((step) => {
                const stepType = stMap.get(step.step_type_id);
                return makeStepNode(
                    step.id,
                    { x: 0, y: 0 },
                    {
                        label: step.name,
                        description: step.description,
                        stepType,
                        config: step.config as Record<string, any>,
                        waitForStepIds: waitForMap.get(step.id) ?? [],
                        waitForBranches: branchMap.get(step.id) ?? {},
                    },
                );
            });

            // Keep existing non-step nodes (sticky notes)
            const otherNodes = nodes.filter((n) => n.type !== "stepNode");
            setNodes([...newNodes, ...otherNodes]);
            markDirty();
            setTimeout(() => fitView({ padding: 0.2 }), 100);

            // Save input schema to workflow if AI provided one
            if (inputSchema && id) {
                workflowApi.update(id, { input_schema: inputSchema } as any);
            }
        },
        [nodes, setNodes, fitView, markDirty, id],
    );

    // Save canvas
    const saveMutation = useMutation({
        mutationFn: () => {
            const stepNodes = nodes.filter((n) => n.type === "stepNode");
            const noteNodes = nodes.filter((n) => n.type === "stickyNote");

            const steps = stepNodes.map((n) => {
                const data = n.data as unknown as StepNodeData;
                return {
                    id: n.id,
                    step_type_id: data.stepType?.id ?? "",
                    name: data.label,
                    description: data.description ?? "",
                    config: data.config ?? {},
                    position_x: n.position.x,
                    position_y: n.position.y,
                    input_mapping: {},
                    timeout_seconds: 30,
                    retry_count: 0,
                    retry_backoff: "none" as const,
                    retry_delay_ms: 1000,
                };
            });

            const edgeData = computedEdges.map((e) => ({
                id: crypto.randomUUID(),
                source_step_id: e.source,
                target_step_id: e.target,
                source_output: e.sourceHandle ?? "",
                target_input: "",
                edge_type: "normal" as const,
                condition: {},
            }));

            const notes = noteNodes.map((n) => {
                const data = n.data as unknown as StickyNoteData;
                const size = (n as any).width || n.measured?.width || Number.parseFloat(String(n.style?.width)) || 200;
                return {
                    id: n.id,
                    content: data.content,
                    color: data.color,
                    position_x: n.position.x,
                    position_y: n.position.y,
                    width: size,
                    height: size,
                };
            });

            return workflowApi.saveCanvas(id!, { steps, edges: edgeData, notes });
        },
        onSuccess: async () => {
            await new Promise((r) => setTimeout(r, 300));
            setHasUnsavedChanges(false);
            setLastSavedAt(new Date());
            queryClient.invalidateQueries({ queryKey: ["workflow", id] });
        },
        onError: () => toast.error("Failed to save workflow"),
    });

    // Keep saveRef pointed at the latest save function each render
    saveRef.current = () => saveMutation.mutate();

    // Execute workflow
    const doExecute = useCallback(
        async (input?: Record<string, any>) => {
            if (!id) return;
            setExecuteDialogOpen(false);
            setIsExecuting(true);
            resetWS();

            setNodes((nds) => nds.map((n) => ({ ...n, className: "" })));

            try {
                const result = await workflowApi.execute(id, input);
                setCurrentExecutionId(result.execution_id);
                toast.info("Workflow execution started");
            } catch {
                setIsExecuting(false);
                toast.error("Failed to start execution");
            }
        },
        [id, resetWS, setNodes],
    );

    const handleExecute = useCallback(() => {
        if (!id) return;

        // If workflow has input_schema, show dialog to collect input
        const schema = workflow?.input_schema;
        if (schema && typeof schema === "object" && Object.keys(schema).length > 0) {
            const defaults = treeToJson(schemaToTree(schema as Record<string, any>));
            setExecuteInputValue(defaults);
            setExecuteDialogOpen(true);
            return;
        }

        // No input schema — execute directly
        doExecute();
    }, [id, workflow, doExecute]);

    const handleExecuteWithInput = useCallback(() => {
        doExecute(executeInputValue ?? {});
    }, [executeInputValue, doExecute]);

    // Config panel handlers
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    const isSelectedNote = selectedNode?.type === "stickyNote";
    const selectedData = isSelectedNote ? undefined : (selectedNode?.data as StepNodeData | undefined);
    const selectedNoteData = isSelectedNote ? (selectedNode?.data as unknown as StickyNoteData) : undefined;

    const handleNoteContentChange = useCallback(
        (content: string) => {
            setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, content } } : n)));
            markDirty();
        },
        [selectedNodeId, setNodes, markDirty],
    );

    const handleNoteColorChange = useCallback(
        (color: string) => {
            setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, color } } : n)));
            markDirty();
        },
        [selectedNodeId, setNodes, markDirty],
    );

    const handleConfigChange = useCallback(
        (config: Record<string, any>) => {
            setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, config } } : n)));
            markDirty();
        },
        [selectedNodeId, setNodes, markDirty],
    );

    const handleNameChange = useCallback(
        (name: string) => {
            setNodes((nds) =>
                nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, label: name } } : n)),
            );
            markDirty();
        },
        [selectedNodeId, setNodes, markDirty],
    );

    const handleWaitForChange = useCallback(
        (waitForStepIds: string[]) => {
            setNodes((nds) =>
                nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, waitForStepIds } } : n)),
            );
            markDirty();
        },
        [selectedNodeId, setNodes, markDirty],
    );

    const handleBranchChange = useCallback(
        (waitForBranches: Record<string, "true" | "false">) => {
            setNodes((nds) =>
                nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, waitForBranches } } : n)),
            );
            markDirty();
        },
        [selectedNodeId, setNodes, markDirty],
    );

    // Only allow select and delete, not position changes
    const handleNodesChange = useCallback(
        (changes: any) => {
            onNodesChange(changes);
            const hasMoved = changes.some((c: any) => c.type === "position");
            const hasRemoved = changes.some((c: any) => c.type === "remove");
            if (hasMoved || hasRemoved) markDirty();
        },
        [onNodesChange, markDirty],
    );

    return (
        <StepNodesContext.Provider value={allStepNodes}>
            <WorkflowInputSchemaContext.Provider value={workflow?.input_schema}>
                <SecretKeysContext.Provider value={secretKeys}>
                    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                        <GuidedTour />
                        <div className="flex h-full flex-col">
                            <BuilderToolbar
                                workflowName={workflow?.name ?? "Loading..."}
                                onSave={() => saveMutation.mutate()}
                                onAddNote={handleAddNote}
                                onOpenSettings={() => setSettingsOpen(true)}
                                onOpenIO={() => setIOPanelOpen(true)}
                                onOpenAIChat={() => setAIChatOpen(true)}
                                onExecute={handleExecute}
                                isSaving={saveMutation.isPending}
                                isExecuting={isExecuting}
                                hasUnsavedChanges={hasUnsavedChanges}
                                lastSavedAt={lastSavedAt}
                                executionStatus={executionStatus}
                            />
                            <div className="flex min-h-0 flex-1 overflow-hidden">
                                <StepPalette />
                                <div ref={reactFlowWrapper} data-tour="canvas" className="flex-1">
                                    <ReactFlow
                                        nodes={nodes}
                                        edges={computedEdges}
                                        onNodesChange={handleNodesChange}
                                        onNodeClick={onNodeClick}
                                        onPaneClick={onPaneClick}
                                        nodeTypes={nodeTypes}
                                        edgeTypes={edgeTypes}
                                        defaultEdgeOptions={{ type: "labeled" }}
                                        nodesDraggable
                                        fitView
                                        proOptions={{ hideAttribution: true }}
                                        deleteKeyCode={["Backspace", "Delete"]}
                                        onNodesDelete={() => markDirty()}
                                    >
                                        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                                    </ReactFlow>
                                </div>
                                {selectedNoteData && selectedNodeId && (
                                    <NoteConfigPanel
                                        content={selectedNoteData.content}
                                        color={selectedNoteData.color}
                                        onContentChange={handleNoteContentChange}
                                        onColorChange={handleNoteColorChange}
                                        onClose={() => setSelectedNodeId(null)}
                                    />
                                )}
                                {selectedData && selectedNodeId && (
                                    <ConfigPanel
                                        stepName={selectedData.label}
                                        stepType={selectedData.stepType}
                                        config={selectedData.config ?? {}}
                                        currentNodeId={selectedNodeId}
                                        allStepNodes={allStepNodes}
                                        waitForStepIds={selectedData.waitForStepIds ?? []}
                                        waitForBranches={selectedData.waitForBranches ?? {}}
                                        stepResult={stepResults.get(selectedNodeId)}
                                        workflowInputSchema={workflow?.input_schema}
                                        onConfigChange={handleConfigChange}
                                        onNameChange={handleNameChange}
                                        onWaitForChange={handleWaitForChange}
                                        onBranchChange={handleBranchChange}
                                        onClose={() => setSelectedNodeId(null)}
                                    />
                                )}
                            </div>
                            <ExecutionDrawer
                                events={events}
                                stepResults={stepResults}
                                executionStatus={executionStatus}
                                executionError={executionError}
                                isExecuting={isExecuting}
                                stepInfoMap={stepInfoMap}
                                onStepClick={(stepId) => setSelectedNodeId(stepId)}
                                onDismiss={() => {
                                    resetWS();
                                    setCurrentExecutionId(null);
                                    setIsExecuting(false);
                                    setNodes((nds) => nds.map((n) => ({ ...n, className: "" })));
                                }}
                            />
                        </div>
                        <DragOverlay dropAnimation={null}>
                            {draggingStepType ? <DragPreview stepType={draggingStepType} /> : null}
                        </DragOverlay>
                    </DndContext>
                    <WorkflowSettingsSheet workflow={workflow} open={settingsOpen} onOpenChange={setSettingsOpen} />
                    <IOPanel workflow={workflow} open={ioPanelOpen} onOpenChange={setIOPanelOpen} />
                    <AIChatPanel
                        open={aiChatOpen}
                        onOpenChange={setAIChatOpen}
                        currentWorkflow={
                            stepInfoMap.size > 0
                                ? {
                                      steps: Array.from(stepInfoMap.values()).map((s) => ({
                                          name: s.name,
                                          step_type: s.stepType,
                                          config: s.config,
                                      })),
                                      edges: computedEdges.map((e) => {
                                          const sourceName = stepInfoMap.get(e.source)?.name ?? e.source;
                                          const targetName = stepInfoMap.get(e.target)?.name ?? e.target;
                                          return {
                                              source_step_name: sourceName,
                                              target_step_name: targetName,
                                              edge_type: "normal",
                                          };
                                      }),
                                  }
                                : undefined
                        }
                        onWorkflowGenerated={handleAIWorkflowGenerated}
                    />
                    <Dialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Workflow Input</DialogTitle>
                            </DialogHeader>
                            <p className="text-muted-foreground text-sm">
                                This workflow expects input data. Fill in the values below and click Run.
                            </p>
                            <div className="rounded-md border p-3">
                                <JsonBuilder
                                    value={executeInputValue}
                                    onChange={setExecuteInputValue}
                                    rules={RULES_JSON}
                                    emit="values"
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setExecuteDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    className="bg-green-600 text-white hover:bg-green-700"
                                    onClick={handleExecuteWithInput}
                                >
                                    Run
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </SecretKeysContext.Provider>
            </WorkflowInputSchemaContext.Provider>
        </StepNodesContext.Provider>
    );
}

export default function WorkflowBuilder() {
    return (
        <ReactFlowProvider>
            <WorkflowBuilderInner />
        </ReactFlowProvider>
    );
}
