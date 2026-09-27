import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceScanner } from './scanner/WorkspaceScanner';
import { GitAnalyzer } from './git/GitAnalyzer';
import { SpringApiParser } from './parser/SpringApiParser';
import { JpaEntityParser } from './parser/JpaEntityParser';
import { DependencyAnalyzer } from './parser/DependencyAnalyzer';
import { enrichSchemas } from './parser/SchemaEnricher';
import { configurationRevision } from './parser/ComposeDependencies';
import { NativeApiParser } from './parser/NativeApiParser';
import { NodeApiParser } from './parser/NodeApiParser';
import { PythonApiParser } from './parser/PythonApiParser';
import { GoApiParser } from './parser/GoApiParser';
import { ContextCache } from './cache/ContextCache';
import { ContextGraphBuilder } from './graph/ContextGraphBuilder';
import {
  ServiceContext,
  SystemContextGraph,
  ChangeSet,
  DiscoveredService,
  ServiceDependency,
} from './models/types';

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
export class ContextGraphEngine {
  private scanner: WorkspaceScanner;
  private apiParser: SpringApiParser;
  private jpaParser: JpaEntityParser;
  private dependencyAnalyzer: DependencyAnalyzer;
  private nodeParser: NodeApiParser;
  private pythonParser: PythonApiParser;
  private goParser: GoApiParser;
  private cache: ContextCache;
  private graphBuilder: ContextGraphBuilder;
  private cacheDir: string;
  private pending: Promise<AnalysisResult> | null = null;
  private watsonxClient: any = null; // Injected at runtime

  constructor(options: AnalysisOptions) {
    this.cacheDir = options.cacheDir ?? path.join(options.workspaceRoot, '.context-graph-cache');
    this.scanner = new WorkspaceScanner(options.workspaceRoot);
    this.apiParser = new SpringApiParser();
    this.jpaParser = new JpaEntityParser();
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.nodeParser = new NodeApiParser();
    this.pythonParser = new PythonApiParser();
    this.goParser = new GoApiParser();
    this.cache = new ContextCache(this.cacheDir, fs.realpathSync(options.workspaceRoot));
    this.graphBuilder = new ContextGraphBuilder();
  }

  setWatsonxClient(client: any): void {
    this.watsonxClient = client;
  }

  /**
   * Full analysis run: discover services, check cache, analyze as needed.
   *
   * F02: Group discovered services by repository so we only read git diff once per repo.
   * NEW: Uses workspace fingerprint to skip the filesystem crawl when project structure
   *      hasn't changed. Uses dirtyHash compound key so uncommitted edits are detected
   *      without needing a commit.
   */
  async analyze(forceRefresh = false): Promise<AnalysisResult> {
    if (this.pending) {
      if (!forceRefresh) return this.pending;
      await this.pending;
      return this.analyze(true);
    }
    this.pending = this.analyzeOnce(forceRefresh);
    try { return await this.pending; } finally { this.pending = null; }
  }

