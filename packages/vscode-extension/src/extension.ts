import * as vscode from 'vscode';
import * as path from 'path';
import { ContextGraphEngine, ServiceContext, SystemContextGraph } from '@bob-context-graph/core';
import { WatsonxClient, WatsonxRuntime } from '@bob-context-graph/watsonx';
import { SystemOverviewProvider } from './providers/SystemOverviewProvider';
import { ServiceExplorerProvider } from './providers/ServiceExplorerProvider';
import { ImpactPanelProvider } from './providers/ImpactPanelProvider';
import { GraphWebviewProvider } from './webview/GraphWebviewProvider';
import { ImpactReport } from '@bob-context-graph/core';

let engine: ContextGraphEngine | null = null;
let watsonxRuntime: WatsonxRuntime | null = null;
let lastAnalysisResult: { services: ServiceContext[]; graph: SystemContextGraph } | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('[BCG] Extension activating');

  // ── Setup engine ──────────────────────────────────────────────────────
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showWarningMessage('Bob Context Graph: No workspace folder open.');
    return;
  }

  const cacheDir = path.join(workspaceRoot, '.context-graph-cache');
  engine = new ContextGraphEngine({ workspaceRoot, cacheDir });

  // Setup watsonx if configured
  const apiKey = process.env.WATSONX_API_KEY ?? '';
  const projectId = process.env.WATSONX_PROJECT_ID ?? '';
  if (apiKey && projectId) {
    const client = new WatsonxClient({ apiKey, projectId });
    watsonxRuntime = new WatsonxRuntime(client);
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

              // Re-render graph with impact highlighting
              if (lastAnalysisResult) {
                const allImpacts = impactResults.flatMap(r => r.impacts);
                const graphBuilder = engine!.getGraphBuilder();
                const highlighted = graphBuilder.applyImpact(lastAnalysisResult.graph, allImpacts);
                GraphWebviewProvider.show(context.extensionUri, highlighted, impactResults[0] ?? null);
              }
            } else {
              vscode.window.showInformationMessage('No changes detected across all services.');
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
    }),

    vscode.commands.registerCommand('bcg.refreshAll', async () => {
      if (!engine) return;
      await runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider, true);
    })
  );

  // ── Initial analysis on activation ────────────────────────────────────
  runAnalysis(engine, systemOverviewProvider, serviceExplorerProvider).catch(console.error);

  console.log('[BCG] Extension activated');
}

async function runAnalysis(
  eng: ContextGraphEngine,
  systemProvider: SystemOverviewProvider,
  serviceProvider: ServiceExplorerProvider,
  forceRefresh = false
) {
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
      const { WatsonxRuntime: WR } = await import('@bob-context-graph/watsonx');
      const { WatsonxClient: WC } = await import('@bob-context-graph/watsonx');
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
  console.log('[BCG] Extension deactivated');
}
