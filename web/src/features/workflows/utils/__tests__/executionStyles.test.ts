import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { applyExecutionStyles } from '../executionStyles';

function makeNode(id: string, type: string = 'stepNode'): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
  };
}

describe('applyExecutionStyles', () => {
  it('returns nodes unchanged when stepStatuses is empty', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const result = applyExecutionStyles(nodes, new Map());
    expect(result).toBe(nodes); // same reference
  });

  it('applies running style (blue outline)', () => {
    const nodes = [makeNode('a')];
    const statuses = new Map([['a', 'running']]);
    const result = applyExecutionStyles(nodes, statuses);
    expect(result[0].className).toContain('outline-blue-500');
  });

  it('applies completed style (green outline)', () => {
    const nodes = [makeNode('a')];
    const statuses = new Map([['a', 'completed']]);
    const result = applyExecutionStyles(nodes, statuses);
    expect(result[0].className).toContain('outline-green-500');
  });

  it('applies failed style (red outline)', () => {
    const nodes = [makeNode('a')];
    const statuses = new Map([['a', 'failed']]);
    const result = applyExecutionStyles(nodes, statuses);
    expect(result[0].className).toContain('outline-red-500');
  });

  it('applies empty string for pending status', () => {
    const nodes = [makeNode('a')];
    const statuses = new Map([['a', 'pending']]);
    const result = applyExecutionStyles(nodes, statuses);
    expect(result[0].className).toBe('');
  });

  it('leaves nodes unchanged for unknown status', () => {
    const nodes = [makeNode('a')];
    const statuses = new Map([['a', 'unknown_status']]);
    const result = applyExecutionStyles(nodes, statuses);
    expect(result[0].className).toBe('');
  });

  it('skips non-stepNode types', () => {
    const noteNode = makeNode('note1', 'stickyNote');
    const statuses = new Map([['note1', 'completed']]);
    const result = applyExecutionStyles([noteNode], statuses);
    expect(result[0]).toBe(noteNode); // unchanged, same reference
  });

  it('only styles nodes that have a status entry', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const statuses = new Map([['b', 'completed']]);
    const result = applyExecutionStyles(nodes, statuses);
    expect(result[0]).toBe(nodes[0]); // a: unchanged
    expect(result[1].className).toContain('outline-green-500'); // b: styled
    expect(result[2]).toBe(nodes[2]); // c: unchanged
  });
});
