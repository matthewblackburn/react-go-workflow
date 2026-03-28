import dagre from '@dagrejs/dagre';
import { type Node, Position, type Edge as RFEdge } from '@xyflow/react';

const STEP_NODE_WIDTH = 260;
const STEP_NODE_HEIGHT = 100;
const NODE_GAP = 40;

function getNodeHeight(node: Node): number {
  return node.measured?.height ?? STEP_NODE_HEIGHT;
}

/**
 * Run dagre horizontal (LR) layout on step nodes.
 * Sticky notes are excluded from the layout and returned unchanged.
 *
 * After dagre positions nodes, we restack each rank (column) with
 * consistent gaps, then reorder condition branches (Yes above No).
 */
export function getLayoutedNodes(nodes: Node[], edges: RFEdge[]): Node[] {
  const stepNodes = nodes.filter((n) => n.type === 'stepNode');
  const otherNodes = nodes.filter((n) => n.type !== 'stepNode');

  if (stepNodes.length === 0) return nodes;

  const nodeMap = new Map(stepNodes.map((n) => [n.id, n]));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 140 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of stepNodes) {
    g.setNode(node.id, { width: STEP_NODE_WIDTH, height: getNodeHeight(node) });
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  // Get dagre positions (center-based) and ranks
  const dagreNodes = new Map<string, { x: number; y: number; rank: number }>();
  for (const node of stepNodes) {
    const pos = g.node(node.id);
    dagreNodes.set(node.id, { x: pos.x, y: pos.y, rank: pos.rank ?? 0 });
  }

  // Group nodes by rank (column)
  const ranks = new Map<number, string[]>();
  for (const [id, info] of dagreNodes) {
    const r = info.rank;
    if (!ranks.has(r)) ranks.set(r, []);
    ranks.get(r)!.push(id);
  }

  // Build condition branch info and error-path tracking
  const conditionChildren = new Map<string, { yes: Set<string>; no: Set<string> }>();
  const errorTargets = new Set<string>();
  for (const edge of edges) {
    const handle = edge.sourceHandle ?? (edge.data as any)?.sourceOutput;
    if (handle === 'true' || handle === 'false') {
      const group = conditionChildren.get(edge.source) ?? { yes: new Set(), no: new Set() };
      if (handle === 'true') group.yes.add(edge.target);
      else group.no.add(edge.target);
      conditionChildren.set(edge.source, group);
    }
    if ((edge.data as any)?.edgeType === 'error') {
      errorTargets.add(edge.target);
    }
  }

  // For each rank, sort nodes: Yes-branch first, normal, No-branch, error-path last
  const rankData = new Map<number, { ids: string[]; totalHeight: number }>();

  for (const [r, ids] of ranks) {
    ids.sort((a, b) => {
      const aIsYes = [...conditionChildren.values()].some((g) => g.yes.has(a));
      const aIsNo = [...conditionChildren.values()].some((g) => g.no.has(a));
      const aIsError = errorTargets.has(a);
      const bIsYes = [...conditionChildren.values()].some((g) => g.yes.has(b));
      const bIsNo = [...conditionChildren.values()].some((g) => g.no.has(b));
      const bIsError = errorTargets.has(b);

      const aOrder = aIsYes ? 0 : aIsError ? 3 : aIsNo ? 2 : 1;
      const bOrder = bIsYes ? 0 : bIsError ? 3 : bIsNo ? 2 : 1;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return dagreNodes.get(a)!.y - dagreNodes.get(b)!.y;
    });

    const totalHeight =
      ids.reduce((sum, id) => sum + getNodeHeight(nodeMap.get(id)!), 0) +
      (ids.length - 1) * NODE_GAP;

    rankData.set(r, { ids, totalHeight });
  }

  // Find the global vertical midpoint — use the tallest rank's center
  const maxTotalHeight = Math.max(...[...rankData.values()].map((d) => d.totalHeight));
  const globalCenterY = maxTotalHeight / 2;

  // Second pass: position each rank centered around the global midpoint
  const positions = new Map<string, { x: number; y: number }>();

  for (const [, { ids, totalHeight }] of rankData) {
    let currentY = globalCenterY - totalHeight / 2;

    for (const id of ids) {
      const node = nodeMap.get(id)!;
      const h = getNodeHeight(node);
      positions.set(id, {
        x: dagreNodes.get(id)!.x - STEP_NODE_WIDTH / 2,
        y: currentY,
      });
      currentY += h + NODE_GAP;
    }
  }

  const layoutedSteps = stepNodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));

  return [...layoutedSteps, ...otherNodes];
}
