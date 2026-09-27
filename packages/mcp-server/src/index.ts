#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import * as fs from 'fs';
import { ContextGraphEngine, ContextGraphBuilder, GitAnalyzer, ChangeSet } from '@bob-context-graph/core';
import { WatsonxClient, WatsonxRuntime } from '@bob-context-graph/watsonx';

// ── Configuration ─────────────────────────────────────────────────────────

const WORKSPACE_ROOT = process.env.BCG_WORKSPACE_ROOT ?? process.cwd();
const CACHE_DIR = process.env.BCG_CACHE_DIR ?? path.join(WORKSPACE_ROOT, '.context-graph-cache');
const WATSONX_API_KEY = process.env.WATSONX_API_KEY ?? '';
const WATSONX_PROJECT_ID = process.env.WATSONX_PROJECT_ID ?? '';
const WATSONX_BASE_URL = process.env.WATSONX_BASE_URL ?? 'https://us-south.ml.cloud.ibm.com';
const WATSONX_MODEL_ID = process.env.WATSONX_MODEL_ID ?? 'ibm/granite-13b-instruct-v2';

// ── Engine setup ──────────────────────────────────────────────────────────

const engine = new ContextGraphEngine({
  workspaceRoot: WORKSPACE_ROOT,
  cacheDir: CACHE_DIR,
});

let watsonxRuntime: WatsonxRuntime | null = null;

if (WATSONX_API_KEY && WATSONX_PROJECT_ID) {
  const watsonxClient = new WatsonxClient({
    apiKey: WATSONX_API_KEY,
    projectId: WATSONX_PROJECT_ID,
    baseUrl: WATSONX_BASE_URL,
    modelId: WATSONX_MODEL_ID,
  });
  watsonxRuntime = new WatsonxRuntime(watsonxClient);
  engine.setWatsonxClient(watsonxRuntime);
  console.error('[BCG] watsonx Runtime enabled');
} else {
  console.error('[BCG] watsonx not configured — deterministic mode only');
}

// ── In-memory state ───────────────────────────────────────────────────────

let cachedResult: Awaited<ReturnType<typeof engine.analyze>> | null = null;

/**
 * Per-repo fingerprint snapshot taken at the last in-memory cache fill.
 * Stores both HEAD commit and dirty hash so uncommitted edits trigger re-analysis.
 */
interface RepoFingerprint {
  head: string;
  dirty: string;
}
let lastRepoFingerprints = new Map<string, RepoFingerprint>();

/**
 * F04 + dirty: Check per-repo HEAD + dirty-state fingerprint before returning cachedResult.
 * If any repo's HEAD has advanced OR the dirty-tree hash has changed, re-analyze.
 * This means uncommitted edits are always detected without requiring a commit.
 */
async function getOrAnalyze(force = false) {
  cachedResult = await engine.analyze(force);
  return cachedResult;
}

async function captureRepoFingerprints(
  result: Awaited<ReturnType<typeof engine.analyze>>
): Promise<Map<string, RepoFingerprint>> {
  const { GitAnalyzer } = await import('@bob-context-graph/core');
  const map = new Map<string, RepoFingerprint>();
  for (const svc of result.services) {
    const repo = svc.identity.repository;
    if (map.has(repo)) continue;
    try {
      const git = new GitAnalyzer(repo);
      map.set(repo, { head: git.getHead(false), dirty: git.getDirtyHash() });
    } catch {
      map.set(repo, { head: svc.identity.commitHash, dirty: 'clean' });
    }
  }
  return map;
}

// ── MCP Server ────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'bob-context-graph', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_system_context',
      description:
        'Returns the full system context: all discovered services, their commit hashes, API counts, database schemas, and service-to-service/database dependency relationships. Use this for architecture overview questions.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_service_context',
      description:
        'Returns detailed context for a specific microservice: identity, current commit, REST APIs, database tables, dependencies, and semantic summary. Prefers cached context.',
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
      description:
        'Detects code changes since the last analysis for a service, runs Git diff, classifies affected areas (API/DB/dependencies), and uses watsonx to reason about blast radius and impact severity.',
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
      description:
        'Forces a fresh analysis of one or all services, bypassing the cache. Use when you need up-to-date context after code changes.',
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
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_system_context':
        return await handleGetSystemContext();

      case 'get_service_context':
        if (!args?.service) throw new McpError(ErrorCode.InvalidParams, 'service argument required');
        return await handleGetServiceContext(String(args.service));

      case 'analyze_change':
        if (!args?.service) throw new McpError(ErrorCode.InvalidParams, 'service argument required');
        return await handleAnalyzeChange(String(args.service));

      case 'refresh_context':
        return await handleRefreshContext(args?.service ? String(args.service) : undefined);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    throw new McpError(ErrorCode.InternalError, String(err));
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