  private async analyzeOnce(forceRefresh: boolean): Promise<AnalysisResult> {
    // ── 1. Service discovery (with workspace-fingerprint shortcut) ──────────
    const discovered = await this.discoverWithFingerprintCache(forceRefresh);
    const stats = { cached: 0, refreshed: 0, failed: 0 };
    const serviceContexts: ServiceContext[] = [];

    const serviceIds = discovered.map(d => d.serviceId);

    // ── 2. Per-repo HEAD + dirty-hash map ────────────────────────────────────
    // F02: build a per-repository HEAD + branch map so all services in the same repo
    // share the same observed commit/branch and we only call git once per repo.
    const repoHeadMap = new Map<string, string>();
    const repoBranchMap = new Map<string, string>();
    const repoDirtyMap = new Map<string, string>();
    for (const svc of discovered) {
      if (svc.isGitRepo && !repoHeadMap.has(svc.repository)) {
        const git = new GitAnalyzer(svc.repository);
        repoHeadMap.set(svc.repository, git.getHead(false));
        repoBranchMap.set(svc.repository, git.getBranch());
        // Pass the cacheDir as an ignore path so that writing cache files inside
        // the repo root doesn't pollute the dirty fingerprint.
        repoDirtyMap.set(svc.repository, git.getDirtyHash([this.cacheDir]));
      }
    }

    for (const svc of discovered) {
      // F02/BRANCH: override commitHash AND branch with authoritative per-repo values
      // read fresh from git HEAD each time, so branch checkout at same SHA is detected.
      const repoHead = repoHeadMap.get(svc.repository);
      const repoBranch = repoBranchMap.get(svc.repository);
      const repoDirty = svc.isGitRepo ? new GitAnalyzer(svc.repository).getDirtyHash([this.cacheDir], svc.rootPath) : 'clean';
      const effective: DiscoveredService = repoHead
        ? { ...svc, commitHash: repoHead, branch: repoBranch ?? svc.branch }
        : svc;

      try {
        const ctx = await this.analyzeService(effective, serviceIds, forceRefresh, repoDirty);
        serviceContexts.push(ctx);

        if (ctx.status === 'Cached') stats.cached++;
        else stats.refreshed++;
      } catch (err) {
        process.stderr.write(`[BCG] Failed to analyze ${svc.serviceId}: ${err}\n`);
        stats.failed++;
        serviceContexts.push(this.makeErrorContext(svc, String(err)));
      }
    }

    const graph = this.graphBuilder.build(serviceContexts);

    return { services: serviceContexts, graph, cacheStats: stats };
  }

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
  private async discoverWithFingerprintCache(forceRefresh: boolean): Promise<DiscoveredService[]> {
    const currentFingerprint = this.scanner.getWorkspaceFingerprint();

    if (!forceRefresh) {
      const stored = this.cache.getWorkspaceFingerprint();
      if (stored && stored.fingerprint === currentFingerprint) {
        // Fingerprint matches — attempt to reconstruct from cache metadata
        const reconstructed = this.reconstructDiscoveredFromCache(stored.serviceIds);
        if (reconstructed.length > 0) {
          process.stderr.write(`[BCG] Workspace fingerprint hit — reusing discovery (marker scan still performed) (${reconstructed.length} services)\n`);
          return reconstructed;
        }
      }
    }

    // Full scan
    const discovered = await this.scanner.discoverServices();
    // Persist fingerprint + service ID list for next run
    this.cache.setWorkspaceFingerprint(currentFingerprint, discovered.map(d => d.serviceId));
    return discovered;
  }

  /**
   * Reconstruct minimal DiscoveredService stubs from the cache metadata.
   * We load the actual ServiceContext from disk to get rootPath, branch, etc.
   * Returns empty array if any service can't be reconstructed (falls back to full scan).
   */
  private reconstructDiscoveredFromCache(serviceIds: string[]): DiscoveredService[] {
    const result: DiscoveredService[] = [];

    for (const serviceId of serviceIds) {
      const ctx = this.cache.getLatest(serviceId);
      if (!ctx || !fs.existsSync(ctx.identity.rootPath) || ctx.identity.commitHash === 'unknown') return [];

      result.push({
        serviceId: ctx.identity.serviceId,
        name: ctx.identity.name,
        rootPath: ctx.identity.rootPath,
        repository: ctx.identity.repository,
        branch: ctx.identity.branch,
        // Use the cached commit as placeholder; the engine will overwrite with
        // git HEAD before deciding cache/incremental
        commitHash: ctx.identity.commitHash,
        isGitRepo: true,
        detectedStack: ctx.detectedStack ?? 'unknown',
      });
    }

    return result;
  }

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
  async analyzeService(
    discovered: DiscoveredService,
    allServiceIds: string[],
    forceRefresh = false,
    dirtyHash = 'clean'
  ): Promise<ServiceContext> {
    const { serviceId, branch, commitHash, isGitRepo } = discovered;

    const latest = this.cache.getLatest(serviceId);
    if (latest && (latest.configurationRevision !== configurationRevision(discovered.rootPath) || latest.identity.rootPath !== discovered.rootPath)) return this.fullAnalysis(discovered, allServiceIds, dirtyHash);

    // F10: 'unknown' commitHash means no git — never treat as cached
    const commitIsKnown = commitHash !== 'unknown';

    // ── 1. Exact cache hit (commit + dirty state) ────────────────────────────
    if (!forceRefresh && commitIsKnown && this.cache.isCached(serviceId, branch, commitHash, dirtyHash)) {
      const cached = this.cache.get(serviceId, branch, commitHash, dirtyHash)!;
      if (cached.identity.rootPath !== discovered.rootPath || cached.detectedStack !== discovered.detectedStack) return this.fullAnalysis(discovered, allServiceIds, dirtyHash);
      cached.status = 'Cached';
      // Restore metadata too when reverting a dirty overlay to the clean slot.
      if (this.cache.getLastDirtyHash(serviceId) !== dirtyHash || this.cache.getLastAnalyzedCommit(serviceId) !== commitHash) this.cache.set(cached, dirtyHash);
      return cached;
    }

    // ── 2. Dirty-state changed (uncommitted edits detected) ──────────────────
    const lastAnalyzedCommit = this.cache.getLastAnalyzedCommit(serviceId);
    const lastDirtyHash = this.cache.getLastDirtyHash(serviceId);

    if (
      commitIsKnown &&
      !forceRefresh &&
      lastAnalyzedCommit === commitHash &&
      dirtyHash !== 'clean' &&
      dirtyHash !== lastDirtyHash
    ) {
      // Same commit, but working tree has changed → dirty incremental
      process.stderr.write(`[BCG] Dirty-state change: ${serviceId} (dirty=${dirtyHash.slice(0, 7)})\n`);
      return this.dirtyIncrementalAnalysis(discovered, allServiceIds, commitHash, dirtyHash);
    }

    // ── 3. Committed incremental analysis ───────────────────────────────────
    if (commitIsKnown && lastAnalyzedCommit && lastAnalyzedCommit !== 'unknown' && lastAnalyzedCommit !== commitHash && !forceRefresh) {
      // F02: scope diff to service root path
      return this.incrementalAnalysis(discovered, allServiceIds, lastAnalyzedCommit, dirtyHash);
    }

    // ── 4. Full analysis ─────────────────────────────────────────────────────
    return this.fullAnalysis(discovered, allServiceIds, dirtyHash);
  }

