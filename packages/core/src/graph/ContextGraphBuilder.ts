import {
  SystemContextGraph,
  GraphNode,
  GraphEdge,
  ServiceContext,
  DatabaseNodeData,
} from '../models/types';

/**
 * Builds and maintains the System Context Graph from ServiceContexts.
 */
export class ContextGraphBuilder {
  /**
   * Build a complete system graph from all service contexts.
   */
  build(services: ServiceContext[]): SystemContextGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const dbNodes = new Map<string, GraphNode>();

    // Create service nodes
    for (const svc of services) {
      nodes.push({
        id: svc.identity.serviceId,
        type: 'SERVICE',
        label: svc.identity.name,
        data: svc,
      });

      // Create database nodes for each table group
      const dbNames = this.inferDatabaseNames(svc);
      for (const dbName of dbNames) {
        if (!dbNodes.has(dbName)) {
          const dbNodeData: DatabaseNodeData = {
            name: dbName,
            tables: svc.database,
            ownerServiceId: svc.identity.serviceId,
          };
          const dbNode: GraphNode = {
            id: `db:${dbName}`,
            type: 'DATABASE',
            label: dbName,
            data: dbNodeData,
          };
          dbNodes.set(dbName, dbNode);
        }

        // Add Service → Database edge
        edges.push({
          id: `${svc.identity.serviceId}->db:${dbName}`,
          type: 'SERVICE_USES_DATABASE',
          source: svc.identity.serviceId,
          target: `db:${dbName}`,
          label: 'uses',
        });
      }
    }

    // Add database nodes to main nodes array
    nodes.push(...dbNodes.values());

    // Create service → service dependency edges
    for (const svc of services) {
      for (const dep of svc.dependencies) {
        // Find target service node
        const targetId = this.resolveServiceId(dep.targetService, services);
        if (targetId) {
          const edgeId = `${svc.identity.serviceId}->${targetId}`;
          // Avoid duplicate edges
          if (!edges.find(e => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              type: 'SERVICE_DEPENDS_ON_SERVICE',
              source: svc.identity.serviceId,
              target: targetId,
              label: 'depends on',
            });
          }
        }
      }
    }

    return {
      nodes,
      edges,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Apply impact highlighting to graph nodes.
   */
  applyImpact(
    graph: SystemContextGraph,
    impacts: Array<{ component: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string }>
  ): SystemContextGraph {
    const updatedNodes = graph.nodes.map(node => {
      const impact = impacts.find(
        i =>
          i.component.toLowerCase().includes(node.label.toLowerCase()) ||
          node.label.toLowerCase().includes(i.component.toLowerCase()) ||
          node.id.toLowerCase().includes(i.component.toLowerCase())
      );

      if (impact) {
        return { ...node, impactSeverity: impact.severity, impactReason: impact.reason };
      }

      return { ...node, impactSeverity: 'SAFE' as const };
    });

    return { ...graph, nodes: updatedNodes };
  }

  /**
   * Serialize graph to JSON-compatible format for VSIX webview.
   */
  toVisualizationFormat(graph: SystemContextGraph): object {
    return {
      nodes: graph.nodes.map(n => ({
        id: n.id,
        type: n.type,
        label: n.label,
        status: this.getNodeStatus(n),
        impactSeverity: n.impactSeverity,
        impactReason: n.impactReason,
        data: this.summarizeNodeData(n),
      })),
      edges: graph.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        label: e.label,
      })),
      generatedAt: graph.generatedAt,
    };
  }

  private inferDatabaseNames(svc: ServiceContext): string[] {
    const names: string[] = [];

    // From dependencies marked as DATABASE
    const dbDeps = svc.dependencies.filter(d => d.type === 'DATABASE');
    names.push(...dbDeps.map(d => d.targetService));

    // Infer from service name if has entities
    if (svc.database.length > 0 && names.length === 0) {
      names.push(svc.identity.name.replace('-service', '') + '_db');
    }

    return [...new Set(names)];
  }

  private resolveServiceId(targetService: string, services: ServiceContext[]): string | null {
    // Direct match
    const direct = services.find(s => s.identity.serviceId === targetService);
    if (direct) return direct.identity.serviceId;

    // Partial match
    const partial = services.find(
      s =>
        s.identity.serviceId.includes(targetService) ||
        targetService.includes(s.identity.serviceId) ||
        s.identity.name.toLowerCase().includes(targetService.toLowerCase()) ||
        targetService.toLowerCase().includes(s.identity.name.toLowerCase())
    );
    if (partial) return partial.identity.serviceId;

    return null;
  }

  private getNodeStatus(node: GraphNode): string {
    if (node.type === 'DATABASE') return 'database';
    const svc = node.data as ServiceContext;
    return svc.status || 'Unknown';
  }

  private summarizeNodeData(node: GraphNode): object {
    if (node.type === 'DATABASE') {
      const db = node.data as DatabaseNodeData;
      return {
        name: db.name,
        tableCount: db.tables.length,
        owner: db.ownerServiceId,
      };
    }

    const svc = node.data as ServiceContext;
    return {
      serviceId: svc.identity.serviceId,
      commit: svc.identity.commitHash,
      branch: svc.identity.branch,
      apiCount: svc.apis.length,
      tableCount: svc.database.length,
      dependencyCount: svc.dependencies.length,
      status: svc.status,
      analyzedAt: svc.analyzedAt,
      semanticSummary: svc.semanticSummary,
    };
  }
}
