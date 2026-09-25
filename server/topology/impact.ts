import type { TopologyEdge, TopologyImpactAsset, TopologyNode } from './types.js';

type Path = { id: string; distance: number; path: string[]; inferred: boolean };

function compare(a: Path, b: Path) {
  return a.distance - b.distance || Number(a.inferred) - Number(b.inferred) ||
    JSON.stringify(a.path).localeCompare(JSON.stringify(b.path));
}

/** Shortest directed paths; confirmed paths win ties, then stable asset IDs. */
export function downstreamImpact(rootNodeId: string, nodes: Map<string, TopologyNode>, outgoing: Map<string, TopologyEdge[]>): TopologyImpactAsset[] {
  if (!nodes.has(rootNodeId)) return [];
  const best = new Map<string, Path>();
  let frontier: Path[] = [{ id: rootNodeId, distance: 0, path: [rootNodeId], inferred: false }];
  best.set(rootNodeId, frontier[0]);

  // Complete each breadth-first layer before expanding it. A confirmed tie can
  // replace an inferred path before any descendants inherit its provenance.
  while (frontier.length) {
    const next = new Map<string, Path>();
    for (const current of frontier) {
      for (const edge of outgoing.get(current.id) || []) {
        if (edge.from !== current.id || !nodes.has(edge.to) || best.has(edge.to)) continue;
        const candidate: Path = {
          id: edge.to, distance: current.distance + 1,
          path: [...current.path, edge.to], inferred: current.inferred || edge.inferred,
        };
        const previous = next.get(edge.to);
        if (!previous || compare(candidate, previous) < 0) next.set(edge.to, candidate);
      }
    }
    frontier = [...next.values()];
    for (const path of frontier) best.set(path.id, path);
  }

  best.delete(rootNodeId);
  return [...best.values()].map(path => {
    const node = nodes.get(path.id)!;
    return { ...path, type: node.type, name: node.name, state: node.state, health: node.health };
  }).sort((a, b) => a.distance - b.distance || a.type.localeCompare(b.type) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
