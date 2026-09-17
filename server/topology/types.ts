import type { AlertSeverity, DependencyMapping, Incident } from '../monitoring/types.js';

export type TopologyNodeType = 'node' | 'vm' | 'lxc' | 'docker-host' | 'application' | 'container' | 'service' | 'switch' | 'router' | 'storage-appliance' | 'network-interface';
export type TopologyHealth = 'healthy' | 'warning' | 'critical' | 'unknown';
export type TopologyNode = { id: string; type: TopologyNodeType; name: string; state: string; health: TopologyHealth; source: 'proxmox' | 'docker' | 'monitoring' | 'hardware' | 'network'; detail?: string };
export type TopologyEdge = { from: string; to: string; relation: 'contains' | 'hosts' | 'runs' | 'monitors' | 'connected_to'; inferred: boolean };
export type CorrelationGroup = {
  id: string;
  rootNodeId: string;
  title: string;
  explanation: string;
  confidence: number;
  severity: AlertSeverity;
  incidentIds: string[];
  affectedServices: string[];
  evidence: string[];
};
export type TopologySnapshot = {
  collectedAt: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  correlations: CorrelationGroup[];
  mappings: DependencyMapping[];
  summary: { nodes: number; relationships: number; services: number; unhealthyDependencies: number; correlatedGroups: number; unmappedServices: number };
};
export type CorrelationInput = { incidents: Incident[]; mappings: DependencyMapping[] };
