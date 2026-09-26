import * as fs from 'fs';
import * as path from 'path';
import { ServiceContext } from '../models/types';

interface CacheMetadata {
  lastAnalyzedCommit: string;
  previousCommit: string | null;
  lastAnalyzedAt: string;
}

interface CacheIndex {
  metadata: Record<string, CacheMetadata>;
}

/**
 * JSON file-based persistent cache for ServiceContext objects.
 * Cache key: serviceId + branch + commitHash
 * No native dependencies required.
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
        return JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as CacheIndex;
      }
    } catch {
      // corrupt index — start fresh
    }
    return { metadata: {} };
  }

  private saveIndex(): void {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), 'utf8');
    } catch {
      // ignore write errors
    }
  }

  private contextFilePath(serviceId: string, branch: string, commitHash: string): string {
    // Safe filename: replace slashes in branch names
    const safeBranch = branch.replace(/[/\\]/g, '_');
    return path.join(this.cacheDir, `${serviceId}_${safeBranch}_${commitHash}.json`);
  }

  /**
   * Get cached context for a service at a specific commit.
   */
  get(serviceId: string, branch: string, commitHash: string): ServiceContext | null {
    const filePath = this.contextFilePath(serviceId, branch, commitHash);
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
   */
  set(context: ServiceContext): void {
    const { serviceId, branch, commitHash } = context.identity;

    // Write context file
    const filePath = this.contextFilePath(serviceId, branch, commitHash);
    try {
      fs.writeFileSync(filePath, JSON.stringify(context, null, 2), 'utf8');
    } catch {
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
  getLastAnalyzedCommit(serviceId: string): string | null {
    return this.index.metadata[serviceId]?.lastAnalyzedCommit ?? null;
  }

  /**
   * Get the previous commit (before the last analysis) for incremental diff.
   */
  getPreviousCommit(serviceId: string): string | null {
    return this.index.metadata[serviceId]?.previousCommit ?? null;
  }

  /**
   * Check if we have a cached context for the current commit.
   */
  isCached(serviceId: string, branch: string, commitHash: string): boolean {
    return this.get(serviceId, branch, commitHash) !== null;
  }

  /**
   * List all cached service IDs with their latest commit info.
   */
  listCached(): Array<{ serviceId: string; commitHash: string; analyzedAt: string }> {
    return Object.entries(this.index.metadata).map(([serviceId, meta]) => ({
      serviceId,
      commitHash: meta.lastAnalyzedCommit,
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
