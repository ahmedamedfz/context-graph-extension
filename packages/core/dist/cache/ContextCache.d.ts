import { ServiceContext } from '../models/types';
/**
 * JSON file-based persistent cache for ServiceContext objects.
 * Cache key: serviceId + branch + commitHash + dirtyHash
 *
 * The compound key lets uncommitted working-tree edits invalidate the cache
 * without requiring a git commit:
 *  - dirtyHash='clean'  → no uncommitted changes → keyed purely on commit
 *  - dirtyHash=<hex>    → uncommitted changes present → separate cache slot
 *
 * A workspace fingerprint (hash of marker-file paths+sizes) is stored so
 * the engine can skip the full filesystem re-discovery walk when the
 * project structure hasn't changed.
 */
export declare class ContextCache {
    private cacheDir;
    private indexPath;
    private index;
    constructor(cacheDir: string);
    private loadIndex;
    private saveIndex;
    private contextFilePath;
    /**
     * Get cached context for a service at a specific commit + dirty state.
     */
    get(serviceId: string, branch: string, commitHash: string, dirtyHash?: string): ServiceContext | null;
    /**
     * Store a ServiceContext in the cache.
     * dirtyHash='clean' means it was analysed against the committed HEAD only.
     */
    set(context: ServiceContext, dirtyHash?: string): void;
    /**
     * Get the last analyzed commit hash for a service.
     */
    getLastAnalyzedCommit(serviceId: string): string | null;
    /**
     * Get the dirty hash that was current at the last analysis.
     * 'clean' means no uncommitted changes were present during the last analysis.
     */
    getLastDirtyHash(serviceId: string): string;
    /**
     * F03: Get the baseline commit for change comparison.
     * This is the commit that was current BEFORE the latest index write.
     */
    getBaselineCommit(serviceId: string): string | null;
    /**
     * Get the previous commit (before the last analysis) for incremental diff.
     */
    getPreviousCommit(serviceId: string): string | null;
    /**
     * Check if we have a cached context for the current commit + dirty state.
     */
    isCached(serviceId: string, branch: string, commitHash: string, dirtyHash?: string): boolean;
    /**
     * Store the workspace fingerprint (hash of marker-file topology) and the
     * ordered list of discovered service IDs that goes with it. This lets the
     * engine skip the full filesystem crawl on the next startup when the
     * project structure hasn't changed.
     */
    setWorkspaceFingerprint(fingerprint: string, serviceIds: string[]): void;
    /**
     * Returns { fingerprint, serviceIds } if a stored workspace fingerprint
     * exists, or null if none is stored yet.
     */
    getWorkspaceFingerprint(): {
        fingerprint: string;
        serviceIds: string[];
    } | null;
    /**
     * List all cached service IDs with their latest commit info.
     */
    listCached(): Array<{
        serviceId: string;
        commitHash: string;
        dirtyHash: string;
        analyzedAt: string;
    }>;
    /**
     * Invalidate cache for a service.
     */
    invalidate(serviceId: string): void;
    /**
     * Estimate token savings based on context size.
     */
    estimateTokenSavings(context: ServiceContext): number;
    close(): void;
}
//# sourceMappingURL=ContextCache.d.ts.map