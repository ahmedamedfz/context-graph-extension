import * as vscode from 'vscode';
import { ServiceContext } from '@bob-context-graph/core';

export class ServiceExplorerProvider implements vscode.TreeDataProvider<ServiceItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private services: ServiceContext[] = [];

  setServices(services: ServiceContext[]) {
    this.services = services;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ServiceItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ServiceItem): ServiceItem[] {
    if (!element) {
      return this.services.map(s => new ServiceItem(s));
    }
    return element.getChildren();
  }
}

export class ServiceItem extends vscode.TreeItem {
  private context: ServiceContext;

  constructor(ctx: ServiceContext) {
    super(ctx.identity.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.context = ctx;

    const statusIcon = this.getStatusIcon(ctx.status);
    const commitShort = ctx.identity.commitHash.slice(0, 7);

    this.description = `${commitShort} · ${ctx.status}`;
    this.iconPath = new vscode.ThemeIcon(statusIcon.icon, new vscode.ThemeColor(statusIcon.color));
    this.tooltip = this.buildTooltip(ctx);
    this.contextValue = 'service';
  }

  getChildren(): ServiceItem[] {
    const items: ServiceItem[] = [];
    const ctx = this.context;

    // APIs section
    if (ctx.apis.length > 0) {
      const apisHeader = new ServiceItem(
        { ...ctx, identity: { ...ctx.identity, name: `REST APIs (${ctx.apis.length})` } } as ServiceContext
      );
      apisHeader.collapsibleState = vscode.TreeItemCollapsibleState.None;
      apisHeader.iconPath = new vscode.ThemeIcon('symbol-method');
      apisHeader.description = ctx.apis.map(a => `${a.method} ${a.path}`).slice(0, 3).join(', ');
      items.push(apisHeader);
    }

    // Database section
    if (ctx.database.length > 0) {
      const dbHeader = new ServiceItem(
        { ...ctx, identity: { ...ctx.identity, name: `Tables (${ctx.database.length})` } } as ServiceContext
      );
      dbHeader.collapsibleState = vscode.TreeItemCollapsibleState.None;
      dbHeader.iconPath = new vscode.ThemeIcon('database');
      dbHeader.description = ctx.database.map(t => t.tableName).join(', ');
      items.push(dbHeader);
    }

    // Dependencies
    const restDeps = ctx.dependencies.filter(d => d.type === 'REST');
    if (restDeps.length > 0) {
      const depsHeader = new ServiceItem(
        { ...ctx, identity: { ...ctx.identity, name: `Depends on (${restDeps.length})` } } as ServiceContext
      );
      depsHeader.collapsibleState = vscode.TreeItemCollapsibleState.None;
      depsHeader.iconPath = new vscode.ThemeIcon('references');
      depsHeader.description = restDeps.map(d => d.targetService).join(', ');
      items.push(depsHeader);
    }

    // Semantic summary
    if (ctx.semanticSummary) {
      const summaryItem = new ServiceItem(
        { ...ctx, identity: { ...ctx.identity, name: 'Summary' } } as ServiceContext
      );
      summaryItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
      summaryItem.iconPath = new vscode.ThemeIcon('comment');
      summaryItem.tooltip = ctx.semanticSummary;
      summaryItem.description = ctx.semanticSummary.slice(0, 60) + (ctx.semanticSummary.length > 60 ? '…' : '');
      items.push(summaryItem);
    }

    return items;
  }

  private getStatusIcon(status: string): { icon: string; color: string } {
    switch (status) {
      case 'Cached': return { icon: 'pass', color: 'testing.iconPassed' };
      case 'Indexed': return { icon: 'check', color: 'testing.iconPassed' };
      case 'Changed': return { icon: 'warning', color: 'testing.iconFailed' };
      case 'Analyzing': return { icon: 'loading~spin', color: 'charts.blue' };
      case 'Error': return { icon: 'error', color: 'testing.iconErrored' };
      default: return { icon: 'circle-outline', color: 'foreground' };
    }
  }

  private buildTooltip(ctx: ServiceContext): string {
    const lines = [
      `Service: ${ctx.identity.name}`,
      `Status:  ${ctx.status}`,
      `Commit:  ${ctx.identity.commitHash.slice(0, 7)}`,
      `Branch:  ${ctx.identity.branch}`,
      `APIs:    ${ctx.apis.length}`,
      `Tables:  ${ctx.database.length}`,
      `Depends: ${ctx.dependencies.filter(d => d.type === 'REST').length} services`,
      `Files:   ${ctx.fileCount}`,
      `Analyzed: ${new Date(ctx.analyzedAt).toLocaleTimeString()}`,
    ];

    if (ctx.semanticSummary) {
      lines.push('', ctx.semanticSummary);
    }

    return lines.join('\n');
  }
}
