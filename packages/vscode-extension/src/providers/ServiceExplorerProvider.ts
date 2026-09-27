import * as vscode from 'vscode';
import { ServiceContext } from '@bob-context-graph/core';

export class ServiceExplorerProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private services: ServiceContext[] = [];

  setServices(services: ServiceContext[]) {
    this.services = services;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      return this.services.map(s => new ServiceItem(s));
    }
    return element instanceof ServiceItem ? element.getChildren() : (element as vscode.TreeItem & {children?: vscode.TreeItem[]}).children ?? [];
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

  getChildren(): vscode.TreeItem[] {
    const ctx = this.context;
    const leaf = (label: string, description?: string) => {
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.description = description;
      item.tooltip = description;
      return item;
    };
    const group = (label: string, children: vscode.TreeItem[]) => {
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed) as vscode.TreeItem & {children: vscode.TreeItem[]};
      item.children = children;
      return item;
    };
    const items: vscode.TreeItem[] = [];
    items.push(group(`REST APIs (${ctx.apis.length})`, ctx.apis.map(api => group(`${api.method} ${api.path}`, [
      leaf('Request', api.requestModel ?? 'Unknown'), leaf('Response', api.responseModel ?? 'Unknown'),
      leaf('Description', api.semanticDescription ?? 'Not generated'),
    ]))));
    items.push(group(`Tables (${ctx.database.length})`, ctx.database.map(table => group(table.tableName, table.columns.map(column => leaf(column.name, `${column.type}${column.isPrimaryKey ? ' · primary key' : ''}`))))));
    items.push(group(`Dependencies (${ctx.dependencies.length})`, ctx.dependencies.map(dep => leaf(`${dep.type}: ${dep.targetService}`, dep.evidence))));
    if (ctx.semanticSummary) items.push(leaf('Summary', ctx.semanticSummary));
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
