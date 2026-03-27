import {
  Background,
  BackgroundVariant,
  type Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge as RFEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';
import type { Workflow, WorkflowEdge, WorkflowStep } from '@/types/workflow';
import { getLayoutedNodes } from '../utils/autoLayout';
import { computeEdges, extractStepReferences } from '../utils/computeEdges';
import { applyExecutionStyles } from '../utils/executionStyles';
import { LabeledEdge } from './LabeledEdge';
import { ReadOnlyContext, StepNode, type StepNodeData } from './StepNode';


const nodeTypes = { stepNode: StepNode };
const edgeTypes = { labeled: LabeledEdge };

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

interface ExecutionCanvasProps {
  workflow: Workflow;
  stepStatuses: Map<string, string>;
  onNodeClick?: (stepId: string) => void;
  onPaneClick?: () => void;
}

function ExecutionCanvasInner({ workflow, stepStatuses, onNodeClick, onPaneClick }: ExecutionCanvasProps) {
  // Build nodes and edges from workflow data, layout synchronously (like WorkflowBuilder)
  const { initialNodes, initialEdges } = useMemo(() => {
    const steps = (workflow.edges?.steps ?? []) as WorkflowStep[];
    const stepTypeMap = new Map(
      steps.filter((s) => s.edges?.step_type).map((s) => [s.step_type_id, s.edges!.step_type!]),
    );

    const allStepIds = new Set(steps.map((s) => s.id));
    const stepNameToId = new Map(steps.map((s) => [s.name, s.id]));

    const configRefsMap = new Map<string, Set<string>>();
    for (const step of steps) {
      const refs = extractStepReferences(step.config ?? {}, allStepIds, stepNameToId);
      configRefsMap.set(step.id, refs);
    }

    const waitForMap = new Map<string, string[]>();
    const branchMap = new Map<string, Record<string, 'true' | 'false'>>();
    for (const edge of (workflow.edges?.edges ?? []) as WorkflowEdge[]) {
      const configRefs = configRefsMap.get(edge.target_step_id);
      const isCoveredByTemplate = configRefs?.has(edge.source_step_id) ?? false;

      if (!isCoveredByTemplate) {
        const existing = waitForMap.get(edge.target_step_id) ?? [];
        existing.push(edge.source_step_id);
        waitForMap.set(edge.target_step_id, existing);
      }

      if (edge.source_output === 'true' || edge.source_output === 'false') {
        const branches = branchMap.get(edge.target_step_id) ?? {};
        branches[edge.source_step_id] = edge.source_output;
        branchMap.set(edge.target_step_id, branches);
      }
    }

    const stepNodes: Node[] = steps.map((step) =>
      makeStepNode(
        step.id,
        { x: step.position_x, y: step.position_y },
        {
          label: step.name,
          description: step.description,
          stepType: step.edges?.step_type ?? stepTypeMap.get(step.step_type_id),
          config: step.config ?? {},
          waitForStepIds: waitForMap.get(step.id) ?? [],
          waitForBranches: branchMap.get(step.id) ?? {},
        },
      ),
    );

    const edges = computeEdges(stepNodes);
    const layouted = getLayoutedNodes(stepNodes, edges);

    return { initialNodes: layouted, initialEdges: edges };
  }, [workflow]);

  const [nodes] = useState<Node[]>(initialNodes);
  const [edges] = useState<RFEdge[]>(initialEdges);

  // Apply execution status styles
  const styledNodes = useMemo(
    () => applyExecutionStyles(nodes, stepStatuses),
    [nodes, stepStatuses],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'stepNode' && onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick],
  );

  return (
    <ReadOnlyContext.Provider value={true}>
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>
    </ReadOnlyContext.Provider>
  );
}

export function ExecutionCanvas(props: ExecutionCanvasProps) {
  return (
    <ReactFlowProvider>
      <ExecutionCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
