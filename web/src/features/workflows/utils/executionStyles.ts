import type { Node } from '@xyflow/react';

const statusStyles: Record<string, string> = {
  running:
    'outline outline-2 outline-offset-2 outline-blue-500 rounded-lg',
  completed: 'outline outline-2 outline-offset-2 outline-green-500 rounded-lg',
  failed: 'outline outline-2 outline-offset-2 outline-red-500 rounded-lg',
  skipped: 'opacity-40 rounded-lg',
  pending: '',
};

/**
 * Applies execution status styling (outline colors) to step nodes.
 * Pure function — returns a new array of nodes with updated classNames.
 */
export function applyExecutionStyles(nodes: Node[], stepStatuses: Map<string, string>): Node[] {
  if (stepStatuses.size === 0) return nodes;

  return nodes.map((n) => {
    if (n.type !== 'stepNode') return n;
    const status = stepStatuses.get(n.id);
    if (!status) return n;
    return {
      ...n,
      className: statusStyles[status] ?? '',
    };
  });
}
