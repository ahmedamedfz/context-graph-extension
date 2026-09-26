import * as vscode from 'vscode';
import * as path from 'path';
import { SystemContextGraph, ImpactReport } from '@bob-context-graph/core';
import { getGraphHtml } from './graphHtml';

export class GraphWebviewProvider {
  private static currentPanel: vscode.WebviewPanel | undefined;

  static show(
    extensionUri: vscode.Uri,
    graph: SystemContextGraph,
    impactReport: ImpactReport | null
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (GraphWebviewProvider.currentPanel) {
      GraphWebviewProvider.currentPanel.reveal(column);
      GraphWebviewProvider.currentPanel.webview.postMessage({
        type: 'update',
        graph: graphToVisualization(graph),
        impactReport,
      });
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'bcg.graph',
      'Bob Context Graph',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    GraphWebviewProvider.currentPanel = panel;

    panel.webview.html = getGraphHtml(graphToVisualization(graph), impactReport);

    panel.onDidDispose(() => {
      GraphWebviewProvider.currentPanel = undefined;
    });

    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'nodeSelected') {
        // Handle node click — could show details in status bar or sidebar
        console.log('[BCG] Node selected:', msg.nodeId);
      }
    });
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
    return { name: db.name, tableCount: db.tables?.length ?? 0, owner: db.ownerServiceId };
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
  };
}
