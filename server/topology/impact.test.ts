import { describe, expect, it } from 'vitest';
import { downstreamImpact } from './impact.js';
import type { TopologyEdge, TopologyNode } from './types.js';

const edge = (from: string, to: string, inferred = false): TopologyEdge => ({ from, to, inferred, relation: 'hosts' });
function impact(edges: TopologyEdge[], ids = ['root', 'a', 'b', 'service', 'child']) {
  const nodes = new Map<string, TopologyNode>(ids.map(id => [id, { id, name: id, type: 'service', state: 'up', health: 'healthy', source: 'monitoring' }]));
  const outgoing = new Map<string, TopologyEdge[]>();
  for (const item of edges) outgoing.set(item.from, [...(outgoing.get(item.from) || []), item]);
  return downstreamImpact('root', nodes, outgoing);
}

describe('dependency impact paths', () => {
  it('prefers a confirmed path at equal distance and propagates it to descendants', () => {
    const edges = [edge('root', 'a', true), edge('root', 'b'), edge('a', 'service'), edge('b', 'service'), edge('service', 'child')];
    const result = impact(edges);
    expect(result.find(item => item.id === 'service')).toMatchObject({ path: ['root', 'b', 'service'], distance: 2, inferred: false });
    expect(result.find(item => item.id === 'child')).toMatchObject({ path: ['root', 'b', 'service', 'child'], inferred: false });
    expect(impact([...edges].reverse())).toEqual(result);
  });

  it('keeps the shortest path even when a longer path is confirmed', () => {
    expect(impact([edge('root', 'service', true), edge('root', 'a'), edge('a', 'service')]).find(item => item.id === 'service'))
      .toMatchObject({ distance: 1, path: ['root', 'service'], inferred: true });
  });

  it('uses stable IDs to break equally confirmed ties', () => {
    const edges = [edge('root', 'b'), edge('root', 'a'), edge('b', 'service'), edge('a', 'service')];
    expect(impact(edges).find(item => item.id === 'service')?.path).toEqual(['root', 'a', 'service']);
    expect(impact(edges)).toEqual(impact([...edges].reverse()));
  });

  it('handles cycles, self-links and duplicate edges without counting the root', () => {
    const result = impact([edge('root', 'root'), edge('root', 'a'), edge('root', 'a'), edge('a', 'b'), edge('b', 'a'), edge('b', 'root')]);
    expect(result.map(item => item.id)).toEqual(['a', 'b']);
    expect(result[1].path).toEqual(['root', 'a', 'b']);
  });

  it('does not traverse missing assets or invent an absent root', () => {
    expect(impact([edge('root', 'missing'), edge('missing', 'service')])).toEqual([]);
    expect(impact([edge('root', 'a')], ['a'])).toEqual([]);
  });

  it('preserves distinct assets with duplicate display names', () => {
    const nodes = new Map<string, TopologyNode>(['root', 'a', 'b'].map(id => [id, { id, name: 'Duplicate', type: 'vm', state: 'running', health: 'healthy', source: 'proxmox' }]));
    const result = downstreamImpact('root', nodes, new Map([['root', [edge('root', 'b'), edge('root', 'a')]]]));
    expect(result.map(item => item.id)).toEqual(['a', 'b']);
  });

  it('prefers a confirmed duplicate link regardless of discovery order', () => {
    const edges = [edge('root', 'service', true), edge('root', 'service')];
    expect(impact(edges)[0].inferred).toBe(false);
    expect(impact(edges)).toEqual(impact([...edges].reverse()));
  });
});
