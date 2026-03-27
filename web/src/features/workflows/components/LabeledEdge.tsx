import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { memo, useContext } from 'react';
import { ReadOnlyContext } from './StepNode';

interface LabeledEdgeData {
  edgeType?: string;
  sourceOutput?: string;
  sourceLabel?: string;
  sourceColor?: string;
  targetInput?: string;
}

/**
 * Dispatch a custom event to toggle a condition branch on an edge.
 * WorkflowBuilder listens for this and updates waitForBranches.
 */
function toggleBranch(sourceId: string, targetId: string, currentBranch: string) {
  const newBranch = currentBranch === 'true' ? 'false' : 'true';
  window.dispatchEvent(
    new CustomEvent('toggle-edge-branch', {
      detail: { sourceId, targetId, branch: newBranch },
    }),
  );
}

function LabeledEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
  data,
  style,
  markerEnd,
  sourceHandleId,
}: EdgeProps & { data?: LabeledEdgeData }) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const readOnly = useContext(ReadOnlyContext);
  const isError = data?.edgeType === 'error';
  const isReference = data?.edgeType === 'reference';
  const handleId = sourceHandleId ?? data?.sourceOutput;

  // Use data-driven label from the step type's outputs definition
  const label = data?.sourceLabel ?? '';
  const labelColor = data?.sourceColor;

  const edgeStyle = isError
    ? { stroke: '#ef4444', strokeDasharray: '5,5', ...style }
    : isReference
      ? {
          stroke: '#8b5cf6',
          strokeDasharray: '8,4',
          animation: 'march 0.6s linear infinite',
          ...style,
        }
      : { strokeDasharray: '8,4', animation: 'march 0.6s linear infinite', ...style };

  return (
    <>
      <BaseEdge path={edgePath} style={edgeStyle} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          {readOnly ? (
            <span
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                backgroundColor: labelColor ? `${labelColor}20` : undefined,
                color: labelColor ?? undefined,
              }}
              className="rounded-full border border-current/20 px-2 py-0.5 font-semibold text-[10px]"
            >
              {label}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => toggleBranch(source, target, handleId!)}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: 'all',
                backgroundColor: labelColor ? `${labelColor}20` : undefined,
                color: labelColor ?? undefined,
              }}
              className="cursor-pointer rounded-full border border-current/20 px-2 py-0.5 font-semibold text-[10px] transition-colors hover:opacity-80"
            >
              {label}
            </button>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const LabeledEdge = memo(LabeledEdgeComponent);