  /**
   * Full service analysis.
   */
  async fullAnalysis(
    discovered: DiscoveredService,
    allServiceIds: string[],
    dirtyHash = 'clean'
  ): Promise<ServiceContext> {
    const { serviceId, name, rootPath, repository, branch, commitHash, detectedStack } = discovered;

    process.stderr.write(`[BCG] Full analysis: ${serviceId} @ ${commitHash.slice(0, 7)} dirty=${dirtyHash} (${detectedStack})\n`);

    // Route to appropriate parser based on detected stack
    let apis: ReturnType<SpringApiParser['parseService']> = [];
    let database: ReturnType<JpaEntityParser['parseService']> = [];

    switch (detectedStack) {
      case 'spring-boot':
        apis = this.apiParser.parseService(rootPath);
        database = this.jpaParser.parseService(rootPath);
        break;
      case 'node':
        apis = this.nodeParser.parseService(rootPath);
        break;
      case 'python':
        apis = this.pythonParser.parseService(rootPath);
        break;
      case 'java':
      case 'php':
        apis = new NativeApiParser().parseService(rootPath);
        break;
      case 'go':
        apis = this.goParser.parseService(rootPath);
        break;
      default:
        // unknown — leave apis/database empty
        break;
    }

    // Detect dependencies (exclude self)
    const otherServices = allServiceIds.filter(id => id !== serviceId);
    const dependencies = this.dependencyAnalyzer.analyzeDependencies(rootPath, otherServices);

    // Detect database usage from config
    this.mergeDatabaseDependencies(dependencies, rootPath, name, database.length > 0);

    const fileCount = this.scanner.countFiles(rootPath, ['.java', '.ts', '.js', '.py', '.go', '.php']);

    const context: ServiceContext = {
      identity: {
        serviceId,
        repository,
        branch,
        commitHash,
        name,
        rootPath,
      },
      apis,
      database,
      dependencies,
      events: { publishes: [], consumes: [] },
      analyzedAt: new Date().toISOString(),
      fileCount,
      status: 'Indexed',
      detectedStack,
    };

    // Generate semantic summary via watsonx if available
    if (this.watsonxClient) {
      try {
        context.semanticSummary = await this.watsonxClient.generateServiceSummary(context);
      } catch {
        // watsonx not available, skip
      }
    }

    await this.describeApis(context);
    this.cache.set(context, dirtyHash);
    return context;
  }

