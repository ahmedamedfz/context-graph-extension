import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { ServiceContext } from '../models/types';

const SCHEMA_VERSION = 4;
interface CacheMetadata {
  lastAnalyzedCommit: string;
  lastDirtyHash: string;
  baselineCommit: string | null;
  previousCommit: string | null;
  lastAnalyzedAt: string;
  schemaVersion: number;
  branch?: string;
}
interface CacheIndex {
  workspaceFingerprint?: string;
  discoveredServiceIds?: string[];
  metadata: Record<string, CacheMetadata>;
}

/** Atomic payloads and a process lock protect index read/modify/write transactions. */
export class ContextCache {
  private indexPath: string;
  constructor(private cacheDir: string, namespace?: string) {
    if (namespace) this.cacheDir = cacheDir = path.join(cacheDir, 'workspace-' + createHash('sha256').update(namespace).digest('hex').slice(0, 16));
    fs.mkdirSync(cacheDir, {recursive: true});
    this.indexPath = path.join(cacheDir, 'index.json');
  }
  private loadIndex(): CacheIndex {
    try {
      const index = JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as CacheIndex;
      if (!index.metadata || typeof index.metadata !== 'object') throw Error('Invalid metadata');
      for (const [id, meta] of Object.entries(index.metadata)) {
        if (!meta || meta.schemaVersion !== SCHEMA_VERSION) {
          // Legacy history can be read, but payloads must be rebuilt with this parser version.
          if (meta && meta.schemaVersion === undefined) {
            meta.baselineCommit = meta.previousCommit ?? null;
            meta.lastDirtyHash = 'clean';
          } else delete index.metadata[id];
        }
      }
      return index;
    } catch (err: any) {
      if (err.code !== 'ENOENT') process.stderr.write(`[BCG] Invalid cache index; rebuilding: ${err.message}\n`);
      return {metadata: {}};
    }
  }
  private atomicWrite(file: string, value: unknown): void {
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(value));
      fs.renameSync(tmp, file);
    } finally { fs.rmSync(tmp, {force: true}); }
  }
  private update(fn: (index: CacheIndex) => void): void {
    const lock = this.indexPath + '.lock';
    const deadline = Date.now() + 5000;
    let fd: number;
    for (;;) {
      try { fd = fs.openSync(lock, 'wx'); fs.writeFileSync(fd, String(process.pid)); break; }
      catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
        try {
          const pid = Number(fs.readFileSync(lock, 'utf8'));
          if (pid > 0) {
            try { process.kill(pid, 0); } catch (e: any) { if (e.code === 'ESRCH') { fs.unlinkSync(lock); continue; } }
          }
        } catch { /* another writer released it */ }
        if (Date.now() >= deadline) throw Error('Cache lock timeout');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    try { const index = this.loadIndex(); fn(index); this.atomicWrite(this.indexPath, index); }
    finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  private contextFilePath(id: string, branch: string, commit: string, dirty = 'clean'): string {
    const key = createHash('sha256').update(JSON.stringify([id, branch, commit, dirty])).digest('hex');
    return path.join(this.cacheDir, key + '.json');
  }
  get(id: string, branch: string, commit: string, dirty = 'clean'): ServiceContext | null {
    const meta = this.loadIndex().metadata[id];
    if (meta?.schemaVersion !== SCHEMA_VERSION) return null;
    try {
      const ctx = JSON.parse(fs.readFileSync(this.contextFilePath(id, branch, commit, dirty), 'utf8')) as ServiceContext;
      return ctx.identity.serviceId === id && ctx.identity.branch === branch && ctx.identity.commitHash === commit ? ctx : null;
    } catch (err: any) {
      if (err.code !== 'ENOENT') process.stderr.write(`[BCG] Invalid cached context ${id}: ${err.message}\n`);
      return null;
    }
  }
  getLatest(id: string): ServiceContext | null {
    const m = this.loadIndex().metadata[id];
    return m ? this.get(id, m.branch ?? 'main', m.lastAnalyzedCommit, m.lastDirtyHash) : null;
  }
  set(context: ServiceContext, dirty = 'clean'): void {
    const {serviceId: id, branch, commitHash: commit} = context.identity;
    this.update(index => {
      this.atomicWrite(this.contextFilePath(id, branch, commit, dirty), context);
      const old = index.metadata[id], prev = old?.lastAnalyzedCommit ?? null;
      index.metadata[id] = {
        lastAnalyzedCommit: commit, lastDirtyHash: dirty, branch,
        baselineCommit: prev !== commit ? (prev === 'unknown' ? null : prev) : (old?.baselineCommit ?? null),
        previousCommit: prev, lastAnalyzedAt: context.analyzedAt, schemaVersion: SCHEMA_VERSION,
      };
    });
  }
  getLastAnalyzedCommit(id: string): string | null { return this.loadIndex().metadata[id]?.lastAnalyzedCommit ?? null; }
  getLastDirtyHash(id: string): string { return this.loadIndex().metadata[id]?.lastDirtyHash ?? 'clean'; }
  getBaselineCommit(id: string): string | null { return this.loadIndex().metadata[id]?.baselineCommit ?? null; }
  getPreviousCommit(id: string): string | null { return this.loadIndex().metadata[id]?.previousCommit ?? null; }
  restoreBaseline(id: string, baseline: string | null, last: string | null): void {
    this.update(index => { if (index.metadata[id]) index.metadata[id].baselineCommit = baseline ?? last; });
  }
  isCached(id: string, branch: string, commit: string, dirty = 'clean'): boolean { return this.get(id, branch, commit, dirty) !== null; }
  setWorkspaceFingerprint(fingerprint: string, ids: string[]): void {
    this.update(index => { index.workspaceFingerprint = fingerprint; index.discoveredServiceIds = ids; });
  }
  getWorkspaceFingerprint(): {fingerprint: string; serviceIds: string[]} | null {
    const index = this.loadIndex();
    return index.workspaceFingerprint && index.discoveredServiceIds ? {fingerprint: index.workspaceFingerprint, serviceIds: index.discoveredServiceIds} : null;
  }
  listCached(): Array<{serviceId: string; commitHash: string; dirtyHash: string; analyzedAt: string}> {
    return Object.entries(this.loadIndex().metadata).map(([serviceId, m]) => ({serviceId, commitHash: m.lastAnalyzedCommit, dirtyHash: m.lastDirtyHash, analyzedAt: m.lastAnalyzedAt}));
  }
  invalidate(id: string): void { this.update(index => { delete index.metadata[id]; }); }
  estimateTokenSavings(context: ServiceContext): number { return Math.floor(JSON.stringify(context).length / 4); }
  close(): void {}
}
