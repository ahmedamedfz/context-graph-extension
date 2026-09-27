import {
  SystemContextGraph,
  GraphNode,
  GraphEdge,
  ServiceContext,
  DatabaseNodeData,
  DatabaseTable,
} from '../models/types';

/**
 * Builds and maintains the System Context Graph from ServiceContexts.
 */
export class ContextGraphBuilder {
  /**
   * Build a complete system graph from all service contexts.
   * F17: merge tables from multiple services that share the same database name.
   */
  build(services: ServiceContext[]): SystemContextGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // F17: Accumulate tables per DB node — multiple services may share a DB
    const dbNodeDataMap = new Map<string, { tables: DatabaseTable[]; ownerServiceIds: string[] }>();

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
        // Merge tables when multiple services share the same DB
        const existing = dbNodeDataMap.get(dbName);
        if (existing) {
          // Add tables not already present (by tableName)
          for (const table of svc.database) {
            if (!existing.tables.find(t => t.tableName === table.tableName)) {
              existing.tables.push(table);
            }
          }
          if (!existing.ownerServiceIds.includes(svc.identity.serviceId)) {
            existing.ownerServiceIds.push(svc.identity.serviceId);
          }
        } else {
          dbNodeDataMap.set(dbName, {
            tables: [...svc.database],
            ownerServiceIds: [svc.identity.serviceId],
          });
        }

        // Add Service → Database edge (deduplicated)
        const edgeId = `${svc.identity.serviceId}->db:${dbName}`;
        if (!edges.find(e => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            type: 'SERVICE_USES_DATABASE',
            source: svc.identity.serviceId,
            target: `db:${dbName}`,
            label: 'uses',
          });
        }
      }
    }

    // Add database nodes to main nodes array
    for (const [dbName, dbData] of dbNodeDataMap) {
      const dbNodeData: DatabaseNodeData = {
        name: dbName,
        tables: dbData.tables,
        ownerServiceId: dbData.ownerServiceIds[0],
        ownerServiceIds: dbData.ownerServiceIds,
      };
      nodes.push({
        id: `db:${dbName}`,
        type: 'DATABASE',
        label: dbName,
        data: dbNodeData,
      });
    }

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
   * F17: Match using nodeId (e.g. db:orders_db) if present, else fall back to label matching.
   */
  applyImpact(
    graph: SystemContextGraph,
    impacts: Array<{ component: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string; nodeId?: string }>
  ): SystemContextGraph {
    const updatedNodes = graph.nodes.map(node => {
      // F17: prefer explicit nodeId match over label substring matching
      const impact = impacts.find(i => {
        if (i.nodeId) return i.nodeId === node.id;
        const comp = i.component.toLowerCase();
        const nodeLabel = node.label.toLowerCase();
        const nodeId = node.id.toLowerCase();
        // Exact label or ID match
        if (comp === nodeLabel || comp === nodeId) return true;
        // For DB nodes: "order-service Database" → check if node label is a substring of the service name
        if (node.type === 'DATABASE' && comp.includes('database')) {
          // Extract service base name from component: "order-service Database" → "order"
          const servicePart = comp.replace(/\s*database\s*/g, '').replace(/-service$/, '').trim();
          // Check if the DB label contains the service name prefix
          const dbBase = nodeLabel.replace(/_db$/, '').replace(/_v\d+$/, '');
          return dbBase.startsWith(servicePart) || servicePart.startsWith(dbBase);
        }
        // Substring fallback for non-DB nodes
        if (node.type !== 'DATABASE') {
          return comp.includes(nodeLabel) || nodeLabel.includes(comp);
        }
        return false;
      });

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
