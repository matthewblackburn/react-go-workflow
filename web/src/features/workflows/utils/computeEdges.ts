import type { Node, Edge as RFEdge } from '@xyflow/react';
import type { StepNodeData } from '../components/StepNode';

const STEP_REF_REGEX = /\{\{steps\.([^.}]+)\.[^}]*\}\}/g;

/**
 * Recursively extract all step IDs referenced via {{steps.<ref>.<path>}} in config values.
 * <ref> can be a node ID (UUID) or a step name (label). Both are resolved to node IDs.
 * Only returns IDs that exist in the graph.
 */
export function extractStepReferences(
  config: Record<string, unknown>,
  existingNodeIds: Set<string>,
  nameToId: Map<string, string>,
): Set<string> {
  const refs = new Set<string>();

  function walk(value: unknown) {
    if (typeof value === 'string') {
      for (const match of value.matchAll(STEP_REF_REGEX)) {
        const ref = match[1];
        // Try as ID first, then as name
        if (existingNodeIds.has(ref)) {
          refs.add(ref);
        } else {
          const resolved = nameToId.get(ref);
          if (resolved) refs.add(resolved);
        }
      }
    } else if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) {
        walk(v);
      }
    }
  }

  walk(config);
  return refs;
}

/**
 * Derive edges from step node data:
 * 1. Template references in config fields ({{steps.<id>.<path>}}) → "reference" edges
 * 2. Explicit waitForStepIds → "dependency" edges
 *
 * For condition step sources, uses waitForBranches to set the correct sourceHandle
 * ('true'/'false') so edges connect to the Yes/No handles and labels render.
 *
 * Deduplicates: same source+target pair keeps "reference" over "dependency".
 * Skips self-references and references to non-existent nodes.
 */
export function computeEdges(stepNodes: Node[]): RFEdge[] {
  const nodeIds = new Set(stepNodes.map((n) => n.id));

  // Build lookups
  const branchingNodes = new Set<string>(); // nodes with multiple named outputs
  const nameToId = new Map<string, string>();
  const nodeOutputs = new Map<string, { name: string; label: string; color?: string }[]>();
  for (const node of stepNodes) {
    const data = node.data as unknown as StepNodeData;
    nameToId.set(data.label, node.id);
    const outputs = data.stepType?.config_schema?.outputs as
      | { name: string; label: string; color?: string }[]
      | undefined;
    if (outputs && outputs.length > 1) {
      branchingNodes.add(node.id);
      nodeOutputs.set(node.id, outputs);
    }
  }

  // Track edges by "source->target" key. Explicit wait-for wins over template reference.
  const edgeMap = new Map<string, RFEdge>();

  function getOutputInfo(sourceId: string, branch?: string) {
    if (!branch) return {};
    const outputs = nodeOutputs.get(sourceId);
    const output = outputs?.find((o) => o.name === branch);
    return output ? { sourceLabel: output.label, sourceColor: output.color } : {};
  }

  for (const node of stepNodes) {
    const data = node.data as unknown as StepNodeData;
    const branches = data.waitForBranches ?? {};

    // 1. Wait-for dependencies (processed first — take priority)
    for (const sourceId of data.waitForStepIds ?? []) {
      if (sourceId === node.id) continue;
      if (!nodeIds.has(sourceId)) continue;
      const key = `${sourceId}->${node.id}`;
      const branch = branchingNodes.has(sourceId)
        ? (branches[sourceId] ?? nodeOutputs.get(sourceId)?.[0]?.name)
        : undefined;
      edgeMap.set(key, {
        id: `dep:${key}`,
        source: sourceId,
        sourceHandle: branch,
        target: node.id,
        type: 'labeled',
        data: { edgeType: 'dependency', sourceOutput: branch, ...getOutputInfo(sourceId, branch) },
      });
    }

    // 2. Template references from config (only if no explicit wait-for edge exists)
    const templateRefs = extractStepReferences(data.config ?? {}, nodeIds, nameToId);
    for (const sourceId of templateRefs) {
      if (sourceId === node.id) continue;
      const key = `${sourceId}->${node.id}`;
      if (edgeMap.has(key)) continue;
      const branch = branchingNodes.has(sourceId)
        ? (branches[sourceId] ?? nodeOutputs.get(sourceId)?.[0]?.name)
        : undefined;
      edgeMap.set(key, {
        id: `ref:${key}`,
        source: sourceId,
        sourceHandle: branch,
        target: node.id,
        type: 'labeled',
        data: { edgeType: 'reference', sourceOutput: branch, ...getOutputInfo(sourceId, branch) },
      });
    }
  }

  // Remove transitive edges: if source is already an ancestor of target
  // through other edges, the direct edge is redundant.
  const allEdges = Array.from(edgeMap.values());

  // Build adjacency from current edges: parent → children
  const children = new Map<string, Set<string>>();
  for (const edge of allEdges) {
    if (!children.has(edge.source)) children.set(edge.source, new Set());
    children.get(edge.source)!.add(edge.target);
  }

  // Check if `ancestor` can reach `target` without the direct edge
  function hasIndirectPath(ancestor: string, target: string): boolean {
    const visited = new Set<string>();
    const queue = [...(children.get(ancestor) ?? [])].filter((c) => c !== target);
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const child of children.get(current) ?? []) {
        queue.push(child);
      }
    }
    return false;
  }

  return allEdges.filter((edge) => !hasIndirectPath(edge.source, edge.target));
}
