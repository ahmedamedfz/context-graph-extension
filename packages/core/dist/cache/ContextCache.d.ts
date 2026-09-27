import { ServiceContext } from '../models/types';
/** Atomic payloads and a process lock protect index read/modify/write transactions. */
export declare class ContextCache {
    private cacheDir;
    private indexPath;
    constructor(cacheDir: string, namespace?: string);
    private loadIndex;
    private atomicWrite;
    private update;
    private contextFilePath;
    get(id: string, branch: string, commit: string, dirty?: string): ServiceContext | null;
    getLatest(id: string): ServiceContext | null;
    set(context: ServiceContext, dirty?: string): void;
    getLastAnalyzedCommit(id: string): string | null;
    getLastDirtyHash(id: string): string;
    getBaselineCommit(id: string): string | null;
    getPreviousCommit(id: string): string | null;
    restoreBaseline(id: string, baseline: string | null, last: string | null): void;
    isCached(id: string, branch: string, commit: string, dirty?: string): boolean;
    setWorkspaceFingerprint(fingerprint: string, ids: string[]): void;
    getWorkspaceFingerprint(): {
        fingerprint: string;
        serviceIds: string[];
    } | null;
    listCached(): Array<{
        serviceId: string;
        commitHash: string;
        dirtyHash: string;
        analyzedAt: string;
    }>;
    invalidate(id: string): void;
    estimateTokenSavings(context: ServiceContext): number;
    close(): void;
}
//# sourceMappingURL=ContextCache.d.ts.map