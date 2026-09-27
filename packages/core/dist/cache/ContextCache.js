"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextCache = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SCHEMA_VERSION = 3;
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
class ContextCache {
    constructor(cacheDir) {
        this.cacheDir = cacheDir;
        fs.mkdirSync(cacheDir, { recursive: true });
        this.indexPath = path.join(cacheDir, 'index.json');
        this.index = this.loadIndex();
    }
    loadIndex() {
        try {
            if (fs.existsSync(this.indexPath)) {
                const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
                // Migrate old entries that lack schemaVersion / baselineCommit / lastDirtyHash
                for (const [, meta] of Object.entries(parsed.metadata)) {
                    if (!('schemaVersion' in meta)) {
                        meta.schemaVersion = 1;
                        meta.baselineCommit = meta.previousCommit ?? null;
                    }
                    if (!('lastDirtyHash' in meta)) {
                        meta.lastDirtyHash = 'clean';
                    }
                }
                return parsed;
            }
        }
        catch {
            // corrupt index — start fresh
        }
        return { metadata: {} };
    }
    saveIndex() {
        try {
            // Atomic write: write to temp then rename
            const tmp = this.indexPath + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(this.index, null, 2), 'utf8');
            fs.renameSync(tmp, this.indexPath);
        }
        catch {
            // ignore write errors
        }
    }
    contextFilePath(serviceId, branch, commitHash, dirtyHash = 'clean') {
        // Safe filename: replace slashes in branch names
        const safeBranch = branch.replace(/[/\\]/g, '_');
        const dirtySuffix = dirtyHash !== 'clean' ? `_${dirtyHash}` : '';
        return path.join(this.cacheDir, `${serviceId}_${safeBranch}_${commitHash}${dirtySuffix}.json`);
    }
    /**
     * Get cached context for a service at a specific commit + dirty state.
     */
    get(serviceId, branch, commitHash, dirtyHash = 'clean') {
        const filePath = this.contextFilePath(serviceId, branch, commitHash, dirtyHash);
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        }
        catch {
            // corrupt cache entry
        }
        return null;
    }
    /**
     * Store a ServiceContext in the cache.
     * dirtyHash='clean' means it was analysed against the committed HEAD only.
     */
    set(context, dirtyHash = 'clean') {
        const { serviceId, branch, commitHash } = context.identity;
        // Write context file
        const filePath = this.contextFilePath(serviceId, branch, commitHash, dirtyHash);
        try {
            const tmp = filePath + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(context, null, 2), 'utf8');
            fs.renameSync(tmp, filePath);
        }
        catch {
            return; // can't write cache
        }
        // Reload index from disk before modifying to avoid lost updates (F11)
        this.index = this.loadIndex();
        // Update metadata index — F03: track baselineCommit separately
        const existing = this.index.metadata[serviceId];
        const prevCommit = existing?.lastAnalyzedCommit ?? null;
        this.index.metadata[serviceId] = {
            lastAnalyzedCommit: commitHash,
            lastDirtyHash: dirtyHash,
            // baselineCommit: only advance when the commit actually changed
            baselineCommit: prevCommit !== commitHash ? prevCommit : (existing?.baselineCommit ?? null),
            previousCommit: prevCommit,
            lastAnalyzedAt: new Date().toISOString(),
            schemaVersion: SCHEMA_VERSION,
        };
        this.saveIndex();
    }
    /**
     * Get the last analyzed commit hash for a service.
     */
    getLastAnalyzedCommit(serviceId) {
        // Re-read index from disk so a concurrent writer's changes are visible (F11)
        this.index = this.loadIndex();
        return this.index.metadata[serviceId]?.lastAnalyzedCommit ?? null;
    }
    /**
     * Get the dirty hash that was current at the last analysis.
     * 'clean' means no uncommitted changes were present during the last analysis.
     */
    getLastDirtyHash(serviceId) {
        this.index = this.loadIndex();
        return this.index.metadata[serviceId]?.lastDirtyHash ?? 'clean';
    }
    /**
     * F03: Get the baseline commit for change comparison.
     * This is the commit that was current BEFORE the latest index write.
     */
    getBaselineCommit(serviceId) {
        this.index = this.loadIndex();
        return this.index.metadata[serviceId]?.baselineCommit ?? null;
    }
    /**
     * Get the previous commit (before the last analysis) for incremental diff.
     */
    getPreviousCommit(serviceId) {
        return this.index.metadata[serviceId]?.previousCommit ?? null;
    }
    /**
     * Check if we have a cached context for the current commit + dirty state.
     */
    isCached(serviceId, branch, commitHash, dirtyHash = 'clean') {
        return this.get(serviceId, branch, commitHash, dirtyHash) !== null;
    }
    // ── Workspace fingerprint ───────────────────────────────────────────────
    /**
     * Store the workspace fingerprint (hash of marker-file topology) and the
     * ordered list of discovered service IDs that goes with it. This lets the
     * engine skip the full filesystem crawl on the next startup when the
     * project structure hasn't changed.
     */
    setWorkspaceFingerprint(fingerprint, serviceIds) {
        this.index = this.loadIndex();
        this.index.workspaceFingerprint = fingerprint;
        this.index.discoveredServiceIds = serviceIds;
        this.saveIndex();
    }
    /**
     * Returns { fingerprint, serviceIds } if a stored workspace fingerprint
     * exists, or null if none is stored yet.
     */
    getWorkspaceFingerprint() {
        this.index = this.loadIndex();
        if (this.index.workspaceFingerprint && this.index.discoveredServiceIds) {
            return {
                fingerprint: this.index.workspaceFingerprint,
                serviceIds: this.index.discoveredServiceIds,
            };
        }
        return null;
    }
    // ── Utility ─────────────────────────────────────────────────────────────
    /**
     * List all cached service IDs with their latest commit info.
     */
    listCached() {
        return Object.entries(this.index.metadata).map(([serviceId, meta]) => ({
            serviceId,
            commitHash: meta.lastAnalyzedCommit,
            dirtyHash: meta.lastDirtyHash,
            analyzedAt: meta.lastAnalyzedAt,
        }));
    }
    /**
     * Invalidate cache for a service.
     */
    invalidate(serviceId) {
        // Remove all cache files for this service
        try {
            const files = fs.readdirSync(this.cacheDir);
            for (const file of files) {
                if (file.startsWith(serviceId + '_')) {
                    fs.unlinkSync(path.join(this.cacheDir, file));
                }
            }
        }
        catch {
            // ignore
        }
        delete this.index.metadata[serviceId];
        this.saveIndex();
    }
    /**
     * Estimate token savings based on context size.
     */
    estimateTokenSavings(context) {
        const json = JSON.stringify(context);
        // Rough estimate: 4 chars per token
        return Math.floor(json.length / 4);
    }
    close() {
        // no-op for JSON cache — nothing to close
    }
}
exports.ContextCache = ContextCache;
//# sourceMappingURL=ContextCache.js.map