import * as vscode from 'vscode';
import * as path from 'path';
import { ContextGraphEngine, ServiceContext, SystemContextGraph } from '@bob-context-graph/core';
import { WatsonxRuntime } from '@bob-context-graph/watsonx';
import { SystemOverviewProvider } from './providers/SystemOverviewProvider';
import { ServiceExplorerProvider } from './providers/ServiceExplorerProvider';
import { ImpactPanelProvider } from './providers/ImpactPanelProvider';
import { GraphWebviewProvider } from './webview/GraphWebviewProvider';
import { ImpactReport } from '@bob-context-graph/core';
import { runAiSetup, restoreAiProvider, getStoredProvider } from './ai/AiSetup';

let engine: ContextGraphEngine | null = null;
let watsonxRuntime: WatsonxRuntime | null = null;
let lastAnalysisResult: { services: ServiceContext[]; graph: SystemContextGraph } | null = null;

// F19: track whether an initial analysis has completed (vs. is still in progress)
let analysisCompleted = false;

export async function activate(context: vscode.ExtensionContext) {
  // ── Setup engine ──────────────────────────────────────────────────────
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showWarningMessage('Bob Context Graph: No workspace folder open.');
    return;
  }

  // F20: respect bcg.cacheDir setting
  const config = vscode.workspace.getConfiguration('bcg');
  const cacheDirSetting = config.get<string>('cacheDir');
  const cacheDir = cacheDirSetting
    ? path.isAbsolute(cacheDirSetting)
      ? cacheDirSetting
      : path.join(workspaceRoot, cacheDirSetting)
    : path.join(workspaceRoot, '.context-graph-cache');

  engine = new ContextGraphEngine({ workspaceRoot, cacheDir });

  // ── AI provider setup ─────────────────────────────────────────────────
  watsonxRuntime = await initAiProvider(context.secrets, config);

  if (engine && watsonxRuntime) {
    engine.setWatsonxClient(watsonxRuntime);
  }

  // ── Register tree view providers ──────────────────────────────────────
  const systemOverviewProvider = new SystemOverviewProvider();
  const serviceExplorerProvider = new ServiceExplorerProvider();
  const impactPanelProvider = new ImpactPanelProvider();

  vscode.window.registerTreeDataProvider('bcg.systemOverview', systemOverviewProvider);
  vscode.window.registerTreeDataProvider('bcg.serviceExplorer', serviceExplorerProvider);
  vscode.window.registerTreeDataProvider('bcg.impactPanel', impactPanelProvider);

  // ── Register commands ──────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('bcg.openGraph', () => {
      if (!lastAnalysisResult) {
        vscode.window.showInformationMessage('Bob Context Graph: Analyzing workspace first...');
        runAnalysis(engine!, systemOverviewProvider, serviceExplorerProvider).then(() => {
          if (lastAnalysisResult) {
            GraphWebviewProvider.show(context.extensionUri, lastAnalysisResult.graph, null);
          }
        });
      } else {
        GraphWebviewProvider.show(context.extensionUri, lastAnalysisResult.graph, null);
      }
    }),

    vscode.commands.registerCommand('bcg.analyzeChanges', async () => {
      if (!engine || !lastAnalysisResult) {
        await runAnalysis(engine!, systemOverviewProvider, serviceExplorerProvider);
      }

      if (!lastAnalysisResult) return;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Bob Context Graph: Analyzing changes...', cancellable: false },
        async () => {
          try {
            const impactResults = await analyzeAllChanges(engine!, lastAnalysisResult!.services);
            impactPanelProvider.setImpacts(impactResults);

            if (impactResults.length > 0) {
              const highCount = impactResults.flatMap(r => r.impacts).filter(i => i.severity === 'HIGH').length;
              const msg = highCount > 0
                ? `⚠ Found ${highCount} HIGH severity impact${highCount > 1 ? 's' : ''}. Check Impact Analysis panel.`
                : `Change impact analysis complete. Check Impact Analysis panel.`;
              vscode.window.showInformationMessage(msg);

              // F19: Re-render graph with impact highlighting and push to webview
              if (lastAnalysisResult) {
                const allImpacts = impactResults.flatMap(r => r.impacts);
                const graphBuilder = engine!.getGraphBuilder();
                const highlighted = graphBuilder.applyImpact(lastAnalysisResult.graph, allImpacts);
                // F19: store the highlighted graph so the sidebar is consistent
                lastAnalysisResult = { ...lastAnalysisResult, graph: highlighted };
                GraphWebviewProvider.show(context.extensionUri, highlighted, impactResults[0] ?? null);
              }
            } else {
              vscode.window.showInformationMessage('No changes detected across all services.');
              // F19: push a clean graph (no stale impact highlights)
              if (lastAnalysisResult) {
                GraphWebviewProvider.show(context.extensionUri, lastAnalysisResult.graph, null);
              }
            }
          } catch (err) {
            vscode.window.showErrorMessage(`Change analysis failed: ${err}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('bcg.refreshContext', async () => {
      if (!engine) return;
      await runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider, true);
      // F19: push fresh graph to webview after refresh
      if (lastAnalysisResult) {
        GraphWebviewProvider.show(context.extensionUri, lastAnalysisResult.graph, null);
      }
    }),

    vscode.commands.registerCommand('bcg.refreshAll', async () => {
      if (!engine) return;
      await runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider, true);
      // F19: push fresh graph to webview after refresh
      if (lastAnalysisResult) {
        GraphWebviewProvider.show(context.extensionUri, lastAnalysisResult.graph, null);
      }
    }),

    // ── AI provider configuration command ─────────────────────────────
    vscode.commands.registerCommand('bcg.configureAI', async () => {
      const runtime = await runAiSetup(context.secrets);
      watsonxRuntime = runtime;
      if (engine) {
        if (runtime) {
          engine.setWatsonxClient(runtime);
        }
      }
    })
  );

  // ── Initial analysis on activation ────────────────────────────────────
  runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider)
    .then(() => { analysisCompleted = true; })
    .catch(console.error);
}

/**
 * Determine which AI provider to use on this activation.
 *
 * Flow:
 *  1. Check if there is already a persisted choice (aiProvider config key).
 *  2. If yes  → silently restore it.
 *  3. If none → show the setup wizard so the user can choose.
 *
 * Environment-variable overrides (WATSONX_API_KEY + WATSONX_PROJECT_ID) are
 * still honoured and bypass the wizard entirely — useful for CI / MCP server.
 */
async function initAiProvider(
  secrets: vscode.SecretStorage,
  config: vscode.WorkspaceConfiguration
): Promise<WatsonxRuntime | null> {
  // Legacy env-var / settings override — kept for backward compatibility
  const apiKey = process.env.WATSONX_API_KEY ?? config.get<string>('watsonxApiKey') ?? '';
  const projectId = process.env.WATSONX_PROJECT_ID ?? config.get<string>('watsonxProjectId') ?? '';

  if (apiKey && projectId) {
    const { WatsonxClient } = await import('@bob-context-graph/watsonx');
    const baseUrl = process.env.WATSONX_BASE_URL ?? config.get<string>('watsonxBaseUrl') ?? 'https://us-south.ml.cloud.ibm.com';
    const modelId = process.env.WATSONX_MODEL_ID ?? config.get<string>('watsonxModelId') ?? 'ibm/granite-3-8b-instruct';
    const client = new WatsonxClient({ apiKey, projectId, baseUrl, modelId });
    return new WatsonxRuntime(client);
  }

  const stored = getStoredProvider(config);

  if (stored !== 'none') {
    // Already chose a provider — restore silently
    return restoreAiProvider(secrets, stored);
  }

  // First run — show the wizard
  return runAiSetup(secrets);
}

async function runAnalysis(
  eng: ContextGraphEngine,
  systemProvider: SystemOverviewProvider,
  serviceProvider: ServiceExplorerProvider,
  forceRefresh = false
) {
  // F21: Set analyzing state before starting
  systemProvider.setAnalyzing(true);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'Bob Context Graph: Analyzing...',
    },
    async () => {
      try {
        const result = await eng.analyze(forceRefresh);
        lastAnalysisResult = result;
        systemProvider.setData(result.services, result.cacheStats);
        serviceProvider.setServices(result.services);
      } catch (err) {
        vscode.window.showErrorMessage(`Bob Context Graph analysis failed: ${err}`);
        systemProvider.setError(String(err));
      }
    }
  );
}

async function analyzeAllChanges(
  eng: ContextGraphEngine,
  services: ServiceContext[]
): Promise<ImpactReport[]> {
  const reports: ImpactReport[] = [];

  for (const svc of services) {
    const changeSet = await eng.detectAndAnalyzeChanges(svc.identity.serviceId, services);
    if (!changeSet) continue;

    const relatedServices = services.filter(s => s.identity.serviceId !== svc.identity.serviceId);

    let report: ImpactReport;
    if (watsonxRuntime) {
      report = await watsonxRuntime.analyzeImpact(changeSet, svc, relatedServices);
    } else {
      const { WatsonxRuntime: WR, WatsonxClient: WC } = await import('@bob-context-graph/watsonx');
      const mockClient = new WC({ apiKey: '', projectId: '' });
      const runtime = new WR(mockClient);
      report = await runtime.analyzeImpact(changeSet, svc, relatedServices);
    }

    reports.push(report);
  }

  return reports;
}

function getWorkspaceRoot(): string | undefined {
  const config = vscode.workspace.getConfiguration('bcg');
  const override = config.get<string>('workspaceRoot');
  if (override) return override;

  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.uri.fsPath;
}

export function deactivate() {
  // no-op
}
