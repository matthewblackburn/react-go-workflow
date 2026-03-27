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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as LucideIcons from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { secretApi } from '@/api/secrets';
import { workflowApi } from '@/api/workflows';
import { useExecutionWS } from '@/hooks/useExecutionWS';
import type { CanvasNote, StepType, WorkflowEdge, WorkflowStep } from '@/types/workflow';
import { BuilderToolbar } from '../components/BuilderToolbar';
import { ConfigPanel } from '../components/ConfigPanel';
import { NoteConfigPanel } from '../components/NoteConfigPanel';
import { ExecutionDrawer } from '../components/ExecutionDrawer';
import { GuidedTour } from '../components/GuidedTour';
import { LabeledEdge } from '../components/LabeledEdge';
import {
  StepNode,
  type StepNodeData,
  SecretKeysContext,
  StepNodesContext,
  WorkflowInputSchemaContext,
} from '../components/StepNode';
import { StepPalette } from '../components/StepPalette';
import { StickyNote, type StickyNoteData } from '../components/StickyNote';
import { WorkflowSettingsSheet } from '../components/WorkflowSettingsSheet';
import { getLayoutedNodes } from '../utils/autoLayout';
import { computeEdges, extractStepReferences } from '../utils/computeEdges';
import { applyExecutionStyles } from '../utils/executionStyles';

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
  trigger: 'border-purple-400 bg-purple-50 dark:bg-purple-950',
  action: 'border-blue-400 bg-blue-50 dark:bg-blue-950',
  logic: 'border-amber-400 bg-amber-50 dark:bg-amber-950',
  utility: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950',
};

function getIcon(iconName?: string): React.ComponentType<{ className?: string }> {
  if (!iconName) return LucideIcons.Box;
  const pascalName = iconName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  const icon = (LucideIcons as Record<string, any>)[pascalName];
  return (icon as React.ComponentType<{ className?: string }>) ?? LucideIcons.Box;
}

