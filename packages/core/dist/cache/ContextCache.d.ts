import { ServiceContext } from '../models/types';
/**
 * JSON file-based persistent cache for ServiceContext objects.
 * Cache key: serviceId + branch + commitHash
 * No native dependencies required.
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
     * Get cached context for a service at a specific commit.
     */
    get(serviceId: string, branch: string, commitHash: string): ServiceContext | null;
    /**
     * Store a ServiceContext in the cache.
     */
    set(context: ServiceContext): void;
    /**
     * Get the last analyzed commit hash for a service.
     */
    getLastAnalyzedCommit(serviceId: string): string | null;
    /**
     * Get the previous commit (before the last analysis) for incremental diff.
     */
    getPreviousCommit(serviceId: string): string | null;
    /**
     * Check if we have a cached context for the current commit.
     */
    isCached(serviceId: string, branch: string, commitHash: string): boolean;
    /**
     * List all cached service IDs with their latest commit info.
     */
    listCached(): Array<{
        serviceId: string;
        commitHash: string;
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