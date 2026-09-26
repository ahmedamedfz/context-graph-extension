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
exports.ContextGraphEngine = void 0;
const path = __importStar(require("path"));
const WorkspaceScanner_1 = require("./scanner/WorkspaceScanner");
const GitAnalyzer_1 = require("./git/GitAnalyzer");
const SpringApiParser_1 = require("./parser/SpringApiParser");
const JpaEntityParser_1 = require("./parser/JpaEntityParser");
const DependencyAnalyzer_1 = require("./parser/DependencyAnalyzer");
const ContextCache_1 = require("./cache/ContextCache");
const ContextGraphBuilder_1 = require("./graph/ContextGraphBuilder");
/**
 * Main orchestrator for the Bob Context Graph analysis pipeline.
 * Coordinates discovery, caching, incremental analysis, and graph building.
 */
class ContextGraphEngine {
    constructor(options) {
        this.watsonxClient = null; // Injected at runtime
        this.cacheDir = options.cacheDir ?? path.join(options.workspaceRoot, '.context-graph-cache');
        this.scanner = new WorkspaceScanner_1.WorkspaceScanner(options.workspaceRoot);
        this.apiParser = new SpringApiParser_1.SpringApiParser();
        this.jpaParser = new JpaEntityParser_1.JpaEntityParser();
        this.dependencyAnalyzer = new DependencyAnalyzer_1.DependencyAnalyzer();
        this.cache = new ContextCache_1.ContextCache(this.cacheDir);
        this.graphBuilder = new ContextGraphBuilder_1.ContextGraphBuilder();
    }
    setWatsonxClient(client) {
        this.watsonxClient = client;
    }
    /**
     * Full analysis run: discover services, check cache, analyze as needed.
     */
    async analyze(forceRefresh = false) {
        const discovered = await this.scanner.discoverServices();
        const stats = { cached: 0, refreshed: 0, failed: 0 };
        const serviceContexts = [];
        const serviceIds = discovered.map(d => d.serviceId);
        for (const svc of discovered) {
            try {
                const ctx = await this.analyzeService(svc, serviceIds, forceRefresh);
                serviceContexts.push(ctx);
                if (ctx.status === 'Cached')
                    stats.cached++;
                else
                    stats.refreshed++;
            }
            catch (err) {
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
    async analyzeService(discovered, allServiceIds, forceRefresh = false) {
        const { serviceId, branch, commitHash } = discovered;
        // Check cache
        if (!forceRefresh && this.cache.isCached(serviceId, branch, commitHash)) {
            const cached = this.cache.get(serviceId, branch, commitHash);
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
    async fullAnalysis(discovered, allServiceIds) {
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
        const context = {
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
            }
            catch {
                // watsonx not available, skip
            }
        }
        this.cache.set(context);
        return context;
    }
    /**
     * Incremental analysis using Git diff.
     */
    async incrementalAnalysis(discovered, allServiceIds, oldCommit) {
        const { serviceId, rootPath, commitHash, branch } = discovered;
        console.log(`[BCG] Incremental analysis: ${serviceId} ${oldCommit.slice(0, 7)} → ${commitHash.slice(0, 7)}`);
        const git = new GitAnalyzer_1.GitAnalyzer(discovered.repository);
        const changedFiles = git.getChangedFiles(oldCommit, commitHash);
        const changeSet = {
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
        const updated = { ...previousContext };
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
            }
            catch {
                // keep old summary
            }
        }
        this.cache.set(updated);
        return updated;
    }
    /**
     * Detect changes for a specific service and run impact analysis.
     */
    async detectAndAnalyzeChanges(serviceId, allContexts) {
        const svc = allContexts.find(s => s.identity.serviceId === serviceId);
        if (!svc)
            return null;
        const git = new GitAnalyzer_1.GitAnalyzer(svc.identity.repository);
        const currentCommit = git.getHead(false);
        const lastCommit = this.cache.getLastAnalyzedCommit(serviceId);
        if (!lastCommit || lastCommit === currentCommit)
            return null;
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
    getCache() {
        return this.cache;
    }
    getGraphBuilder() {
        return this.graphBuilder;
    }
    makeErrorContext(discovered, error) {
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
exports.ContextGraphEngine = ContextGraphEngine;
//# sourceMappingURL=ContextGraphEngine.js.map