function DragPreview({ stepType }: { stepType: StepType }) {
  const colorClass = dragPreviewColors[stepType.category] ?? dragPreviewColors.action;
  const Icon = getIcon(stepType.icon);
  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 shadow-lg opacity-90 min-w-[180px] ${colorClass}`}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-background/60 p-1.5">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-medium">{stepType.display_name}</p>
      </div>
    </div>
  );
}

function makeStepNode(id: string, position: { x: number; y: number }, data: StepNodeData): Node {
  return {
    id,
    type: 'stepNode',
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
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // WebSocket for live execution updates
  const {
    events,
    stepStatuses,
    stepResults,
    executionStatus,
    reset: resetWS,
  } = useExecutionWS(currentExecutionId);

  // Update node styles based on execution status
  useEffect(() => {
    if (stepStatuses.size === 0) return;
    setNodes((nds) => applyExecutionStyles(nds, stepStatuses));
  }, [stepStatuses, setNodes]);

  // Clear execution styling when execution completes
  useEffect(() => {
    if (executionStatus === 'completed' || executionStatus === 'failed') {
      setIsExecuting(false);
      if (executionStatus === 'completed') {
        toast.success('Workflow completed successfully');
      } else {
        toast.error('Workflow execution failed');
      }
    }
  }, [executionStatus]);

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
      setHasUnsavedChanges(true);
    };
    window.addEventListener('toggle-edge-branch', handler);
    return () => window.removeEventListener('toggle-edge-branch', handler);
  }, [setNodes]);

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
      setHasUnsavedChanges(true);
    };
    window.addEventListener('node-quick-edit', handler);
    return () => window.removeEventListener('node-quick-edit', handler);
  }, [setNodes]);



  // Map step type IDs to StepType objects
  const stepTypeMapRef = useRef<Map<string, StepType>>(new Map());
  const initializedRef = useRef(false);
  const prevEdgeKeyRef = useRef('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { fitView } = useReactFlow();

  // Load workflow
  const { data: workflow } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowApi.get(id!),
    enabled: !!id,
  });

  // Load step types
  const { data: stepTypesData } = useQuery({
    queryKey: ['step-types'],
    queryFn: async () => {
      const res = await (await fetch('/v1/step-types')).json();
      return res as { data: StepType[] };
    },
  });

  // Load secret keys for @mention autocomplete
  const { data: secretsData } = useQuery({
    queryKey: ['secret-keys'],
    queryFn: () => secretApi.list({ limit: 100 }),
  });
  const secretKeys = useMemo(
    () => (secretsData?.data ?? []).map((s) => s.key),
    [secretsData],
  );

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
    const branchMap = new Map<string, Record<string, 'true' | 'false'>>();
    for (const edge of (workflow.edges.edges ?? []) as WorkflowEdge[]) {
      const configRefs = configRefsMap.get(edge.target_step_id);
      const isCoveredByTemplate = configRefs?.has(edge.source_step_id) ?? false;

      if (!isCoveredByTemplate) {
        const existing = waitForMap.get(edge.target_step_id) ?? [];
        existing.push(edge.source_step_id);
        waitForMap.set(edge.target_step_id, existing);
      }

      // Always preserve branch info (needed for both template and wait-for edges)
      if (edge.source_output === 'true' || edge.source_output === 'false') {
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
        type: 'stickyNote',
        position: { x: note.position_x, y: note.position_y },
        style: { width: size, height: size },
        width: size,
        height: size,
        data: { content: note.content ?? '', color: note.color } satisfies StickyNoteData,
      };
    });

    // Auto-layout on load — also set initial edge key so the effect doesn't re-run
    const edges = computeEdges(initialNodes);
    const layouted = getLayoutedNodes(initialNodes, edges);
    setNodes([...layouted, ...noteNodes]);
    prevEdgeKeyRef.current = edges
      .map((e) => `${e.source}:${e.sourceHandle ?? ''}->${e.target}`)
      .join(',');
  }, [workflow, stepTypesData, setNodes]);

  // Derive edges from node configs and waitForStepIds
  const computedEdges: RFEdge[] = useMemo(() => {
    return computeEdges(nodes.filter((n) => n.type === 'stepNode'));
  }, [nodes]);

  // Auto-layout whenever edges change or node measurements become available
  const prevLayoutKeyRef = useRef('');
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    const stepNodes = nodes.filter((n) => n.type === 'stepNode');
    if (stepNodes.length === 0) return;

    const edgeKey = computedEdges
      .map((e) => `${e.source}:${e.sourceHandle ?? ''}->${e.target}`)
      .join(',');

    const measureKey = stepNodes
      .map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`)
      .join(',');

    const layoutKey = `${edgeKey}|${measureKey}`;
    if (layoutKey === prevLayoutKeyRef.current) return;
    prevLayoutKeyRef.current = layoutKey;
    prevEdgeKeyRef.current = edgeKey;

    const otherNodes = nodes.filter((n) => n.type !== 'stepNode');
    const layouted = getLayoutedNodes(stepNodes, computedEdges);
    setNodes([...layouted, ...otherNodes]);

    // Only fitView on initial load, not on subsequent changes
    if (!initialFitDoneRef.current) {
      initialFitDoneRef.current = true;
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    }
  }, [computedEdges, nodes, setNodes, fitView]);

  // Step nodes list for config panel / step pickers
  const allStepNodes = useMemo(() => {
    return nodes
      .filter((n) => n.type === 'stepNode')
      .map((n) => {
        const d = n.data as unknown as StepNodeData;
        return {
          id: n.id,
          label: d.label,
          isCondition: ((d.stepType?.config_schema?.outputs as any[])?.length ?? 0) > 1,
          outputSchema: d.stepType?.output_schema,
        };
      });
  }, [nodes]);

  // Select node
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'stepNode' || node.type === 'stickyNote') {
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
      const stepNodes = nodes.filter((n) => n.type === 'stepNode');
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
      setHasUnsavedChanges(true);
      setDraggingStepType(null);
    },
    [setNodes, nodes],
  );

  // Add sticky note
  const handleAddNote = useCallback(() => {
    const newNode: Node = {
      id: crypto.randomUUID(),
      type: 'stickyNote',
      position: { x: 200, y: 200 },
      style: { width: 200, height: 200 },
      data: { content: '', color: 'yellow' } satisfies StickyNoteData,
    };
    setNodes((nds) => [...nds, newNode]);
    setHasUnsavedChanges(true);
  }, [setNodes]);

  // Manual auto layout button
  const handleAutoLayout = useCallback(() => {
    const stepNodes = nodes.filter((n) => n.type === 'stepNode');
    const otherNodes = nodes.filter((n) => n.type !== 'stepNode');
    const layouted = getLayoutedNodes(stepNodes, computedEdges);
    setNodes([...layouted, ...otherNodes]);
    setHasUnsavedChanges(true);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [nodes, computedEdges, setNodes, fitView]);

  // Save canvas
  const saveMutation = useMutation({
    mutationFn: () => {
      const stepNodes = nodes.filter((n) => n.type === 'stepNode');
      const noteNodes = nodes.filter((n) => n.type === 'stickyNote');

      const steps = stepNodes.map((n) => {
        const data = n.data as unknown as StepNodeData;
        return {
          id: n.id,
          step_type_id: data.stepType?.id ?? '',
          name: data.label,
          description: data.description ?? '',
          config: data.config ?? {},
          position_x: n.position.x,
          position_y: n.position.y,
          input_mapping: {},
          timeout_seconds: 30,
          retry_count: 0,
          retry_backoff: 'none' as const,
          retry_delay_ms: 1000,
        };
      });

      const edgeData = computedEdges.map((e) => ({
        id: crypto.randomUUID(),
        source_step_id: e.source,
        target_step_id: e.target,
        source_output: e.sourceHandle ?? '',
        target_input: '',
        edge_type: 'normal' as const,
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
    onSuccess: () => {
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['workflow', id] });
      toast.success('Workflow saved');
    },
    onError: () => toast.error('Failed to save workflow'),
  });

  // Execute workflow
  const handleExecute = useCallback(async () => {
    if (!id) return;
    setIsExecuting(true);
    resetWS();

    // Clear previous execution styling
    setNodes((nds) => nds.map((n) => ({ ...n, className: '' })));

    try {
      const result = await workflowApi.execute(id);
      setCurrentExecutionId(result.execution_id);
      toast.info('Workflow execution started');
    } catch {
      setIsExecuting(false);
      toast.error('Failed to start execution');
    }
  }, [id, resetWS, setNodes]);

  // Config panel handlers
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const isSelectedNote = selectedNode?.type === 'stickyNote';
  const selectedData = isSelectedNote ? undefined : (selectedNode?.data as StepNodeData | undefined);
  const selectedNoteData = isSelectedNote ? (selectedNode?.data as unknown as StickyNoteData) : undefined;

  const handleNoteContentChange = useCallback(
    (content: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, content } } : n,
        ),
      );
      setHasUnsavedChanges(true);
    },
    [selectedNodeId, setNodes],
  );

  const handleNoteColorChange = useCallback(
    (color: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, color } } : n,
        ),
      );
      setHasUnsavedChanges(true);
    },
    [selectedNodeId, setNodes],
  );

  const handleConfigChange = useCallback(
    (config: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, config } } : n)),
      );
      setHasUnsavedChanges(true);
    },
    [selectedNodeId, setNodes],
  );

  const handleNameChange = useCallback(
    (name: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, label: name } } : n)),
      );
      setHasUnsavedChanges(true);
    },
    [selectedNodeId, setNodes],
  );

  const handleWaitForChange = useCallback(
    (waitForStepIds: string[]) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, waitForStepIds } } : n,
        ),
      );
      setHasUnsavedChanges(true);
    },
    [selectedNodeId, setNodes],
  );

  const handleBranchChange = useCallback(
    (waitForBranches: Record<string, 'true' | 'false'>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, waitForBranches } } : n,
        ),
      );
      setHasUnsavedChanges(true);
    },
    [selectedNodeId, setNodes],
  );

  // Only allow select and delete, not position changes
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      const hasMoved = changes.some((c: any) => c.type === 'position');
      const hasRemoved = changes.some((c: any) => c.type === 'remove');
      if (hasMoved || hasRemoved) setHasUnsavedChanges(true);
    },
    [onNodesChange],
  );

  return (
    <StepNodesContext.Provider value={allStepNodes}>
      <WorkflowInputSchemaContext.Provider value={workflow?.input_schema}>
        <SecretKeysContext.Provider value={secretKeys}>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <GuidedTour />
          <div className="flex h-full flex-col">
            <BuilderToolbar
              workflowName={workflow?.name ?? 'Loading...'}
              onSave={() => saveMutation.mutate()}
              onAddNote={handleAddNote}
              onAutoLayout={handleAutoLayout}
              onOpenSettings={() => setSettingsOpen(true)}
              onExecute={handleExecute}
              isSaving={saveMutation.isPending}
              isExecuting={isExecuting}
              hasUnsavedChanges={hasUnsavedChanges}
              executionStatus={executionStatus}
            />
            <div className="flex flex-1 min-h-0 overflow-hidden">
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
                  defaultEdgeOptions={{ type: 'labeled' }}
                  nodesDraggable
                  fitView
                  proOptions={{ hideAttribution: true }}
                  deleteKeyCode={['Backspace', 'Delete']}
                  onNodesDelete={() => setHasUnsavedChanges(true)}
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
              isExecuting={isExecuting}
              onStepClick={(stepId) => setSelectedNodeId(stepId)}
              onDismiss={() => {
                resetWS();
                setCurrentExecutionId(null);
                setIsExecuting(false);
                setNodes((nds) => nds.map((n) => ({ ...n, className: '' })));
              }}
            />
          </div>
          <DragOverlay dropAnimation={null}>
            {draggingStepType ? <DragPreview stepType={draggingStepType} /> : null}
          </DragOverlay>
        </DndContext>
        <WorkflowSettingsSheet
          workflow={workflow}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
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
