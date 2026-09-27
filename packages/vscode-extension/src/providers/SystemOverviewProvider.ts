import * as vscode from 'vscode';
import { ServiceContext } from '@bob-context-graph/core';

type CacheStats = { cached: number; refreshed: number; failed: number };
type State = 'idle' | 'analyzing' | 'ready' | 'empty' | 'error';

/**
 * F21: Explicit state machine — idle / analyzing / ready / empty / error
 * instead of using service count === 0 as a proxy for "loading".
 */
export class SystemOverviewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private services: ServiceContext[] = [];
  private cacheStats: CacheStats = { cached: 0, refreshed: 0, failed: 0 };
  private state: State = 'idle';
  private errorMessage = '';

  setAnalyzing(analyzing: boolean) {
    this.state = analyzing ? 'analyzing' : this.state;
    this._onDidChangeTreeData.fire();
  }

  setData(services: ServiceContext[], stats: CacheStats) {
    this.services = services;
    this.cacheStats = stats;
    // F21: distinguish empty result from still-loading
    this.state = services.length === 0 ? 'empty' : 'ready';
    this._onDidChangeTreeData.fire();
  }

  setError(message: string) {
    this.errorMessage = message;
    this.state = 'error';
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      return this.buildRootItems();
    }
    return [];
  }

  private buildRootItems(): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];

    // F21: Use explicit state, not service count, to drive the UI
    switch (this.state) {
      case 'idle': {
        const idle = new vscode.TreeItem('Bob Context Graph ready', vscode.TreeItemCollapsibleState.None);
        idle.iconPath = new vscode.ThemeIcon('circle-outline');
        return [idle];
      }
      case 'analyzing': {
        const analyzing = new vscode.TreeItem('Analyzing workspace...', vscode.TreeItemCollapsibleState.None);
        analyzing.iconPath = new vscode.ThemeIcon('loading~spin');
        return [analyzing];
      }
      case 'error': {
        const err = new vscode.TreeItem(`Error: ${this.errorMessage}`, vscode.TreeItemCollapsibleState.None);
        err.iconPath = new vscode.ThemeIcon('error');
        err.tooltip = this.errorMessage;
        return [err];
      }
      case 'empty': {
        // F21: Analysis completed but found 0 services — not an endless spinner
        const empty = new vscode.TreeItem('No supported services found', vscode.TreeItemCollapsibleState.None);
        empty.iconPath = new vscode.ThemeIcon('info');
        empty.tooltip = 'No Spring Boot, Node.js, Python, or Go services were detected in this workspace.';
        items.push(empty);
        this.addActionButtons(items);
        return items;
      }
    }

    // 'ready' state — show full summary
    const apiCount = this.services.reduce((n, s) => n + s.apis.length, 0);
    const dbCount = new Set(
      this.services.flatMap(s => s.dependencies.filter(d => d.type === 'DATABASE').map(d => d.targetService))
    ).size;

    const summary = new vscode.TreeItem(
      `${this.services.length} Services · ${apiCount} APIs · ${dbCount} Databases`,
      vscode.TreeItemCollapsibleState.None
    );
    summary.iconPath = new vscode.ThemeIcon('server-environment');
    summary.contextValue = 'system-summary';
    items.push(summary);

    const cacheItem = new vscode.TreeItem(
      `Cache: ✓ ${this.cacheStats.cached} cached · ↺ ${this.cacheStats.refreshed} refreshed`,
      vscode.TreeItemCollapsibleState.None
    );
    cacheItem.iconPath = new vscode.ThemeIcon('database');
    items.push(cacheItem);

    this.addActionButtons(items);

    return items;
  }

  private addActionButtons(items: vscode.TreeItem[]) {
    const graphBtn = new vscode.TreeItem('Open System Graph', vscode.TreeItemCollapsibleState.None);
    graphBtn.command = { command: 'bcg.openGraph', title: 'Open System Graph' };
    graphBtn.iconPath = new vscode.ThemeIcon('type-hierarchy');
    items.push(graphBtn);

    const analyzeBtn = new vscode.TreeItem('Analyze Changes', vscode.TreeItemCollapsibleState.None);
    analyzeBtn.command = { command: 'bcg.analyzeChanges', title: 'Analyze Changes' };
    analyzeBtn.iconPath = new vscode.ThemeIcon('diff');
    items.push(analyzeBtn);

    const refreshBtn = new vscode.TreeItem('Refresh Context', vscode.TreeItemCollapsibleState.None);
    refreshBtn.command = { command: 'bcg.refreshAll', title: 'Refresh Context' };
    refreshBtn.iconPath = new vscode.ThemeIcon('refresh');
    items.push(refreshBtn);
  }
}