  /**
   * Incremental analysis using Git diff between two committed states.
   * F02: scope diff to service's rootPath (relative paths inside the repo).
   * F07: DTO changes that touch an exposed DTO trigger affectsApi=true.
   * F08: preserves DATABASE deps when only SERVICE/CONFIG changed.
   */
  async incrementalAnalysis(
    discovered: DiscoveredService,
    allServiceIds: string[],
    oldCommit: string,
    dirtyHash = 'clean'
  ): Promise<ServiceContext> {
    const { serviceId, rootPath, commitHash, branch, repository, detectedStack } = discovered;

    process.stderr.write(`[BCG] Incremental analysis: ${serviceId} ${oldCommit.slice(0, 7)} → ${commitHash.slice(0, 7)} dirty=${dirtyHash}\n`);

    const git = new GitAnalyzer(repository);
    // F02: get ALL changed files in the repo diff, then filter to this service's subdirectory
    const allChangedFiles = git.getChangedFiles(oldCommit, commitHash);

    // Compute path prefix of the service relative to the repo root.
    // Use fs.realpathSync to resolve symlinks (/tmp → /private/tmp on macOS) so that
    // path.relative produces a clean sub-path rather than a traversal path.
    const fs = require('fs') as typeof import('fs');
    const realRepo = (() => { try { return fs.realpathSync(repository); } catch { return path.resolve(repository); } })();
    const realRoot = (() => { try { return fs.realpathSync(rootPath); } catch { return path.resolve(rootPath); } })();
    const serviceRelPath = path.relative(realRepo, realRoot).replace(/\\/g, '/');
    const prefix = serviceRelPath && !serviceRelPath.startsWith('..') ? serviceRelPath + '/' : '';

    // Keep only files that belong to this service directory
    const committedChangedFiles = prefix
      ? allChangedFiles.filter(f => f.path.startsWith(prefix))
      : allChangedFiles;

    // Also include any dirty (uncommitted) files when dirtyHash is set
    const dirtyFiles = dirtyHash !== 'clean' ? git.getDirtyFiles().filter(f => !prefix || f.path.startsWith(prefix)) : [];
    const changedFiles = this.mergeChangedFiles(committedChangedFiles, dirtyFiles);

    // F07: a DTO change affects the API if the DTO name appears in any endpoint model
    const hasDtoChange = changedFiles.some(f => f.category === 'DTO');
    let dtoAffectsApi = false;
    if (hasDtoChange) {
      const previousContext = this.cache.get(serviceId, branch, oldCommit, 'clean')
                           ?? this.cache.get(serviceId, branch, oldCommit);
      if (previousContext) {
        const changedDtoNames = changedFiles
          .filter(f => f.category === 'DTO')
          .map(f => path.basename(f.path, '.java').toLowerCase());
        dtoAffectsApi = previousContext.apis.some(api => {
          const reqModel = (api.requestModel ?? '').toLowerCase();
          const resModel = (api.responseModel ?? '').toLowerCase();
          return changedDtoNames.some(dto => reqModel.includes(dto) || resModel.includes(dto));
        });
      }
    }

    const changeSet: ChangeSet = {
      serviceId,
      oldCommit,
      newCommit: commitHash,
      changedFiles,
      // F07: DTO change that touches an exposed endpoint counts as API change
      affectsApi: changedFiles.some(f => f.category === 'API') || dtoAffectsApi,
      affectsDatabase: changedFiles.some(f => f.category === 'ENTITY'),
      affectsDependencies: changedFiles.some(f => ['SERVICE', 'CONFIG'].includes(f.category)),
    };

    // Get previous context as baseline (prefer clean-dirty slot)
    const previousContext = this.cache.get(serviceId, branch, oldCommit, 'clean')
                         ?? this.cache.get(serviceId, branch, oldCommit);

    if (!previousContext) {
      // No baseline - do full analysis
      return this.fullAnalysis(discovered, allServiceIds, dirtyHash);
    }

    // F02: if no files in this service's directory changed between commits,
    // reuse the previous context as a cache hit (avoids re-parsing on unrelated commits).
    if (changedFiles.length === 0) {
      process.stderr.write(`[BCG] Incremental: no changes scoped to ${serviceId} — reusing cached context\n`);
      const reused: ServiceContext = { ...previousContext };
      reused.identity = { ...previousContext.identity, commitHash, previousCommitHash: oldCommit };
      reused.analyzedAt = new Date().toISOString();
      reused.status = 'Cached';
      this.cache.set(reused, dirtyHash);
      return reused;
    }

    // Build updated context
    const updated: ServiceContext = { ...previousContext };
    updated.identity = { ...previousContext.identity, commitHash, previousCommitHash: oldCommit };
    updated.analyzedAt = new Date().toISOString();
    updated.status = 'Changed';
    updated.detectedStack = detectedStack;

    // Re-analyze only affected sections — dispatch to the right parser per stack.
    // For non-spring stacks, any source file change may add/remove routes, so we
    // re-parse whenever API or SERVICE files are in the changeset.
    const nonSpringSourceChanged = detectedStack !== 'spring-boot' &&
      changedFiles.some(f => f.category === 'SERVICE' || f.category === 'API' || f.category === 'CONFIG');
    if (changeSet.affectsApi || nonSpringSourceChanged) {
      process.stderr.write(`[BCG] Re-analyzing APIs for ${serviceId} (${detectedStack})\n`);
      switch (detectedStack) {
        case 'spring-boot':
          updated.apis = this.apiParser.parseService(rootPath);
          break;
        case 'node':
          updated.apis = this.nodeParser.parseService(rootPath);
          break;
        case 'python':
          updated.apis = this.pythonParser.parseService(rootPath);
          break;
        case 'java':
        case 'php':
          updated.apis = new NativeApiParser().parseService(rootPath);
          break;
        case 'go':
          updated.apis = this.goParser.parseService(rootPath);
          break;
        default:
          break;
      }
    }

    if (changeSet.affectsDatabase && detectedStack === 'spring-boot') {
      process.stderr.write(`[BCG] Re-analyzing DB schema for ${serviceId}\n`);
      updated.database = this.jpaParser.parseService(rootPath);
    }

    if (changeSet.affectsDependencies) {
      process.stderr.write(`[BCG] Re-analyzing dependencies for ${serviceId}\n`);
      const otherServices = allServiceIds.filter(id => id !== serviceId);
      const newRestDeps = this.dependencyAnalyzer.analyzeDependencies(rootPath, otherServices);

      // F08: Re-detect DB from config fresh (so a datasource rename removes the old entry).
      // Start from scratch for DB deps — re-read config, do NOT carry over old DB deps.
      const freshDbNames = this.dependencyAnalyzer.detectDatabaseUsage(rootPath);
      const freshDbDeps: ServiceDependency[] = freshDbNames.map(dbName => ({
        targetService: dbName,
        type: 'DATABASE' as const,
        evidence: 'Detected from datasource configuration',
      }));

      // If no DB from config and service has entities, infer (same rule as fullAnalysis)
      if (freshDbDeps.length === 0 && updated.database.length > 0) {
        const inferredName = updated.identity.name.replace('-service', '') + '_db';
        freshDbDeps.push({
          targetService: inferredName,
          type: 'DATABASE' as const,
          evidence: 'Inferred from JPA entities',
        });
      }

      // Merge: REST deps + fresh DB deps (deduplication by type:target key)
      const merged = new Map<string, ServiceDependency>();
      for (const dep of [...newRestDeps, ...freshDbDeps]) {
        const key = `${dep.type}:${dep.targetService}`;
        if (!merged.has(key)) merged.set(key, dep);
      }
      updated.dependencies = Array.from(merged.values());
    }

    // Regenerate semantic summary
    if (this.watsonxClient && (changeSet.affectsApi || changeSet.affectsDatabase)) {
      try {
        updated.semanticSummary = await this.watsonxClient.generateServiceSummary(updated);
      } catch {
        // keep old summary
      }
    }

    await this.describeApis(updated);
    this.cache.set(updated, dirtyHash);
    return updated;
  }

