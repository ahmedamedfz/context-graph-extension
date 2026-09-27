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
let aiTask: Promise<void> = Promise.resolve();
let configuringAI = false;
let disposed = false;
let changesRunning = false;

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

  disposed = false;
  const bundleDir = path.join(context.extensionPath, 'resources', 'granite');

  // ── Register tree view providers ──────────────────────────────────────
  const systemOverviewProvider = new SystemOverviewProvider();
  const serviceExplorerProvider = new ServiceExplorerProvider();
  const impactPanelProvider = new ImpactPanelProvider();

  vscode.window.registerTreeDataProvider('bcg.systemOverview', systemOverviewProvider);
  vscode.window.registerTreeDataProvider('bcg.serviceExplorer', serviceExplorerProvider);
  vscode.window.registerTreeDataProvider('bcg.impactPanel', impactPanelProvider);

  const replaceAI = (factory: () => Promise<WatsonxRuntime | null | undefined>) => {
    aiTask = aiTask.then(async () => {
      if (disposed) return;
      configuringAI = true;
      try {
        const runtime = await factory();
        if (disposed) { runtime?.dispose(); return; }
        if (runtime === undefined) return; // dismissed wizard keeps the active provider
        watsonxRuntime?.dispose();
        watsonxRuntime = runtime;
        engine?.setWatsonxClient(runtime);
        if (engine) await runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider, true);
      } finally { configuringAI = false; }
    }).catch(err => { vscode.window.showWarningMessage(`AI setup failed: ${String(err)}`); });
    return aiTask;
  };

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
      if (changesRunning) return;
      changesRunning = true;
      try {
      if (!engine) return;
      await runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider);

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
      } finally { changesRunning = false; }
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
    vscode.commands.registerCommand('bcg.configureAI', () => replaceAI(() => runAiSetup(context.secrets, bundleDir)))
  );

  // Views and commands are registered before optional model loading or setup prompts.
  await runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider);
  void replaceAI(() => initAiProvider(context.secrets, config, bundleDir));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (engine) void runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider);
    }, 500);
  };
  let activeWatchers: vscode.Disposable[] = [];
  const watch = (root: string, cache: string) => {
    activeWatchers.forEach(w => w.dispose());
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*'));
    const onSourceChange = (uri: vscode.Uri) => {
      const rel = path.relative(cache, uri.fsPath);
      if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return;
      if (/(?:^|[/\\])(?:node_modules|dist|target|build)(?:[/\\]|$)/.test(uri.fsPath)) return;
      refresh();
    };
    const gitWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/.git/{HEAD,index,refs/**}'));
    activeWatchers = [watcher, gitWatcher, watcher.onDidChange(onSourceChange), watcher.onDidCreate(onSourceChange), watcher.onDidDelete(onSourceChange), gitWatcher.onDidChange(refresh), gitWatcher.onDidCreate(refresh), gitWatcher.onDidDelete(refresh)];
  };
  watch(workspaceRoot, cacheDir);
  context.subscriptions.push({dispose: () => {disposed = true; activeWatchers.forEach(w => w.dispose()); if (timer) clearTimeout(timer); watsonxRuntime?.dispose();}});
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async event => {
    if (!configuringAI && ['aiProvider', 'watsonxBaseUrl', 'watsonxModelId'].some(key => event.affectsConfiguration('bcg.' + key))) {
      await replaceAI(() => restoreAiProvider(context.secrets, getStoredProvider(vscode.workspace.getConfiguration('bcg')), bundleDir));
    }
    if (['workspaceRoot', 'cacheDir'].some(key => event.affectsConfiguration('bcg.' + key))) {
      const root = getWorkspaceRoot();
      if (root) {
        const dir = vscode.workspace.getConfiguration('bcg').get<string>('cacheDir');
        engine = new ContextGraphEngine({workspaceRoot: root, cacheDir: dir ? path.resolve(root, dir) : undefined});
        engine.setWatsonxClient(watsonxRuntime);
        watch(root, dir ? path.resolve(root, dir) : path.join(root, '.context-graph-cache'));
        await runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider);
      }
    }
  }));
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
  config: vscode.WorkspaceConfiguration,
  bundleDir: string
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

  const choice = config.inspect<string>('aiProvider');
  if (stored !== 'none' || choice?.globalValue !== undefined || choice?.workspaceValue !== undefined) {
    // Already chose a provider — restore silently
    return restoreAiProvider(secrets, stored, bundleDir);
  }

  // First run — show the wizard
  return (await runAiSetup(secrets, bundleDir)) ?? null;
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
        if (disposed || eng !== engine) return;
        lastAnalysisResult = result;
        systemProvider.setData(result.services, result.cacheStats);
        serviceProvider.setServices(result.services);
        GraphWebviewProvider.update(result.graph, null);
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
  disposed = true;
  watsonxRuntime?.dispose();
}
