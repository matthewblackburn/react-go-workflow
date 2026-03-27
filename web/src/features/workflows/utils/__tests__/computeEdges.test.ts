import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import type { StepNodeData } from '../../components/StepNode';
import { computeEdges, extractStepReferences } from '../computeEdges';

function makeNode(
  id: string,
  config: Record<string, unknown> = {},
  waitForStepIds: string[] = [],
): Node {
  return {
    id,
    type: 'stepNode',
    position: { x: 0, y: 0 },
    data: {
      label: `Step ${id}`,
      config,
      waitForStepIds,
    } satisfies StepNodeData,
  };
}

const emptyNames = new Map<string, string>();

describe('extractStepReferences', () => {
  it('extracts a single step reference by ID', () => {
    const refs = extractStepReferences(
      { url: '{{steps.abc.output}}' },
      new Set(['abc']),
      emptyNames,
    );
    expect(refs).toEqual(new Set(['abc']));
  });

  it('ignores references to non-existent nodes', () => {
    const refs = extractStepReferences(
      { url: '{{steps.missing.output}}' },
      new Set(['abc']),
      emptyNames,
    );
    expect(refs.size).toBe(0);
  });

  it('finds references in nested objects', () => {
    const refs = extractStepReferences(
      { headers: { auth: 'Bearer {{steps.abc.output.token}}' } },
      new Set(['abc']),
      emptyNames,
    );
    expect(refs).toEqual(new Set(['abc']));
  });

  it('extracts multiple distinct references', () => {
    const refs = extractStepReferences(
      { a: '{{steps.x.output}}', b: '{{steps.y.output}}' },
      new Set(['x', 'y']),
      emptyNames,
    );
    expect(refs).toEqual(new Set(['x', 'y']));
  });

  it('deduplicates references to the same step', () => {
    const refs = extractStepReferences(
      { a: '{{steps.x.output}}', b: 'prefix {{steps.x.result}} suffix' },
      new Set(['x']),
      emptyNames,
    );
    expect(refs).toEqual(new Set(['x']));
  });

  it('resolves step references by name', () => {
    const nameToId = new Map([['My Step', 'uuid-123']]);
    const refs = extractStepReferences(
      { url: '{{steps.My Step.output}}' },
      new Set(['uuid-123']),
      nameToId,
    );
    expect(refs).toEqual(new Set(['uuid-123']));
  });
});

describe('computeEdges', () => {
  it('returns empty array when nodes have no config and no waitFor', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    expect(computeEdges(nodes)).toEqual([]);
  });

  it('creates a reference edge from template ref in config', () => {
    const nodes = [makeNode('a'), makeNode('b', { url: '{{steps.a.output}}' })];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('a');
    expect(edges[0].target).toBe('b');
    expect((edges[0].data as any).edgeType).toBe('reference');
  });

  it('deduplicates multiple refs to the same step in config', () => {
    const nodes = [
      makeNode('a'),
      makeNode('b', { url: '{{steps.a.output}}', body: '{{steps.a.result}}' }),
    ];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(1);
  });

  it('creates edges to multiple different steps from config', () => {
    const nodes = [
      makeNode('a'),
      makeNode('b'),
      makeNode('c', { x: '{{steps.a.output}}', y: '{{steps.b.output}}' }),
    ];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(2);
    const sources = edges.map((e) => e.source).sort();
    expect(sources).toEqual(['a', 'b']);
  });

  it('creates dependency edges from waitForStepIds', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c', {}, ['a', 'b'])];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => (e.data as any).edgeType === 'dependency')).toBe(true);
  });

  it('deduplicates: wait-for edge wins when both ref and waitFor exist', () => {
    const nodes = [makeNode('a'), makeNode('b', { url: '{{steps.a.output}}' }, ['a'])];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(1);
    expect((edges[0].data as any).edgeType).toBe('dependency');
  });

  it('skips references to non-existent nodes', () => {
    const nodes = [makeNode('b', { url: '{{steps.missing.output}}' })];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(0);
  });

  it('skips self-references', () => {
    const nodes = [makeNode('a', { url: '{{steps.a.output}}' })];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(0);
  });

  it('finds references in nested config values', () => {
    const nodes = [
      makeNode('a'),
      makeNode('b', { headers: { Authorization: 'Bearer {{steps.a.output.token}}' } }),
    ];
    const edges = computeEdges(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('a');
    expect(edges[0].target).toBe('b');
  });
});
