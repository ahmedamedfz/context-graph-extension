import { SystemContextGraph, ServiceContext } from '../models/types';
/**
 * Builds and maintains the System Context Graph from ServiceContexts.
 */
export declare class ContextGraphBuilder {
    /**
     * Build a complete system graph from all service contexts.
     */
    build(services: ServiceContext[]): SystemContextGraph;
    /**
     * Apply impact highlighting to graph nodes.
     */
    applyImpact(graph: SystemContextGraph, impacts: Array<{
        component: string;
        severity: 'HIGH' | 'MEDIUM' | 'LOW';
        reason: string;
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