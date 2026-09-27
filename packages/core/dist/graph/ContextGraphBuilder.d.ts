import { SystemContextGraph, ServiceContext } from '../models/types';
/**
 * Builds and maintains the System Context Graph from ServiceContexts.
 */
export declare class ContextGraphBuilder {
    /**
     * Build a complete system graph from all service contexts.
     * F17: merge tables from multiple services that share the same database name.
     */
    build(services: ServiceContext[]): SystemContextGraph;
    /**
     * Apply impact highlighting to graph nodes.
     * F17: Match using nodeId (e.g. db:orders_db) if present, else fall back to label matching.
     */
    applyImpact(graph: SystemContextGraph, impacts: Array<{
        component: string;
        severity: 'HIGH' | 'MEDIUM' | 'LOW';
        reason: string;
        nodeId?: string;
    }>): SystemContextGraph;
    /**
     * Serialize graph to JSON-compatible format for VSIX webview.
     */
    toVisualizationFormat(graph: SystemContextGraph): object;
    private inferDatabaseNames;
    private resolveServiceId;
    private getNodeStatus;
    private summarizeNodeData;
}
//# sourceMappingURL=ContextGraphBuilder.d.ts.map