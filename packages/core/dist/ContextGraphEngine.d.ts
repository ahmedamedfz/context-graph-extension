import { ContextCache } from './cache/ContextCache';
import { ContextGraphBuilder } from './graph/ContextGraphBuilder';
import { ServiceContext, SystemContextGraph, ChangeSet, DiscoveredService } from './models/types';
export interface AnalysisOptions {
    workspaceRoot: string;
    cacheDir?: string;
    forceRefresh?: boolean;
}
export interface AnalysisResult {
    services: ServiceContext[];
    graph: SystemContextGraph;
    cacheStats: {
        cached: number;
        refreshed: number;
        failed: number;
    };
}
/**
 * Main orchestrator for the Bob Context Graph analysis pipeline.
 * Coordinates discovery, caching, incremental analysis, and graph building.
 */
export declare class ContextGraphEngine {
    private scanner;
    private apiParser;
    private jpaParser;
    private dependencyAnalyzer;
    private cache;
    private graphBuilder;
    private cacheDir;
    private watsonxClient;
    constructor(options: AnalysisOptions);
    setWatsonxClient(client: any): void;
    /**
     * Full analysis run: discover services, check cache, analyze as needed.
     */
    analyze(forceRefresh?: boolean): Promise<AnalysisResult>;
    /**
     * Analyze a single service, using cache when possible.
     */
    analyzeService(discovered: DiscoveredService, allServiceIds: string[], forceRefresh?: boolean): Promise<ServiceContext>;
    /**
     * Full service analysis.
     */
    fullAnalysis(discovered: DiscoveredService, allServiceIds: string[]): Promise<ServiceContext>;
    /**
     * Incremental analysis using Git diff.
     */
    incrementalAnalysis(discovered: DiscoveredService, allServiceIds: string[], oldCommit: string): Promise<ServiceContext>;
    /**
     * Detect changes for a specific service and run impact analysis.
     */
    detectAndAnalyzeChanges(serviceId: string, allContexts: ServiceContext[]): Promise<ChangeSet | null>;
    getCache(): ContextCache;
    getGraphBuilder(): ContextGraphBuilder;
    private makeErrorContext;
}
//# sourceMappingURL=ContextGraphEngine.d.ts.map