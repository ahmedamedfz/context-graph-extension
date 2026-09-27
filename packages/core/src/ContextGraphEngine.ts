import * as path from 'path';
import { WorkspaceScanner } from './scanner/WorkspaceScanner';
import { GitAnalyzer } from './git/GitAnalyzer';
import { SpringApiParser } from './parser/SpringApiParser';
import { JpaEntityParser } from './parser/JpaEntityParser';
import { DependencyAnalyzer } from './parser/DependencyAnalyzer';
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
    this.cache = new ContextCache(this.cacheDir);
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
    // ── 1. Service discovery (with workspace-fingerprint shortcut) ──────────
    const discovered = await this.discoverWithFingerprintCache(forceRefresh);
    const stats = { cached: 0, refreshed: 0, failed: 0 };
    const serviceContexts: ServiceContext[] = [];

    const serviceIds = discovered.map(d => d.serviceId);

    // ── 2. Per-repo HEAD + dirty-hash map ────────────────────────────────────
    // F02: build a per-repository HEAD map so all services in the same repo
    // share the same observed commit and we only call git once per repo.
    const repoHeadMap = new Map<string, string>();
    const repoDirtyMap = new Map<string, string>();
    for (const svc of discovered) {
      if (svc.isGitRepo && !repoHeadMap.has(svc.repository)) {
        const git = new GitAnalyzer(svc.repository);
        repoHeadMap.set(svc.repository, git.getHead(false));
        repoDirtyMap.set(svc.repository, git.getDirtyHash());
      }
    }

    for (const svc of discovered) {
      // F02: override commitHash with the authoritative per-repo HEAD
      const repoHead = repoHeadMap.get(svc.repository);
      const repoDirty = repoDirtyMap.get(svc.repository) ?? 'clean';
      const effective: DiscoveredService = repoHead
        ? { ...svc, commitHash: repoHead }
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
          process.stderr.write(`[BCG] Workspace fingerprint hit — skipping fs scan (${reconstructed.length} services)\n`);
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
      const meta = this.cache.getLastAnalyzedCommit(serviceId);
      if (!meta) return []; // metadata missing — fall back to full scan

      // Load the stored context to get identity + rootPath
      const lastCommit = meta;
      const lastDirty = this.cache.getLastDirtyHash(serviceId);

      // We need any cached file for this service to reconstruct identity.
      // Try the last-known compound key first, then fall back to clean key.
      let ctx = this.cache.get(serviceId, '', lastCommit, lastDirty)
               ?? this.cache.get(serviceId, '', lastCommit, 'clean');

      // Branch is embedded in the filename but not stored separately in the index.
      // We can't enumerate branches cheaply, so we try a branch-independent lookup
      // by scanning for any file matching serviceId_*_commitHash*.json
      if (!ctx) {
        ctx = this.findCachedContextByServiceId(serviceId, lastCommit, lastDirty);
      }

      if (!ctx) return []; // can't reconstruct — fall back to full scan

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
  private findCachedContextByServiceId(serviceId: string, commitHash: string, dirtyHash: string): ServiceContext | null {
    const fs = require('fs') as typeof import('fs');
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'index.json') continue;
        if (!file.startsWith(serviceId + '_')) continue;
        if (!file.includes(commitHash)) continue;
        // Prefer the exact dirty hash slot if available
        const isDirtyMatch = dirtyHash !== 'clean' ? file.includes(dirtyHash) : !file.includes('_') || file.endsWith(`_${commitHash}.json`);
        if (!isDirtyMatch && dirtyHash === 'clean' && !file.endsWith(`_${commitHash}.json`)) continue;
        try {
          const content = fs.readFileSync(require('path').join(this.cacheDir, file), 'utf8');
          return JSON.parse(content) as ServiceContext;
        } catch {
          continue;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

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

    // F10: 'unknown' commitHash means no git — never treat as cached
    const commitIsKnown = commitHash !== 'unknown';

    // ── 1. Exact cache hit (commit + dirty state) ────────────────────────────
    if (!forceRefresh && commitIsKnown && this.cache.isCached(serviceId, branch, commitHash, dirtyHash)) {
      const cached = this.cache.get(serviceId, branch, commitHash, dirtyHash)!;
      cached.status = 'Cached';
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
    if (commitIsKnown && lastAnalyzedCommit && lastAnalyzedCommit !== commitHash && !forceRefresh) {
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

    const fileCount = this.scanner.countFiles(rootPath, ['.java', '.ts', '.js', '.py', '.go']);

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

    // Compute path prefix of the service relative to the repo root
    const repoRoot = repository;
    const serviceRelPath = path.relative(repoRoot, rootPath).replace(/\\/g, '/');
    const prefix = serviceRelPath ? serviceRelPath + '/' : '';

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

    // Build updated context
    const updated: ServiceContext = { ...previousContext };
    updated.identity = { ...previousContext.identity, commitHash, previousCommitHash: oldCommit };
    updated.analyzedAt = new Date().toISOString();
    updated.status = 'Changed';
    updated.detectedStack = detectedStack;

    // Re-analyze only affected sections
    if (changeSet.affectsApi && detectedStack === 'spring-boot') {
      process.stderr.write(`[BCG] Re-analyzing APIs for ${serviceId}\n`);
      updated.apis = this.apiParser.parseService(rootPath);
    }

    if (changeSet.affectsDatabase && detectedStack === 'spring-boot') {
      process.stderr.write(`[BCG] Re-analyzing DB schema for ${serviceId}\n`);
      updated.database = this.jpaParser.parseService(rootPath);
    }

    if (changeSet.affectsDependencies) {
      process.stderr.write(`[BCG] Re-analyzing dependencies for ${serviceId}\n`);
      const otherServices = allServiceIds.filter(id => id !== serviceId);
      const newRestDeps = this.dependencyAnalyzer.analyzeDependencies(rootPath, otherServices);

      // F08: Preserve existing DATABASE dependencies and merge new REST deps
      const existingDbDeps = previousContext.dependencies.filter(d => d.type === 'DATABASE');
      const merged = new Map<string, ServiceDependency>();
      for (const dep of [...existingDbDeps, ...newRestDeps]) {
        const key = `${dep.type}:${dep.targetService}`;
        if (!merged.has(key)) merged.set(key, dep);
      }
      // Re-detect database from config in case it changed
      this.mergeDatabaseDependencies(
        Array.from(merged.values()),
        rootPath,
        updated.identity.name,
        updated.database.length > 0,
        merged
      );
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

    // Scope to this service's subdirectory
    const serviceRelPath = path.relative(repository, rootPath).replace(/\\/g, '/');
    const prefix = serviceRelPath ? serviceRelPath + '/' : '';
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

    if (affectsApi && detectedStack === 'spring-boot') {
      process.stderr.write(`[BCG] Dirty re-analyzing APIs for ${serviceId}\n`);
      updated.apis = this.apiParser.parseService(rootPath);
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
    const currentDirty = git.getDirtyHash();
    // F03: use the commit stored in the cache as the baseline (not current HEAD)
    const baselineCommit = this.cache.getBaselineCommit(serviceId);

    if (!baselineCommit) return null;
    if (baselineCommit === currentCommit && currentDirty === 'clean') return null;

    const git2 = new GitAnalyzer(svc.identity.repository);
    const committedChanges = baselineCommit !== currentCommit
      ? git2.getChangedFiles(baselineCommit, currentCommit)
      : [];
    const dirtyFiles = currentDirty !== 'clean' ? git2.getDirtyFiles() : [];

    // F02: scope to this service's path
    const serviceRelPath = path.relative(svc.identity.repository, svc.identity.rootPath).replace(/\\/g, '/');
    const prefix = serviceRelPath ? serviceRelPath + '/' : '';
    const committedFiltered = prefix ? committedChanges.filter(f => f.path.startsWith(prefix)) : committedChanges;
    const dirtyFiltered = prefix ? dirtyFiles.filter(f => f.path.startsWith(prefix)) : dirtyFiles;
    const changedFiles = this.mergeChangedFiles(committedFiltered, dirtyFiltered);

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

    return {
      serviceId,
      oldCommit: baselineCommit,
      newCommit: currentCommit,
      changedFiles,
      affectsApi: changedFiles.some(f => f.category === 'API') || dtoAffectsApi,
      affectsDatabase: changedFiles.some(f => f.category === 'ENTITY'),
      affectsDependencies: changedFiles.some(f => ['SERVICE', 'CONFIG'].includes(f.category)),
    };
  }

  /**
   * Refresh a single specific service without re-analyzing others.
   * F05: targeted refresh — only invalidates and re-parses the target service.
   */
  async refreshService(serviceId: string): Promise<AnalysisResult> {
    this.cache.invalidate(serviceId);

    const discovered = await this.scanner.discoverServices();
    const serviceIds = discovered.map(d => d.serviceId);
    const target = discovered.find(d => d.serviceId === serviceId);

    const stats = { cached: 0, refreshed: 0, failed: 0 };
    const serviceContexts: ServiceContext[] = [];

    // Build repo dirty map
    const repoDirtyMap = new Map<string, string>();
    for (const svc of discovered) {
      if (svc.isGitRepo && !repoDirtyMap.has(svc.repository)) {
        repoDirtyMap.set(svc.repository, new GitAnalyzer(svc.repository).getDirtyHash());
      }
    }

    for (const svc of discovered) {
      try {
        const repoDirty = repoDirtyMap.get(svc.repository) ?? 'clean';
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
