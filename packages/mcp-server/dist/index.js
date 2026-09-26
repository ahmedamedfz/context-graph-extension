#!/usr/bin/env node
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
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const path = __importStar(require("path"));
const core_1 = require("@bob-context-graph/core");
const watsonx_1 = require("@bob-context-graph/watsonx");
// ── Configuration ─────────────────────────────────────────────────────────
const WORKSPACE_ROOT = process.env.BCG_WORKSPACE_ROOT ?? process.cwd();
const CACHE_DIR = process.env.BCG_CACHE_DIR ?? path.join(WORKSPACE_ROOT, '.context-graph-cache');
const WATSONX_API_KEY = process.env.WATSONX_API_KEY ?? '';
const WATSONX_PROJECT_ID = process.env.WATSONX_PROJECT_ID ?? '';
const WATSONX_BASE_URL = process.env.WATSONX_BASE_URL ?? 'https://us-south.ml.cloud.ibm.com';
const WATSONX_MODEL_ID = process.env.WATSONX_MODEL_ID ?? 'ibm/granite-13b-instruct-v2';
// ── Engine setup ──────────────────────────────────────────────────────────
const engine = new core_1.ContextGraphEngine({
    workspaceRoot: WORKSPACE_ROOT,
    cacheDir: CACHE_DIR,
});
let watsonxRuntime = null;
if (WATSONX_API_KEY && WATSONX_PROJECT_ID) {
    const watsonxClient = new watsonx_1.WatsonxClient({
        apiKey: WATSONX_API_KEY,
        projectId: WATSONX_PROJECT_ID,
        baseUrl: WATSONX_BASE_URL,
        modelId: WATSONX_MODEL_ID,
    });
    watsonxRuntime = new watsonx_1.WatsonxRuntime(watsonxClient);
    engine.setWatsonxClient(watsonxRuntime);
    console.error('[BCG] watsonx Runtime enabled');
}
else {
    console.error('[BCG] watsonx not configured — deterministic mode only');
}
// ── In-memory state ───────────────────────────────────────────────────────
let cachedResult = null;
async function getOrAnalyze(force = false) {
    if (!cachedResult || force) {
        cachedResult = await engine.analyze(force);
    }
    return cachedResult;
}
// ── MCP Server ────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: 'bob-context-graph', version: '0.1.0' }, { capabilities: { tools: {} } });
// List tools
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'get_system_context',
            description: 'Returns the full system context: all discovered services, their commit hashes, API counts, database schemas, and service-to-service/database dependency relationships. Use this for architecture overview questions.',
            inputSchema: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
        {
            name: 'get_service_context',
            description: 'Returns detailed context for a specific microservice: identity, current commit, REST APIs, database tables, dependencies, and semantic summary. Prefers cached context.',
            inputSchema: {
                type: 'object',
                properties: {
                    service: {
                        type: 'string',
                        description: 'Service ID or name (e.g. "order-service")',
                    },
                },
                required: ['service'],
            },
        },
        {
            name: 'analyze_change',
            description: 'Detects code changes since the last analysis for a service, runs Git diff, classifies affected areas (API/DB/dependencies), and uses watsonx to reason about blast radius and impact severity.',
            inputSchema: {
                type: 'object',
                properties: {
                    service: {
                        type: 'string',
                        description: 'Service ID or name to analyze changes for',
                    },
                },
                required: ['service'],
            },
        },
        {
            name: 'refresh_context',
            description: 'Forces a fresh analysis of one or all services, bypassing the cache. Use when you need up-to-date context after code changes.',
            inputSchema: {
                type: 'object',
                properties: {
                    service: {
                        type: 'string',
                        description: 'Service ID or name to refresh. Omit to refresh all services.',
                    },
                },
                required: [],
            },
        },
    ],
}));
// Handle tool calls
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'get_system_context':
                return await handleGetSystemContext();
            case 'get_service_context':
                if (!args?.service)
                    throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'service argument required');
                return await handleGetServiceContext(String(args.service));
            case 'analyze_change':
                if (!args?.service)
                    throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'service argument required');
                return await handleAnalyzeChange(String(args.service));
            case 'refresh_context':
                return await handleRefreshContext(args?.service ? String(args.service) : undefined);
            default:
                throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
    }
    catch (err) {
        if (err instanceof types_js_1.McpError)
            throw err;
        throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, String(err));
    }
});
// ── Tool handlers ──────────────────────────────────────────────────────────
async function handleGetSystemContext() {
    const result = await getOrAnalyze();
    const systemSummary = {
        workspaceRoot: WORKSPACE_ROOT,
        serviceCount: result.services.length,
        totalApis: result.services.reduce((n, s) => n + s.apis.length, 0),
        totalTables: result.services.reduce((n, s) => n + s.database.length, 0),
        cacheStats: result.cacheStats,
        services: result.services.map(s => ({
            serviceId: s.identity.serviceId,
            name: s.identity.name,
            branch: s.identity.branch,
            commit: s.identity.commitHash.slice(0, 7),
            status: s.status,
            apiCount: s.apis.length,
            tableCount: s.database.length,
            dependencyCount: s.dependencies.length,
            dependencies: s.dependencies.map(d => ({ target: d.targetService, type: d.type })),
            semanticSummary: s.semanticSummary,
            analyzedAt: s.analyzedAt,
        })),
        graph: {
            nodeCount: result.graph.nodes.length,
            edgeCount: result.graph.edges.length,
            edges: result.graph.edges.map(e => ({
                from: e.source,
                to: e.target,
                type: e.type,
            })),
        },
    };
    return {
        content: [{ type: 'text', text: JSON.stringify(systemSummary, null, 2) }],
    };
}
async function handleGetServiceContext(serviceArg) {
    const result = await getOrAnalyze();
    const svc = result.services.find(s => s.identity.serviceId === serviceArg ||
        s.identity.name === serviceArg ||
        s.identity.serviceId.includes(serviceArg) ||
        serviceArg.includes(s.identity.serviceId));
    if (!svc) {
        const available = result.services.map(s => s.identity.serviceId).join(', ');
        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, `Service "${serviceArg}" not found. Available services: ${available}`);
    }
    const detail = {
        identity: {
            serviceId: svc.identity.serviceId,
            name: svc.identity.name,
            branch: svc.identity.branch,
            commit: svc.identity.commitHash.slice(0, 7),
            fullCommit: svc.identity.commitHash,
            rootPath: svc.identity.rootPath,
        },
        status: svc.status,
        analyzedAt: svc.analyzedAt,
        fileCount: svc.fileCount,
        semanticSummary: svc.semanticSummary,
        apis: svc.apis.map(a => ({
            method: a.method,
            path: a.path,
            controller: a.controller,
            handler: a.handlerMethod,
            requestModel: a.requestModel,
            responseModel: a.responseModel,
            description: a.semanticDescription,
        })),
        database: svc.database.map(t => ({
            table: t.tableName,
            entity: t.entityClass,
            columns: t.columns.map(c => ({
                name: c.name,
                type: c.type,
                pk: c.isPrimaryKey,
            })),
            relationships: t.relationships,
        })),
        dependencies: svc.dependencies,
        events: svc.events,
        estimatedTokenSavings: svc.status === 'Cached'
            ? `~${engine.getCache().estimateTokenSavings(svc).toLocaleString()} tokens avoided (estimate)`
            : undefined,
    };
    return {
        content: [{ type: 'text', text: JSON.stringify(detail, null, 2) }],
    };
}
async function handleAnalyzeChange(serviceArg) {
    const result = await getOrAnalyze();
    const svc = result.services.find(s => s.identity.serviceId === serviceArg ||
        s.identity.name === serviceArg ||
        s.identity.serviceId.includes(serviceArg) ||
        serviceArg.includes(s.identity.serviceId));
    if (!svc) {
        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, `Service "${serviceArg}" not found.`);
    }
    // Detect current HEAD and compare with cached
    const git = new core_1.GitAnalyzer(svc.identity.rootPath);
    const currentCommit = git.getHead(false);
    const lastCommit = engine.getCache().getLastAnalyzedCommit(svc.identity.serviceId);
    if (!lastCommit) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        serviceId: svc.identity.serviceId,
                        message: 'No previous analysis found. Run refresh_context to generate initial context.',
                    }),
                },
            ],
        };
    }
    if (lastCommit === currentCommit) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        serviceId: svc.identity.serviceId,
                        message: 'No changes detected since last analysis.',
                        commit: currentCommit.slice(0, 7),
                        status: 'No changes',
                    }),
                },
            ],
        };
    }
    // Get changed files
    const changedFiles = git.getChangedFiles(lastCommit, currentCommit);
    const changeSet = {
        serviceId: svc.identity.serviceId,
        oldCommit: lastCommit,
        newCommit: currentCommit,
        changedFiles,
        affectsApi: changedFiles.some(f => f.category === 'API'),
        affectsDatabase: changedFiles.some(f => f.category === 'ENTITY'),
        affectsDependencies: changedFiles.some(f => ['SERVICE', 'CONFIG'].includes(f.category)),
    };
    // Run impact analysis
    const relatedServices = result.services.filter(s => s.identity.serviceId !== svc.identity.serviceId);
    let impactReport;
    if (watsonxRuntime) {
        impactReport = await watsonxRuntime.analyzeImpact(changeSet, svc, relatedServices);
    }
    else {
        const { WatsonxRuntime: WR } = await Promise.resolve().then(() => __importStar(require('@bob-context-graph/watsonx')));
        const { WatsonxClient: WC } = await Promise.resolve().then(() => __importStar(require('@bob-context-graph/watsonx')));
        const mockClient = new WC({ apiKey: '', projectId: '' });
        const runtime = new WR(mockClient);
        impactReport = await runtime.analyzeImpact(changeSet, svc, relatedServices);
    }
    const response = {
        serviceId: svc.identity.serviceId,
        change: {
            oldCommit: lastCommit.slice(0, 7),
            newCommit: currentCommit.slice(0, 7),
            changedFileCount: changedFiles.length,
            affectedAreas: {
                api: changeSet.affectsApi,
                database: changeSet.affectsDatabase,
                dependencies: changeSet.affectsDependencies,
            },
            changedFiles: changedFiles.slice(0, 20).map(f => ({
                path: f.path,
                category: f.category,
                changeType: f.changeType,
            })),
        },
        impactReport,
    };
    return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
}
async function handleRefreshContext(serviceArg) {
    if (serviceArg) {
        // Refresh specific service
        const result = await getOrAnalyze();
        const discovered = result.services.find(s => s.identity.serviceId === serviceArg ||
            s.identity.name === serviceArg ||
            s.identity.serviceId.includes(serviceArg));
        if (!discovered) {
            throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, `Service "${serviceArg}" not found.`);
        }
        engine.getCache().invalidate(discovered.identity.serviceId);
        cachedResult = null;
        const fresh = await getOrAnalyze(true);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: `Refreshed context for ${serviceArg}`,
                        stats: fresh.cacheStats,
                    }),
                },
            ],
        };
    }
    // Refresh all
    cachedResult = null;
    const fresh = await getOrAnalyze(true);
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    message: 'Refreshed all service contexts',
                    stats: fresh.cacheStats,
                    services: fresh.services.map(s => ({
                        serviceId: s.identity.serviceId,
                        status: s.status,
                        commit: s.identity.commitHash.slice(0, 7),
                    })),
                }),
            },
        ],
    };
}
// ── Start ────────────────────────────────────────────────────────────────
async function main() {
    console.error(`[BCG] Starting MCP server`);
    console.error(`[BCG] Workspace: ${WORKSPACE_ROOT}`);
    console.error(`[BCG] Cache: ${CACHE_DIR}`);
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('[BCG] MCP server running on stdio');
}
main().catch(err => {
    console.error('[BCG] Fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map