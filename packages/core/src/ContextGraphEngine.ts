import * as path from 'path';
import { WorkspaceScanner } from './scanner/WorkspaceScanner';
import { GitAnalyzer } from './git/GitAnalyzer';
import { SpringApiParser } from './parser/SpringApiParser';
import { JpaEntityParser } from './parser/JpaEntityParser';
import { DependencyAnalyzer } from './parser/DependencyAnalyzer';
import { ContextCache } from './cache/ContextCache';
import { ContextGraphBuilder } from './graph/ContextGraphBuilder';
import {
  ServiceContext,
  SystemContextGraph,
  ChangeSet,
  DiscoveredService,
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
 */
export class ContextGraphEngine {
  private scanner: WorkspaceScanner;
  private apiParser: SpringApiParser;
  private jpaParser: JpaEntityParser;
  private dependencyAnalyzer: DependencyAnalyzer;
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
    this.cache = new ContextCache(this.cacheDir);
    this.graphBuilder = new ContextGraphBuilder();
  }

  setWatsonxClient(client: any): void {
    this.watsonxClient = client;
  }

  /**
   * Full analysis run: discover services, check cache, analyze as needed.
   */
  async analyze(forceRefresh = false): Promise<AnalysisResult> {
    const discovered = await this.scanner.discoverServices();
    const stats = { cached: 0, refreshed: 0, failed: 0 };
    const serviceContexts: ServiceContext[] = [];

    const serviceIds = discovered.map(d => d.serviceId);

    for (const svc of discovered) {
      try {
        const ctx = await this.analyzeService(svc, serviceIds, forceRefresh);
        serviceContexts.push(ctx);

        if (ctx.status === 'Cached') stats.cached++;
        else stats.refreshed++;
      } catch (err) {
        console.error(`Failed to analyze ${svc.serviceId}:`, err);
        stats.failed++;
        serviceContexts.push(this.makeErrorContext(svc, String(err)));
      }
    }

    const graph = this.graphBuilder.build(serviceContexts);

    return { services: serviceContexts, graph, cacheStats: stats };
  }

  /**
   * Analyze a single service, using cache when possible.
   */
  async analyzeService(
    discovered: DiscoveredService,
    allServiceIds: string[],
    forceRefresh = false
  ): Promise<ServiceContext> {
    const { serviceId, branch, commitHash } = discovered;

    // Check cache
    if (!forceRefresh && this.cache.isCached(serviceId, branch, commitHash)) {
      const cached = this.cache.get(serviceId, branch, commitHash)!;
      cached.status = 'Cached';
      return cached;
    }

    // Determine if this is incremental or full
    const lastAnalyzedCommit = this.cache.getLastAnalyzedCommit(serviceId);

    if (lastAnalyzedCommit && lastAnalyzedCommit !== commitHash && !forceRefresh) {
      // Incremental analysis
      return this.incrementalAnalysis(discovered, allServiceIds, lastAnalyzedCommit);
    }

    // Full analysis
    return this.fullAnalysis(discovered, allServiceIds);
  }

  /**
   * Full service analysis.
   */
  async fullAnalysis(
    discovered: DiscoveredService,
    allServiceIds: string[]
  ): Promise<ServiceContext> {
    const { serviceId, name, rootPath, repository, branch, commitHash } = discovered;

    console.log(`[BCG] Full analysis: ${serviceId} @ ${commitHash.slice(0, 7)}`);

    // Extract APIs
    const apis = this.apiParser.parseService(rootPath);

    // Extract database schema
    const database = this.jpaParser.parseService(rootPath);

    // Detect dependencies (exclude self)
    const otherServices = allServiceIds.filter(id => id !== serviceId);
    const dependencies = this.dependencyAnalyzer.analyzeDependencies(rootPath, otherServices);

    // Detect database usage from config
    const dbNames = this.dependencyAnalyzer.detectDatabaseUsage(rootPath);
    for (const dbName of dbNames) {
      if (!dependencies.find(d => d.targetService === dbName)) {
        dependencies.push({
          targetService: dbName,
          type: 'DATABASE',
          evidence: 'Detected from datasource configuration',
        });
      }
    }

    // If no DB from config, infer from entities
    if (database.length > 0 && !dependencies.find(d => d.type === 'DATABASE')) {
      const dbName = name.replace('-service', '') + '_db';
      dependencies.push({
        targetService: dbName,
        type: 'DATABASE',
        evidence: 'Inferred from JPA entities',
      });
    }

    const fileCount = this.scanner.countFiles(rootPath);

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
    };

    // Generate semantic summary via watsonx if available
    if (this.watsonxClient) {
      try {
        context.semanticSummary = await this.watsonxClient.generateServiceSummary(context);
      } catch {
        // watsonx not available, skip
      }
    }

    this.cache.set(context);
    return context;
  }

  /**
   * Incremental analysis using Git diff.
   */
  async incrementalAnalysis(
    discovered: DiscoveredService,
    allServiceIds: string[],
    oldCommit: string
  ): Promise<ServiceContext> {
    const { serviceId, rootPath, commitHash, branch } = discovered;

    console.log(`[BCG] Incremental analysis: ${serviceId} ${oldCommit.slice(0, 7)} → ${commitHash.slice(0, 7)}`);

    const git = new GitAnalyzer(discovered.repository);
    const changedFiles = git.getChangedFiles(oldCommit, commitHash);

    const changeSet: ChangeSet = {
      serviceId,
      oldCommit,
      newCommit: commitHash,
      changedFiles,
      affectsApi: changedFiles.some(f => f.category === 'API'),
      affectsDatabase: changedFiles.some(f => f.category === 'ENTITY'),
      affectsDependencies: changedFiles.some(f => ['SERVICE', 'CONFIG'].includes(f.category)),
    };

    // Get previous context as baseline
    const previousContext = this.cache.get(serviceId, branch, oldCommit);

    if (!previousContext) {
      // No baseline - do full analysis
      return this.fullAnalysis(discovered, allServiceIds);
    }

    // Build updated context
    const updated: ServiceContext = { ...previousContext };
    updated.identity = { ...previousContext.identity, commitHash, previousCommitHash: oldCommit };
    updated.analyzedAt = new Date().toISOString();
    updated.status = 'Changed';

    // Re-analyze only affected sections
    if (changeSet.affectsApi) {
      console.log(`[BCG] Re-analyzing APIs for ${serviceId}`);
      updated.apis = this.apiParser.parseService(rootPath);
    }

    if (changeSet.affectsDatabase) {
      console.log(`[BCG] Re-analyzing DB schema for ${serviceId}`);
      updated.database = this.jpaParser.parseService(rootPath);
    }

    if (changeSet.affectsDependencies) {
      console.log(`[BCG] Re-analyzing dependencies for ${serviceId}`);
      const otherServices = allServiceIds.filter(id => id !== serviceId);
      updated.dependencies = this.dependencyAnalyzer.analyzeDependencies(rootPath, otherServices);
    }

    // Regenerate semantic summary
    if (this.watsonxClient && (changeSet.affectsApi || changeSet.affectsDatabase)) {
      try {
        updated.semanticSummary = await this.watsonxClient.generateServiceSummary(updated);
      } catch {
        // keep old summary
      }
    }

    this.cache.set(updated);
    return updated;
  }

  /**
   * Detect changes for a specific service and run impact analysis.
   */
  async detectAndAnalyzeChanges(serviceId: string, allContexts: ServiceContext[]): Promise<ChangeSet | null> {
    const svc = allContexts.find(s => s.identity.serviceId === serviceId);
    if (!svc) return null;

    const git = new GitAnalyzer(svc.identity.repository);
    const currentCommit = git.getHead(false);
    const lastCommit = this.cache.getLastAnalyzedCommit(serviceId);

    if (!lastCommit || lastCommit === currentCommit) return null;

    const changedFiles = git.getChangedFiles(lastCommit, currentCommit);

    return {
      serviceId,
      oldCommit: lastCommit,
      newCommit: currentCommit,
      changedFiles,
      affectsApi: changedFiles.some(f => f.category === 'API'),
      affectsDatabase: changedFiles.some(f => f.category === 'ENTITY'),
      affectsDependencies: changedFiles.some(f => ['SERVICE', 'CONFIG'].includes(f.category)),
    };
  }

  getCache(): ContextCache {
    return this.cache;
  }

  getGraphBuilder(): ContextGraphBuilder {
    return this.graphBuilder;
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
    };
  }
}
