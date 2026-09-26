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
/**
 * JSON file-based persistent cache for ServiceContext objects.
 * Cache key: serviceId + branch + commitHash
 * No native dependencies required.
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
                return JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
            }
        }
        catch {
            // corrupt index — start fresh
        }
        return { metadata: {} };
    }
    saveIndex() {
        try {
            fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), 'utf8');
        }
        catch {
            // ignore write errors
        }
    }
    contextFilePath(serviceId, branch, commitHash) {
        // Safe filename: replace slashes in branch names
        const safeBranch = branch.replace(/[/\\]/g, '_');
        return path.join(this.cacheDir, `${serviceId}_${safeBranch}_${commitHash}.json`);
    }
    /**
     * Get cached context for a service at a specific commit.
     */
    get(serviceId, branch, commitHash) {
        const filePath = this.contextFilePath(serviceId, branch, commitHash);
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
     */
    set(context) {
        const { serviceId, branch, commitHash } = context.identity;
        // Write context file
        const filePath = this.contextFilePath(serviceId, branch, commitHash);
        try {
            fs.writeFileSync(filePath, JSON.stringify(context, null, 2), 'utf8');
        }
        catch {
            return; // can't write cache
        }
        // Update metadata index
        const existing = this.index.metadata[serviceId];
        this.index.metadata[serviceId] = {
            lastAnalyzedCommit: commitHash,
            previousCommit: existing?.lastAnalyzedCommit ?? null,
            lastAnalyzedAt: new Date().toISOString(),
        };
        this.saveIndex();
    }
    /**
     * Get the last analyzed commit hash for a service.
     */
    getLastAnalyzedCommit(serviceId) {
        return this.index.metadata[serviceId]?.lastAnalyzedCommit ?? null;
    }
    /**
     * Get the previous commit (before the last analysis) for incremental diff.
     */
    getPreviousCommit(serviceId) {
        return this.index.metadata[serviceId]?.previousCommit ?? null;
    }
    /**
     * Check if we have a cached context for the current commit.
     */
    isCached(serviceId, branch, commitHash) {
        return this.get(serviceId, branch, commitHash) !== null;
    }
    /**
     * List all cached service IDs with their latest commit info.
     */
    listCached() {
        return Object.entries(this.index.metadata).map(([serviceId, meta]) => ({
            serviceId,
            commitHash: meta.lastAnalyzedCommit,
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