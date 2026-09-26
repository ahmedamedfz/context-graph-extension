import * as vscode from 'vscode';
import { ServiceContext } from '@bob-context-graph/core';

type CacheStats = { cached: number; refreshed: number; failed: number };

export class SystemOverviewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private services: ServiceContext[] = [];
  private cacheStats: CacheStats = { cached: 0, refreshed: 0, failed: 0 };

  setData(services: ServiceContext[], stats: CacheStats) {
    this.services = services;
    this.cacheStats = stats;
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

    if (this.services.length === 0) {
      const loading = new vscode.TreeItem('Analyzing workspace...', vscode.TreeItemCollapsibleState.None);
      loading.iconPath = new vscode.ThemeIcon('loading~spin');
      return [loading];
    }

    // Summary header
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

    // Cache stats
    const cacheItem = new vscode.TreeItem(
      `Cache: ✓ ${this.cacheStats.cached} cached · ↺ ${this.cacheStats.refreshed} refreshed`,
      vscode.TreeItemCollapsibleState.None
    );
    cacheItem.iconPath = new vscode.ThemeIcon('database');
    items.push(cacheItem);

    // Open graph button
    const graphBtn = new vscode.TreeItem('$(type-hierarchy) Open System Graph', vscode.TreeItemCollapsibleState.None);
    graphBtn.command = { command: 'bcg.openGraph', title: 'Open System Graph' };
    graphBtn.iconPath = new vscode.ThemeIcon('type-hierarchy');
    items.push(graphBtn);

    // Analyze changes button
    const analyzeBtn = new vscode.TreeItem('$(diff) Analyze Changes', vscode.TreeItemCollapsibleState.None);
    analyzeBtn.command = { command: 'bcg.analyzeChanges', title: 'Analyze Changes' };
    analyzeBtn.iconPath = new vscode.ThemeIcon('diff');
    items.push(analyzeBtn);

    // Refresh button
    const refreshBtn = new vscode.TreeItem('$(refresh) Refresh Context', vscode.TreeItemCollapsibleState.None);
    refreshBtn.command = { command: 'bcg.refreshAll', title: 'Refresh Context' };
    refreshBtn.iconPath = new vscode.ThemeIcon('refresh');
    items.push(refreshBtn);

    return items;
  }
}
