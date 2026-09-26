import * as vscode from 'vscode';
import { ImpactReport, ImpactEntry } from '@bob-context-graph/core';

export class ImpactPanelProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private reports: ImpactReport[] = [];

  setImpacts(reports: ImpactReport[]) {
    this.reports = reports;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      return this.buildRootItems();
    }
    return (element as any).__children ?? [];
  }

  private buildRootItems(): vscode.TreeItem[] {
    if (this.reports.length === 0) {
      const empty = new vscode.TreeItem(
        'No impact data — click "Analyze Changes"',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }

    const items: vscode.TreeItem[] = [];

    for (const report of this.reports) {
      const highCount = report.impacts.filter(i => i.severity === 'HIGH').length;
      const medCount = report.impacts.filter(i => i.severity === 'MEDIUM').length;
      const lowCount = report.impacts.filter(i => i.severity === 'LOW').length;

      const reportItem = new vscode.TreeItem(
        `${report.serviceId}`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      reportItem.description = `${report.change.slice(0, 50)}`;
      reportItem.iconPath = new vscode.ThemeIcon('diff', new vscode.ThemeColor('charts.orange'));

      const children: vscode.TreeItem[] = [];

      // Summary
      const summaryItem = new vscode.TreeItem(
        `${highCount > 0 ? `⚠ ${highCount} HIGH` : ''} ${medCount > 0 ? `${medCount} MEDIUM` : ''} ${lowCount > 0 ? `${lowCount} LOW` : ''}`.trim() || 'No impacts',
        vscode.TreeItemCollapsibleState.None
      );
      summaryItem.iconPath = new vscode.ThemeIcon(highCount > 0 ? 'warning' : 'info');
      children.push(summaryItem);

      // Interpretation
      if (report.changeInterpretation) {
        const interpItem = new vscode.TreeItem(report.changeInterpretation, vscode.TreeItemCollapsibleState.None);
        interpItem.iconPath = new vscode.ThemeIcon('comment');
        children.push(interpItem);
      }

      // Individual impacts
      for (const impact of report.impacts) {
        const impactItem = this.buildImpactItem(impact);
        children.push(impactItem);
      }

      // Migration steps
      if (report.migrationRecommendations.length > 0) {
        const migHeader = new vscode.TreeItem('Migration Recommendations', vscode.TreeItemCollapsibleState.None);
        migHeader.iconPath = new vscode.ThemeIcon('checklist');
        migHeader.description = report.migrationRecommendations.length + ' steps';
        migHeader.tooltip = report.migrationRecommendations.join('\n');
        children.push(migHeader);
      }

      (reportItem as any).__children = children;
      items.push(reportItem);
    }

    return items;
  }

  private buildImpactItem(impact: ImpactEntry): vscode.TreeItem {
    const icon = impact.severity === 'HIGH' ? 'error' : impact.severity === 'MEDIUM' ? 'warning' : 'info';
    const color = impact.severity === 'HIGH'
      ? 'testing.iconErrored'
      : impact.severity === 'MEDIUM'
      ? 'charts.orange'
      : 'charts.blue';

    const item = new vscode.TreeItem(
      `${impact.severity}: ${impact.component}`,
      vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    item.description = impact.reason.slice(0, 60) + (impact.reason.length > 60 ? '…' : '');
    item.tooltip = [
      `Severity: ${impact.severity}`,
      `Component: ${impact.component}`,
      ``,
      `Reason: ${impact.reason}`,
      impact.recommendedAction ? `\nAction: ${impact.recommendedAction}` : '',
    ].join('\n');

    return item;
  }
}