  /**
   * Dirty incremental analysis — same commit, but the working tree has changed.
   * Uses `git status --porcelain` (via getDirtyFiles) as the change set instead
   * of a committed git diff. This means the user never has to commit for Bob to
   * notice their edits.
   */
  async dirtyIncrementalAnalysis(
    discovered: DiscoveredService,
    allServiceIds: string[],
    commitHash: string,
    dirtyHash: string
  ): Promise<ServiceContext> {
    const { serviceId, rootPath, branch, repository, detectedStack } = discovered;

    process.stderr.write(`[BCG] Dirty incremental: ${serviceId} @ ${commitHash.slice(0, 7)} dirty=${dirtyHash.slice(0, 7)}\n`);

    const git = new GitAnalyzer(repository);
    const allDirtyFiles = git.getDirtyFiles();

    // Scope to this service's subdirectory (resolve symlinks for correct relative path)
    const _fsD = require('fs') as typeof import('fs');
    const _repoD = (() => { try { return _fsD.realpathSync(repository); } catch { return path.resolve(repository); } })();
    const _rootD = (() => { try { return _fsD.realpathSync(rootPath); } catch { return path.resolve(rootPath); } })();
    const serviceRelPath = path.relative(_repoD, _rootD).replace(/\\/g, '/');
    const prefix = serviceRelPath && !serviceRelPath.startsWith('..') ? serviceRelPath + '/' : '';
    const changedFiles = prefix
      ? allDirtyFiles.filter(f => f.path.startsWith(prefix))
      : allDirtyFiles;

    if (changedFiles.length === 0) {
      // No relevant dirty files for this service — return clean cached version
      const cleanCtx = this.cache.get(serviceId, branch, commitHash, 'clean');
      if (cleanCtx) {
        cleanCtx.status = 'Cached';
        return cleanCtx;
      }
      return this.fullAnalysis(discovered, allServiceIds, dirtyHash);
    }

    // Load the last clean (committed) baseline
    const baseline = this.cache.get(serviceId, branch, commitHash, 'clean');
    if (!baseline) {
      return this.fullAnalysis(discovered, allServiceIds, dirtyHash);
    }

    const hasDtoChange = changedFiles.some(f => f.category === 'DTO');
    let dtoAffectsApi = false;
    if (hasDtoChange) {
      const changedDtoNames = changedFiles
        .filter(f => f.category === 'DTO')
        .map(f => path.basename(f.path, '.java').toLowerCase());
      dtoAffectsApi = baseline.apis.some(api => {
        const reqModel = (api.requestModel ?? '').toLowerCase();
        const resModel = (api.responseModel ?? '').toLowerCase();
        return changedDtoNames.some(dto => reqModel.includes(dto) || resModel.includes(dto));
      });
    }

    const affectsApi = changedFiles.some(f => f.category === 'API') || dtoAffectsApi;
    const affectsDatabase = changedFiles.some(f => f.category === 'ENTITY');
    const affectsDependencies = changedFiles.some(f => ['SERVICE', 'CONFIG'].includes(f.category));

    const updated: ServiceContext = { ...baseline };
    updated.analyzedAt = new Date().toISOString();
    updated.status = 'Changed';

    const nonSpringSourceChanged = detectedStack !== 'spring-boot' &&
      changedFiles.some(f => f.category === 'SERVICE' || f.category === 'API' || f.category === 'CONFIG');
    if (affectsApi || nonSpringSourceChanged) {
      process.stderr.write(`[BCG] Dirty re-analyzing APIs for ${serviceId} (${detectedStack})\n`);
      switch (detectedStack) {
        case 'spring-boot':
          updated.apis = this.apiParser.parseService(rootPath);
          break;
        case 'node':
          updated.apis = this.nodeParser.parseService(rootPath);
          break;
        case 'python':
          updated.apis = this.pythonParser.parseService(rootPath);
          break;
        case 'java':
        case 'php':
          updated.apis = new NativeApiParser().parseService(rootPath);
          break;
        case 'go':
          updated.apis = this.goParser.parseService(rootPath);
          break;
        default:
          break;
      }
    }

    if (affectsDatabase && detectedStack === 'spring-boot') {
      process.stderr.write(`[BCG] Dirty re-analyzing DB schema for ${serviceId}\n`);
      updated.database = this.jpaParser.parseService(rootPath);
    }

    if (affectsDependencies) {
      process.stderr.write(`[BCG] Dirty re-analyzing dependencies for ${serviceId}\n`);
      const otherServices = allServiceIds.filter(id => id !== serviceId);
      updated.dependencies = this.dependencyAnalyzer.analyzeDependencies(rootPath, otherServices);
      this.mergeDatabaseDependencies(updated.dependencies, rootPath, updated.identity.name, updated.database.length > 0);
    }

    if (this.watsonxClient && (affectsApi || affectsDatabase)) {
      try {
        updated.semanticSummary = await this.watsonxClient.generateServiceSummary(updated);
      } catch {
        // keep old summary
      }
    }

    await this.describeApis(updated);
    this.cache.set(updated, dirtyHash);
    return updated;
  }

