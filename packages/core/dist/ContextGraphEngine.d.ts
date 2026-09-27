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
 *
 * Compound cache key: serviceId + branch + commitHash + dirtyHash
 *   - commitHash tracks committed changes (git HEAD)
 *   - dirtyHash  tracks uncommitted working-tree edits (git status --porcelain)
 *
 * Workspace fingerprint: a hash of marker-file topology (pom.xml, package.json …).
 * When it matches the stored value the service-discovery filesystem crawl is
 * skipped entirely — only the per-service cache / dirty checks run.
 */
export declare class ContextGraphEngine {
    private scanner;
    private apiParser;
    private jpaParser;
    private dependencyAnalyzer;
    private nodeParser;
    private pythonParser;
    private goParser;
    private cache;
    private graphBuilder;
    private cacheDir;
    private pending;
    private watsonxClient;
    constructor(options: AnalysisOptions);
    setWatsonxClient(client: any): void;
    /**
     * Full analysis run: discover services, check cache, analyze as needed.
     *
     * F02: Group discovered services by repository so we only read git diff once per repo.
     * NEW: Uses workspace fingerprint to skip the filesystem crawl when project structure
     *      hasn't changed. Uses dirtyHash compound key so uncommitted edits are detected
     *      without needing a commit.
     */
    analyze(forceRefresh?: boolean): Promise<AnalysisResult>;
    private analyzeOnce;
    /**
     * Discover services, using the workspace-fingerprint cache when available.
     *
     * If the fingerprint matches the stored value AND forceRefresh is false,
     * the full filesystem crawl is skipped: we reconstruct DiscoveredService
     * stubs from cached metadata (their rootPath / branch / etc. are already
     * in the per-service cache files on disk — we only need the serviceId list
     * to proceed; the engine will then hit the cache-file hit path and load the
     * full context from disk).
     *
     * If the fingerprint differs (new service added / removed / renamed) or
     * no fingerprint is stored yet, the full scan runs and the new fingerprint
     * is persisted.
     */
    private discoverWithFingerprintCache;
    /**
     * Reconstruct minimal DiscoveredService stubs from the cache metadata.
     * We load the actual ServiceContext from disk to get rootPath, branch, etc.
     * Returns empty array if any service can't be reconstructed (falls back to full scan).
     */
    private reconstructDiscoveredFromCache;
    /**
     * Scan cache directory for any file belonging to this serviceId at the given commit.
     */
    /**
     * Analyze a single service, using cache when possible.
     *
     * Decision tree:
     *   1. Cache hit at (commitHash, dirtyHash)     → return Cached
     *   2. Dirty hash changed since last analysis   → dirty incremental (uncommitted edits)
     *   3. Commit hash changed since last analysis  → committed incremental
     *   4. Otherwise                               → full analysis
     */
    analyzeService(discovered: DiscoveredService, allServiceIds: string[], forceRefresh?: boolean, dirtyHash?: string): Promise<ServiceContext>;
    /**
     * Full service analysis.
     */
    fullAnalysis(discovered: DiscoveredService, allServiceIds: string[], dirtyHash?: string): Promise<ServiceContext>;
    /**
     * Incremental analysis using Git diff between two committed states.
     * F02: scope diff to service's rootPath (relative paths inside the repo).
     * F07: DTO changes that touch an exposed DTO trigger affectsApi=true.
     * F08: preserves DATABASE deps when only SERVICE/CONFIG changed.
     */
    incrementalAnalysis(discovered: DiscoveredService, allServiceIds: string[], oldCommit: string, dirtyHash?: string): Promise<ServiceContext>;
    /**
     * Dirty incremental analysis — same commit, but the working tree has changed.
     * Uses `git status --porcelain` (via getDirtyFiles) as the change set instead
     * of a committed git diff. This means the user never has to commit for Bob to
     * notice their edits.
     */
    dirtyIncrementalAnalysis(discovered: DiscoveredService, allServiceIds: string[], commitHash: string, dirtyHash: string): Promise<ServiceContext>;
    /**
     * Detect changes for a specific service and run impact analysis.
     * F03: compare against the stored baseline commit, not the current HEAD.
     */
    detectAndAnalyzeChanges(serviceId: string, allContexts: ServiceContext[]): Promise<ChangeSet | null>;
    /**
     * Refresh a single specific service without re-analyzing others.
     * F05: targeted refresh — only invalidates and re-parses the target service.
     *
     * The comparison baseline (baselineCommit) is preserved across the refresh so
     * that detectAndAnalyzeChanges / MCP analyze_change can still find the meaningful
     * "before" snapshot after a targeted refresh.
     */
    refreshService(serviceId: string): Promise<AnalysisResult>;
    private refreshServiceOnce;
    getCache(): ContextCache;
    getGraphBuilder(): ContextGraphBuilder;
    /**
     * Merge committed and dirty changed-file lists, deduplicating by path
     * (dirty wins over committed when both exist).
     */
    private mergeChangedFiles;
    /**
     * Helper: merge database dependencies from config into a deps array.
     * If a Map is provided, it will be updated in-place; otherwise the array is modified.
     */
    private mergeDatabaseDependencies;
    private describeApis;
    private makeErrorContext;
}
//# sourceMappingURL=ContextGraphEngine.d.ts.map