async function handleGetServiceContext(serviceArg: string) {
  const result = await getOrAnalyze();
  const svc = resolveService(serviceArg, result.services);

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
    coverage: svc.coverage,
    models: svc.models,
    apis: svc.apis.map(a => ({
      method: a.method,
      path: a.path,
      controller: a.controller,
      handler: a.handlerMethod,
      requestModel: a.requestModel,
      responseModel: a.responseModel,
      description: a.semanticDescription,
      requestSchema: a.requestSchema,
      responseSchema: a.responseSchema,
      provenance: a.provenance,
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
    estimatedTokenSavings:
      svc.status === 'Cached'
        ? `~${engine.getCache().estimateTokenSavings(svc).toLocaleString()} tokens avoided (estimate)`
        : undefined,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(detail, null, 2) }],
  };
}

async function handleAnalyzeChange(serviceArg: string) {
  // F03: get context WITHOUT advancing the comparison baseline.
  // getOrAnalyze() already has an up-to-date in-memory snapshot; calling it here
  // does NOT re-index, so the baselineCommit stored in the cache is unchanged.
  const result = await getOrAnalyze();
  const svc = resolveService(serviceArg, result.services);

  const changeSet = await engine.detectAndAnalyzeChanges(svc.identity.serviceId, result.services);
  if (!changeSet) return {content: [{type: 'text', text: JSON.stringify({serviceId: svc.identity.serviceId, status: 'No changes', message: 'No changes detected in this service.'})}]};
  const {oldCommit: effectiveBaseline, newCommit: currentCommit, changedFiles} = changeSet;
  const currentDirty = new GitAnalyzer(svc.identity.repository).getDirtyHash([CACHE_DIR], svc.identity.rootPath);

  // Run impact analysis
  const relatedServices = result.services.filter(s => s.identity.serviceId !== svc.identity.serviceId);
  let impactReport;

  if (watsonxRuntime) {
    impactReport = await watsonxRuntime.analyzeImpact(changeSet, svc, relatedServices);
  } else {
    const { WatsonxRuntime: WR } = await import('@bob-context-graph/watsonx');
    const { WatsonxClient: WC } = await import('@bob-context-graph/watsonx');
    const mockClient = new WC({ apiKey: '', projectId: '' });
    const runtime = new WR(mockClient);
    impactReport = await runtime.analyzeImpact(changeSet, svc, relatedServices);
  }

  const response = {
    serviceId: svc.identity.serviceId,
    change: {
      oldCommit: effectiveBaseline.slice(0, 7),
      newCommit: currentCommit.slice(0, 7),
      dirtyState: currentDirty !== 'clean' ? 'dirty' : 'clean',
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

async function handleRefreshContext(serviceArg?: string) {
  if (serviceArg) {
    // F05: targeted refresh — only re-analyze the specific service
    const result = await getOrAnalyze();
    const target = resolveService(serviceArg, result.services);

    // Use the engine's targeted refresh method
    const fresh = await engine.refreshService(target.identity.serviceId);
    cachedResult = fresh;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: `Refreshed context for ${target.identity.serviceId}`,
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

/**
 * F23: Strict service resolver — reject ambiguous short names.
 * Returns the matched service or throws McpError with candidate list.
 */
function resolveService(serviceArg: string, services: typeof cachedResult extends null ? never : NonNullable<typeof cachedResult>['services']): NonNullable<typeof cachedResult>['services'][number] {
  // 1. Exact canonical ID match
  const exactId = services.find(s => s.identity.serviceId === serviceArg);
  if (exactId) return exactId;

  // 2. Exact name match
  const exactNames = services.filter(s => s.identity.name === serviceArg);
  if (exactNames.length === 1) return exactNames[0];
  if (exactNames.length > 1) throw new McpError(ErrorCode.InvalidParams, `Ambiguous service: ${exactNames.map(s => s.identity.serviceId).join(', ')}`);

  // 3. Unique prefix/substring match — only if unambiguous
  const partialMatches = services.filter(
    s =>
      s.identity.serviceId.includes(serviceArg) ||
      s.identity.name.includes(serviceArg)
  );

  if (partialMatches.length === 1) return partialMatches[0];

  if (partialMatches.length > 1) {
    const candidates = partialMatches.map(s => s.identity.serviceId).join(', ');
    throw new McpError(
      ErrorCode.InvalidParams,
      `Ambiguous service name "${serviceArg}". Matching candidates: [${candidates}]. Please use an exact service ID.`
    );
  }

  const available = services.map(s => s.identity.serviceId).join(', ');
  throw new McpError(
    ErrorCode.InvalidParams,
    `Service "${serviceArg}" not found. Available: [${available}]`
  );
}

// ── Start ────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[BCG] Starting MCP server`);
  console.error(`[BCG] Workspace: ${WORKSPACE_ROOT}`);
  console.error(`[BCG] Cache: ${CACHE_DIR}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[BCG] MCP server running on stdio');
}

main().catch(err => {
  console.error('[BCG] Fatal:', err);
  process.exit(1);
});