  /**
   * Detect changes for a specific service and run impact analysis.
   * F03: compare against the stored baseline commit, not the current HEAD.
   */
  async detectAndAnalyzeChanges(serviceId: string, allContexts: ServiceContext[]): Promise<ChangeSet | null> {
    const svc = allContexts.find(s => s.identity.serviceId === serviceId);
    if (!svc) return null;

    const git = new GitAnalyzer(svc.identity.repository);
    const currentCommit = git.getHead(false);
    const currentDirty = git.getDirtyHash([this.cacheDir], svc.identity.rootPath);
    // F03: use the commit stored in the cache as the baseline (not current HEAD)
    const baselineCommit = this.cache.getBaselineCommit(serviceId);

    // F03-before / DIRTY-impact: if no explicit baseline commit exists, fall back to
    // lastAnalyzedCommit for a clean-vs-dirty comparison. This allows detecting
    // uncommitted edits even before any second commit has been made.
    const lastAnalyzedCommit = this.cache.getLastAnalyzedCommit(serviceId);
    const effectiveBaseline = baselineCommit ?? lastAnalyzedCommit;

    if (!effectiveBaseline || !git.isValidCommit(effectiveBaseline) || !git.isValidCommit(currentCommit)) return null;
    if (effectiveBaseline === currentCommit && currentDirty === 'clean') return null;

    const git2 = new GitAnalyzer(svc.identity.repository);
    const committedChanges = effectiveBaseline !== currentCommit
      ? git2.getChangedFiles(effectiveBaseline, currentCommit)
      : [];
    const dirtyFiles = currentDirty !== 'clean' ? git2.getDirtyFiles([this.cacheDir]) : [];

    // F02: scope to this service's path (resolve symlinks before computing relative path)
    const _fsC = require('fs') as typeof import('fs');
    const _repoC = (() => { try { return _fsC.realpathSync(svc.identity.repository); } catch { return path.resolve(svc.identity.repository); } })();
    const _rootC = (() => { try { return _fsC.realpathSync(svc.identity.rootPath); } catch { return path.resolve(svc.identity.rootPath); } })();
    const serviceRelPath = path.relative(_repoC, _rootC).replace(/\\/g, '/');
    const prefix = serviceRelPath && !serviceRelPath.startsWith('..') ? serviceRelPath + '/' : '';
    const committedFiltered = prefix ? committedChanges.filter(f => f.path.startsWith(prefix)) : committedChanges;
    const dirtyFiltered = prefix ? dirtyFiles.filter(f => f.path.startsWith(prefix)) : dirtyFiles;
    const changedFiles = this.mergeChangedFiles(committedFiltered, dirtyFiltered);
    if (changedFiles.length === 0) return null;

    const hasDtoChange = changedFiles.some(f => f.category === 'DTO');
    let dtoAffectsApi = false;
    if (hasDtoChange) {
      const changedDtoNames = changedFiles
        .filter(f => f.category === 'DTO')
        .map(f => path.basename(f.path, '.java').toLowerCase());
      dtoAffectsApi = svc.apis.some(api => {
        const reqModel = (api.requestModel ?? '').toLowerCase();
        const resModel = (api.responseModel ?? '').toLowerCase();
        return changedDtoNames.some(dto => reqModel.includes(dto) || resModel.includes(dto));
      });
    }

    const fieldChanges: NonNullable<ChangeSet['fieldChanges']> = [];
    for (const file of changedFiles.filter(f => f.category === 'DTO' || f.category === 'ENTITY')) {
      const beforeText = git.readFileAt(effectiveBaseline, file.path);
      let afterText = '';
      try { afterText = fs.readFileSync(path.join(svc.identity.repository, file.path), 'utf8'); } catch { /* deleted */ }
      const fields = (text: string) => new Map([...text.matchAll(/(?:private|public|protected)\s+([\w<>?,.]+)\s+(\w+)\s*[;=]/g)].map(m => [m[2], m[1]]));
      const before = fields(beforeText), after = fields(afterText);
      for (const field of new Set([...before.keys(), ...after.keys()])) {
        if (before.get(field) !== after.get(field)) fieldChanges.push({file: file.path, field, before: before.get(field) ?? null, after: after.get(field) ?? null, category: file.category});
      }
    }
    return {
      serviceId,
      fieldChanges,
      oldCommit: effectiveBaseline,
      newCommit: currentCommit,
      changedFiles,
      affectsApi: changedFiles.some(f => f.category === 'API') || dtoAffectsApi || (svc.detectedStack !== 'spring-boot' && changedFiles.some(f => f.category === 'SERVICE')),
      affectsDatabase: changedFiles.some(f => f.category === 'ENTITY'),
      affectsDependencies: changedFiles.some(f => ['SERVICE', 'CONFIG'].includes(f.category)),
    };
  }

