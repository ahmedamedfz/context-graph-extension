import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { SystemContextGraph, ImpactReport } from '@bob-context-graph/core';
import { getGraphHtml } from './graphHtml';

export class GraphWebviewProvider {
  private static currentPanel: vscode.WebviewPanel | undefined;

  static update(graph: SystemContextGraph, impactReport: ImpactReport | null) {
    this.currentPanel?.webview.postMessage({type: 'update', graph: graphToVisualization(graph), impactReport});
  }

  /**
   * Show or update the graph webview.
   * F22: nonce is generated per show() call for CSP.
   * F19: always sends updated data via postMessage so the graph follows refresh.
   */
  static show(
    extensionUri: vscode.Uri,
    graph: SystemContextGraph,
    impactReport: ImpactReport | null
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const vizData = graphToVisualization(graph);

    if (GraphWebviewProvider.currentPanel) {
      // F19: update existing panel — sends new data so it always follows refresh
      GraphWebviewProvider.currentPanel.reveal(column);
      GraphWebviewProvider.currentPanel.webview.postMessage({
        type: 'update',
        graph: vizData,
        impactReport,
      });
      return;
    }

    // Generate a nonce for this panel's CSP
    const nonce = crypto.randomBytes(16).toString('base64');

    const panel = vscode.window.createWebviewPanel(
      'bcg.graph',
      'Bob Context Graph',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [],
        retainContextWhenHidden: true,
      }
    );

    GraphWebviewProvider.currentPanel = panel;

    // F22: pass nonce so the HTML's CSP script-src matches the script tag's nonce
    panel.webview.html = getGraphHtml(vizData, impactReport, nonce);

    panel.onDidDispose(() => {
      GraphWebviewProvider.currentPanel = undefined;
    });

    // Send initial data via postMessage once the webview is ready
    // (a short delay ensures the webview's message listener is registered)
    setTimeout(() => {
      panel.webview.postMessage({
        type: 'update',
        graph: vizData,
        impactReport,
      });
    }, 200);

    // F18: dispatch webview messages to the appropriate VS Code command
    panel.webview.onDidReceiveMessage(
      async (msg: { type: string; nodeId?: string; service?: string }) => {
        switch (msg.type) {
          case 'nodeSelected':
            // Node click — no-op for now
            break;
          case 'analyzeChanges':
            // F18: delegate to the same command used by the sidebar button
            await vscode.commands.executeCommand('bcg.analyzeChanges');
            break;
          default:
            // Safely ignore unrecognized messages
            break;
        }
      },
      undefined,
      []
    );
  }
}

function graphToVisualization(graph: SystemContextGraph): object {
  return {
    nodes: graph.nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
      impactSeverity: n.impactSeverity,
      impactReason: n.impactReason,
      data: summarizeData(n),
    })),
    edges: graph.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      label: e.label,
    })),
    generatedAt: graph.generatedAt,
  };
}

function summarizeData(node: any): object {
  if (node.type === 'DATABASE') {
    const db = node.data as any;
    return { name: db.name, tableCount: db.tables?.length ?? 0, owner: db.ownerServiceId, tables: db.tables };
  }
  const svc = node.data as any;
  return {
    serviceId: svc?.identity?.serviceId,
    commit: svc?.identity?.commitHash?.slice(0, 7),
    branch: svc?.identity?.branch,
    apiCount: svc?.apis?.length ?? 0,
    tableCount: svc?.database?.length ?? 0,
    dependencyCount: svc?.dependencies?.length ?? 0,
    status: svc?.status,
    analyzedAt: svc?.analyzedAt,
    semanticSummary: svc?.semanticSummary,
    apis: svc?.apis ?? [],
    tables: svc?.database ?? [],
    dependencies: svc?.dependencies ?? [],
    coverage: svc?.coverage,
  };
}
