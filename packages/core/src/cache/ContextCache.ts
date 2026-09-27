import * as fs from 'fs';
import * as path from 'path';
import { ServiceContext } from '../models/types';

interface CacheMetadata {
  lastAnalyzedCommit: string;
  /** The dirty-tree hash at the time of the last analysis ('clean' when no uncommitted changes) */
  lastDirtyHash: string;
  /** F03: The commit that was indexed before the current HEAD (used as comparison baseline) */
  baselineCommit: string | null;
  previousCommit: string | null;
  lastAnalyzedAt: string;
  schemaVersion: number;
}

const SCHEMA_VERSION = 3;

interface CacheIndex {
  /** Fingerprint of workspace discovery topology (marker file paths+sizes) */
  workspaceFingerprint?: string;
  /** Cached list of discovered service IDs in workspace-fingerprint order */
  discoveredServiceIds?: string[];
  metadata: Record<string, CacheMetadata>;
}

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
export class ContextCache {
  private cacheDir: string;
  private indexPath: string;
  private index: CacheIndex;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    fs.mkdirSync(cacheDir, { recursive: true });
    this.indexPath = path.join(cacheDir, 'index.json');
    this.index = this.loadIndex();
  }

  private loadIndex(): CacheIndex {
    try {
      if (fs.existsSync(this.indexPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as CacheIndex;
        // Migrate old entries that lack schemaVersion / baselineCommit / lastDirtyHash
        for (const [, meta] of Object.entries(parsed.metadata)) {
          if (!('schemaVersion' in meta)) {
            (meta as any).schemaVersion = 1;
            (meta as any).baselineCommit = (meta as any).previousCommit ?? null;
          }
          if (!('lastDirtyHash' in meta)) {
            (meta as any).lastDirtyHash = 'clean';
          }
        }
        return parsed;
      }
    } catch {
      // corrupt index — start fresh
    }
    return { metadata: {} };
  }

  private saveIndex(): void {
    try {
      // Atomic write: write to temp then rename
      const tmp = this.indexPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.index, null, 2), 'utf8');
      fs.renameSync(tmp, this.indexPath);
    } catch {
      // ignore write errors
    }
  }

  private contextFilePath(serviceId: string, branch: string, commitHash: string, dirtyHash = 'clean'): string {
    // Safe filename: replace slashes in branch names
    const safeBranch = branch.replace(/[/\\]/g, '_');
    const dirtySuffix = dirtyHash !== 'clean' ? `_${dirtyHash}` : '';
    return path.join(this.cacheDir, `${serviceId}_${safeBranch}_${commitHash}${dirtySuffix}.json`);
  }

  /**
   * Get cached context for a service at a specific commit + dirty state.
   */
  get(serviceId: string, branch: string, commitHash: string, dirtyHash = 'clean'): ServiceContext | null {
    const filePath = this.contextFilePath(serviceId, branch, commitHash, dirtyHash);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ServiceContext;
      }
    } catch {
      // corrupt cache entry
    }
    return null;
  }

  /**
   * Store a ServiceContext in the cache.
   * dirtyHash='clean' means it was analysed against the committed HEAD only.
   */
  set(context: ServiceContext, dirtyHash = 'clean'): void {
    const { serviceId, branch, commitHash } = context.identity;

    // Write context file
    const filePath = this.contextFilePath(serviceId, branch, commitHash, dirtyHash);
    try {
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(context, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
    } catch {
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
  getLastAnalyzedCommit(serviceId: string): string | null {
    // Re-read index from disk so a concurrent writer's changes are visible (F11)
    this.index = this.loadIndex();
    return this.index.metadata[serviceId]?.lastAnalyzedCommit ?? null;
  }

  /**
   * Get the dirty hash that was current at the last analysis.
   * 'clean' means no uncommitted changes were present during the last analysis.
   */
  getLastDirtyHash(serviceId: string): string {
    this.index = this.loadIndex();
    return this.index.metadata[serviceId]?.lastDirtyHash ?? 'clean';
  }

  /**
   * F03: Get the baseline commit for change comparison.
   * This is the commit that was current BEFORE the latest index write.
   */
  getBaselineCommit(serviceId: string): string | null {
    this.index = this.loadIndex();
    return this.index.metadata[serviceId]?.baselineCommit ?? null;
  }

  /**
   * Get the previous commit (before the last analysis) for incremental diff.
   */
  getPreviousCommit(serviceId: string): string | null {
    return this.index.metadata[serviceId]?.previousCommit ?? null;
  }

  /**
   * Check if we have a cached context for the current commit + dirty state.
   */
  isCached(serviceId: string, branch: string, commitHash: string, dirtyHash = 'clean'): boolean {
    return this.get(serviceId, branch, commitHash, dirtyHash) !== null;
  }

  // ── Workspace fingerprint ───────────────────────────────────────────────

  /**
   * Store the workspace fingerprint (hash of marker-file topology) and the
   * ordered list of discovered service IDs that goes with it. This lets the
   * engine skip the full filesystem crawl on the next startup when the
   * project structure hasn't changed.
   */
  setWorkspaceFingerprint(fingerprint: string, serviceIds: string[]): void {
    this.index = this.loadIndex();
    this.index.workspaceFingerprint = fingerprint;
    this.index.discoveredServiceIds = serviceIds;
    this.saveIndex();
  }

  /**
   * Returns { fingerprint, serviceIds } if a stored workspace fingerprint
   * exists, or null if none is stored yet.
   */
  getWorkspaceFingerprint(): { fingerprint: string; serviceIds: string[] } | null {
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
  listCached(): Array<{ serviceId: string; commitHash: string; dirtyHash: string; analyzedAt: string }> {
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
  invalidate(serviceId: string): void {
    // Remove all cache files for this service
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.startsWith(serviceId + '_')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch {
      // ignore
    }
    delete this.index.metadata[serviceId];
    this.saveIndex();
  }

  /**
   * Estimate token savings based on context size.
   */
  estimateTokenSavings(context: ServiceContext): number {
    const json = JSON.stringify(context);
    // Rough estimate: 4 chars per token
    return Math.floor(json.length / 4);
  }

  close(): void {
    // no-op for JSON cache — nothing to close
  }
}
