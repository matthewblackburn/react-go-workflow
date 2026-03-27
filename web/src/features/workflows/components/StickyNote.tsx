import { type NodeProps, NodeResizer } from '@xyflow/react';
import { memo } from 'react';

export interface StickyNoteData {
  content: string;
  color: string;
}

export const colorBgs: Record<string, string> = {
  yellow: '#FEF3AC',
  blue: '#D0E8FF',
  green: '#D5F5E3',
  pink: '#FDCFE8',
};

const pinColors: Record<string, string> = {
  yellow: '#d97706',
  blue: '#2563eb',
  green: '#16a34a',
  pink: '#db2777',
};

function StickyNoteComponent({ data, selected }: NodeProps & { data: StickyNoteData }) {
  const bg = colorBgs[data.color] ?? colorBgs.yellow;
  const pinColor = pinColors[data.color] ?? pinColors.yellow;

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={100} minHeight={100} keepAspectRatio />
      <div
        className={selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: bg,
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Pin */}
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: pinColor,
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            zIndex: 1,
          }}
        />
        <div className="flex flex-col h-full p-3 pt-4">
          <p className="flex-1 whitespace-pre-wrap text-xs text-black">
            {data.content || 'Double-click to edit...'}
          </p>
        </div>
      </div>
    </>
  );
}

export const StickyNote = memo(StickyNoteComponent);
