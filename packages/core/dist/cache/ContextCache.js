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
const crypto_1 = require("crypto");
const SCHEMA_VERSION = 4;
/** Atomic payloads and a process lock protect index read/modify/write transactions. */
class ContextCache {
    constructor(cacheDir, namespace) {
        this.cacheDir = cacheDir;
        if (namespace)
            this.cacheDir = cacheDir = path.join(cacheDir, 'workspace-' + (0, crypto_1.createHash)('sha256').update(namespace).digest('hex').slice(0, 16));
        fs.mkdirSync(cacheDir, { recursive: true });
        this.indexPath = path.join(cacheDir, 'index.json');
    }
    loadIndex() {
        try {
            const index = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
            if (!index.metadata || typeof index.metadata !== 'object')
                throw Error('Invalid metadata');
            for (const [id, meta] of Object.entries(index.metadata)) {
                if (!meta || meta.schemaVersion !== SCHEMA_VERSION) {
                    // Legacy history can be read, but payloads must be rebuilt with this parser version.
                    if (meta && meta.schemaVersion === undefined) {
                        meta.baselineCommit = meta.previousCommit ?? null;
                        meta.lastDirtyHash = 'clean';
                    }
                    else
                        delete index.metadata[id];
                }
            }
            return index;
        }
        catch (err) {
            if (err.code !== 'ENOENT')
                process.stderr.write(`[BCG] Invalid cache index; rebuilding: ${err.message}\n`);
            return { metadata: {} };
        }
    }
    atomicWrite(file, value) {
        const tmp = `${file}.${process.pid}.${(0, crypto_1.randomUUID)()}.tmp`;
        try {
            fs.writeFileSync(tmp, JSON.stringify(value));
            fs.renameSync(tmp, file);
        }
        finally {
            fs.rmSync(tmp, { force: true });
        }
    }
    update(fn) {
        const lock = this.indexPath + '.lock';
        const deadline = Date.now() + 5000;
        let fd;
        for (;;) {
            try {
                fd = fs.openSync(lock, 'wx');
                fs.writeFileSync(fd, String(process.pid));
                break;
            }
            catch (err) {
                if (err.code !== 'EEXIST')
                    throw err;
                try {
                    const pid = Number(fs.readFileSync(lock, 'utf8'));
                    if (pid > 0) {
                        try {
                            process.kill(pid, 0);
                        }
                        catch (e) {
                            if (e.code === 'ESRCH') {
                                fs.unlinkSync(lock);
                                continue;
                            }
                        }
                    }
                }
                catch { /* another writer released it */ }
                if (Date.now() >= deadline)
                    throw Error('Cache lock timeout');
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
            }
        }
        try {
            const index = this.loadIndex();
            fn(index);
            this.atomicWrite(this.indexPath, index);
        }
        finally {
            fs.closeSync(fd);
            fs.unlinkSync(lock);
        }
    }
    contextFilePath(id, branch, commit, dirty = 'clean') {
        const key = (0, crypto_1.createHash)('sha256').update(JSON.stringify([id, branch, commit, dirty])).digest('hex');
        return path.join(this.cacheDir, key + '.json');
    }
    get(id, branch, commit, dirty = 'clean') {
        const meta = this.loadIndex().metadata[id];
        if (meta?.schemaVersion !== SCHEMA_VERSION)
            return null;
        try {
            const ctx = JSON.parse(fs.readFileSync(this.contextFilePath(id, branch, commit, dirty), 'utf8'));
            return ctx.identity.serviceId === id && ctx.identity.branch === branch && ctx.identity.commitHash === commit ? ctx : null;
        }
        catch (err) {
            if (err.code !== 'ENOENT')
                process.stderr.write(`[BCG] Invalid cached context ${id}: ${err.message}\n`);
            return null;
        }
    }
    getLatest(id) {
        const m = this.loadIndex().metadata[id];
        return m ? this.get(id, m.branch ?? 'main', m.lastAnalyzedCommit, m.lastDirtyHash) : null;
    }
    set(context, dirty = 'clean') {
        const { serviceId: id, branch, commitHash: commit } = context.identity;
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
    getLastAnalyzedCommit(id) { return this.loadIndex().metadata[id]?.lastAnalyzedCommit ?? null; }
    getLastDirtyHash(id) { return this.loadIndex().metadata[id]?.lastDirtyHash ?? 'clean'; }
    getBaselineCommit(id) { return this.loadIndex().metadata[id]?.baselineCommit ?? null; }
    getPreviousCommit(id) { return this.loadIndex().metadata[id]?.previousCommit ?? null; }
    restoreBaseline(id, baseline, last) {
        this.update(index => { if (index.metadata[id])
            index.metadata[id].baselineCommit = baseline ?? last; });
    }
    isCached(id, branch, commit, dirty = 'clean') { return this.get(id, branch, commit, dirty) !== null; }
    setWorkspaceFingerprint(fingerprint, ids) {
        this.update(index => { index.workspaceFingerprint = fingerprint; index.discoveredServiceIds = ids; });
    }
    getWorkspaceFingerprint() {
        const index = this.loadIndex();
        return index.workspaceFingerprint && index.discoveredServiceIds ? { fingerprint: index.workspaceFingerprint, serviceIds: index.discoveredServiceIds } : null;
    }
    listCached() {
        return Object.entries(this.loadIndex().metadata).map(([serviceId, m]) => ({ serviceId, commitHash: m.lastAnalyzedCommit, dirtyHash: m.lastDirtyHash, analyzedAt: m.lastAnalyzedAt }));
    }
    invalidate(id) { this.update(index => { delete index.metadata[id]; }); }
    estimateTokenSavings(context) { return Math.floor(JSON.stringify(context).length / 4); }
    close() { }
}
exports.ContextCache = ContextCache;
//# sourceMappingURL=ContextCache.js.map