  /**
   * Refresh a single specific service without re-analyzing others.
   * F05: targeted refresh — only invalidates and re-parses the target service.
   *
   * The comparison baseline (baselineCommit) is preserved across the refresh so
   * that detectAndAnalyzeChanges / MCP analyze_change can still find the meaningful
   * "before" snapshot after a targeted refresh.
   */
  async refreshService(serviceId: string): Promise<AnalysisResult> {
    if (this.pending) { await this.pending; return this.refreshService(serviceId); }
    this.pending = this.refreshServiceOnce(serviceId);
    try { return await this.pending; } finally { this.pending = null; }
  }

  private async refreshServiceOnce(serviceId: string): Promise<AnalysisResult> {
    // Preserve the baseline before we wipe the cache so detectAndAnalyzeChanges
    // still has a valid "before" side after the fresh analysis writes a new entry.
    const savedBaseline = this.cache.getBaselineCommit(serviceId);
    const savedLastCommit = this.cache.getLastAnalyzedCommit(serviceId);

    // Keep comparison history and immutable prior snapshots during a refresh.

    const discovered = await this.scanner.discoverServices();
    const serviceIds = discovered.map(d => d.serviceId);
    const target = discovered.find(d => d.serviceId === serviceId);

    const stats = { cached: 0, refreshed: 0, failed: 0 };
    const serviceContexts: ServiceContext[] = [];

    // Build repo dirty map (excluding cacheDir to avoid spurious dirty detection)
    const repoDirtyMap = new Map<string, string>();
    for (const svc of discovered) {
      if (svc.isGitRepo && !repoDirtyMap.has(svc.repository)) {
        repoDirtyMap.set(svc.repository, new GitAnalyzer(svc.repository).getDirtyHash([this.cacheDir]));
      }
    }

    for (const svc of discovered) {
      try {
        const repoDirty = svc.isGitRepo ? new GitAnalyzer(svc.repository).getDirtyHash([this.cacheDir], svc.rootPath) : 'clean';
        let ctx: ServiceContext;
        if (svc.serviceId === serviceId && target) {
          // Force re-analyze only this service
          ctx = await this.fullAnalysis(svc, serviceIds, repoDirty);
          stats.refreshed++;
        } else {
          // Use cache for all others
          ctx = await this.analyzeService(svc, serviceIds, false, repoDirty);
          if (ctx.status === 'Cached') stats.cached++;
          else stats.refreshed++;
        }
        serviceContexts.push(ctx);
      } catch (err) {
        process.stderr.write(`[BCG] Failed to refresh ${svc.serviceId}: ${err}\n`);
        stats.failed++;
        serviceContexts.push(this.makeErrorContext(svc, String(err)));
      }
    }

    const graph = this.graphBuilder.build(serviceContexts);

    // Restore the saved baseline so analyze_change still sees the meaningful "before"
    // cache.set advances history only when HEAD changes.

    return { services: serviceContexts, graph, cacheStats: stats };
  }

