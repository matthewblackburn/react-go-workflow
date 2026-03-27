import type { Node, Edge as RFEdge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { getLayoutedNodes } from '../autoLayout';

function makeStepNode(id: string, position = { x: 0, y: 0 }): Node {
  return {
    id,
    type: 'stepNode',
    position,
    data: { label: `Step ${id}` },
  };
}

function makeStickyNote(id: string, position = { x: 100, y: 200 }): Node {
  return {
    id,
    type: 'stickyNote',
    position,
    data: { label: `Note ${id}` },
  };
}

function makeEdge(source: string, target: string): RFEdge {
  return { id: `${source}-${target}`, source, target };
}

describe('getLayoutedNodes', () => {
  it('returns empty array for empty input', () => {
    const result = getLayoutedNodes([], []);
    expect(result).toEqual([]);
  });

  it('returns unchanged nodes when no step nodes exist', () => {
    const notes = [makeStickyNote('n1'), makeStickyNote('n2')];
    const result = getLayoutedNodes(notes, []);
    expect(result).toEqual(notes);
  });

  it('assigns a position to a single step node', () => {
    const nodes = [makeStepNode('a')];
    const result = getLayoutedNodes(nodes, []);
    expect(result).toHaveLength(1);
    expect(result[0].position).toBeDefined();
    expect(typeof result[0].position.x).toBe('number');
    expect(typeof result[0].position.y).toBe('number');
  });

  it('preserves sticky notes unchanged', () => {
    const sticky = makeStickyNote('n1', { x: 42, y: 99 });
    const nodes = [makeStepNode('a'), sticky];
    const result = getLayoutedNodes(nodes, []);
    const returnedSticky = result.find((n) => n.id === 'n1');
    expect(returnedSticky?.position).toEqual({ x: 42, y: 99 });
  });

  it('positions chain A->B->C with increasing x', () => {
    const nodes = [makeStepNode('a'), makeStepNode('b'), makeStepNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = getLayoutedNodes(nodes, edges);

    const posA = result.find((n) => n.id === 'a')!.position;
    const posB = result.find((n) => n.id === 'b')!.position;
    const posC = result.find((n) => n.id === 'c')!.position;

    expect(posA.x).toBeLessThan(posB.x);
    expect(posB.x).toBeLessThan(posC.x);
  });

  it('returns all input nodes (length preserved)', () => {
    const nodes = [makeStepNode('a'), makeStepNode('b'), makeStickyNote('n1')];
    const edges = [makeEdge('a', 'b')];
    const result = getLayoutedNodes(nodes, edges);
    expect(result).toHaveLength(3);
  });

  it('handles disconnected nodes with no edges', () => {
    const nodes = [makeStepNode('a'), makeStepNode('b'), makeStepNode('c')];
    const result = getLayoutedNodes(nodes, []);
    expect(result).toHaveLength(3);
    for (const node of result) {
      expect(node.position).toBeDefined();
    }
  });
});
