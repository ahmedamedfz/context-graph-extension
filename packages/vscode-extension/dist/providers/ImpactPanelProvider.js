"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpactPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
class ImpactPanelProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.reports = [];
    }
    setImpacts(reports) {
        this.reports = reports;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return this.buildRootItems();
        }
        return element.__children ?? [];
    }
    buildRootItems() {
        if (this.reports.length === 0) {
            const empty = new vscode.TreeItem('No impact data — click "Analyze Changes"', vscode.TreeItemCollapsibleState.None);
            empty.iconPath = new vscode.ThemeIcon('info');
            return [empty];
        }
        const items = [];
        for (const report of this.reports) {
            const highCount = report.impacts.filter(i => i.severity === 'HIGH').length;
            const medCount = report.impacts.filter(i => i.severity === 'MEDIUM').length;
            const lowCount = report.impacts.filter(i => i.severity === 'LOW').length;
            const reportItem = new vscode.TreeItem(`${report.serviceId}`, vscode.TreeItemCollapsibleState.Expanded);
            reportItem.description = `${report.change.slice(0, 50)}`;
            reportItem.iconPath = new vscode.ThemeIcon('diff', new vscode.ThemeColor('charts.orange'));
            const children = [];
            // Summary
            const summaryItem = new vscode.TreeItem(`${highCount > 0 ? `⚠ ${highCount} HIGH` : ''} ${medCount > 0 ? `${medCount} MEDIUM` : ''} ${lowCount > 0 ? `${lowCount} LOW` : ''}`.trim() || 'No impacts', vscode.TreeItemCollapsibleState.None);
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
            reportItem.__children = children;
            items.push(reportItem);
        }
        return items;
    }
    buildImpactItem(impact) {
        const icon = impact.severity === 'HIGH' ? 'error' : impact.severity === 'MEDIUM' ? 'warning' : 'info';
        const color = impact.severity === 'HIGH'
            ? 'testing.iconErrored'
            : impact.severity === 'MEDIUM'
                ? 'charts.orange'
                : 'charts.blue';
        const item = new vscode.TreeItem(`${impact.severity}: ${impact.component}`, vscode.TreeItemCollapsibleState.None);
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
exports.ImpactPanelProvider = ImpactPanelProvider;
//# sourceMappingURL=ImpactPanelProvider.js.map