  getCache(): ContextCache {
    return this.cache;
  }

  getGraphBuilder(): ContextGraphBuilder {
    return this.graphBuilder;
  }

  /**
   * Merge committed and dirty changed-file lists, deduplicating by path
   * (dirty wins over committed when both exist).
   */
  private mergeChangedFiles(
    committed: ReturnType<GitAnalyzer['getChangedFiles']>,
    dirty: ReturnType<GitAnalyzer['getDirtyFiles']>
  ): ReturnType<GitAnalyzer['getChangedFiles']> {
    const map = new Map<string, (typeof committed)[number]>();
    for (const f of committed) map.set(f.path, f);
    for (const f of dirty) map.set(f.path, f); // dirty wins
    return Array.from(map.values());
  }

  /**
   * Helper: merge database dependencies from config into a deps array.
   * If a Map is provided, it will be updated in-place; otherwise the array is modified.
   */
  private mergeDatabaseDependencies(
    dependencies: ServiceDependency[],
    rootPath: string,
    serviceName: string,
    hasEntities: boolean,
    mergedMap?: Map<string, ServiceDependency>
  ): void {
    const dbNames = this.dependencyAnalyzer.detectDatabaseUsage(rootPath);
    const addDb = (dbName: string, evidence: string) => {
      const key = `DATABASE:${dbName}`;
      if (mergedMap) {
        if (!mergedMap.has(key)) {
          mergedMap.set(key, { targetService: dbName, type: 'DATABASE', evidence });
        }
      } else {
        if (!dependencies.find(d => d.targetService === dbName)) {
          dependencies.push({ targetService: dbName, type: 'DATABASE', evidence });
        }
      }
    };

    for (const dbName of dbNames) {
      addDb(dbName, 'Detected from datasource configuration');
    }

    // If no DB from config, infer from entities
    if (hasEntities && !dependencies.find(d => d.type === 'DATABASE') && (!mergedMap || !Array.from(mergedMap.values()).some(d => d.type === 'DATABASE'))) {
      const dbName = serviceName.replace('-service', '') + '_db';
      addDb(dbName, 'Inferred from JPA entities');
    }
  }

  private async describeApis(context: ServiceContext): Promise<void> {
    enrichSchemas(context);
    context.configurationRevision = configurationRevision(context.identity.rootPath);
    context.semanticSummary ??= `[Deterministic] ${context.identity.name}: ${context.detectedStack ?? 'unknown'} service; ${context.apis.length} detected endpoints, ${context.database.length} detected tables.`;
    for (const api of context.apis) {
      if (!api.semanticDescription && this.watsonxClient?.describeApi) {
        try { api.semanticDescription = await this.watsonxClient.describeApi(api.method, api.path, api.requestModel, api.responseModel, context); } catch { /* deterministic fallback */ }
      }
      api.semanticDescription ??= `[Deterministic] ${api.method} ${api.path}`;
    }
  }

  private makeErrorContext(discovered: DiscoveredService, error: string): ServiceContext {
    return {
      identity: {
        serviceId: discovered.serviceId,
        repository: discovered.repository,
        branch: discovered.branch,
        commitHash: discovered.commitHash,
        name: discovered.name,
        rootPath: discovered.rootPath,
      },
      apis: [],
      database: [],
      dependencies: [],
      events: { publishes: [], consumes: [] },
      analyzedAt: new Date().toISOString(),
      fileCount: 0,
      status: 'Error',
      error,
      detectedStack: discovered.detectedStack,
    };
  }
}
