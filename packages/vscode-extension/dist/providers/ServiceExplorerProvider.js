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
exports.ServiceItem = exports.ServiceExplorerProvider = void 0;
const vscode = __importStar(require("vscode"));
class ServiceExplorerProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.services = [];
    }
    setServices(services) {
        this.services = services;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return this.services.map(s => new ServiceItem(s));
        }
        return element.getChildren();
    }
}
exports.ServiceExplorerProvider = ServiceExplorerProvider;
class ServiceItem extends vscode.TreeItem {
    constructor(ctx) {
        super(ctx.identity.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.context = ctx;
        const statusIcon = this.getStatusIcon(ctx.status);
        const commitShort = ctx.identity.commitHash.slice(0, 7);
        this.description = `${commitShort} · ${ctx.status}`;
        this.iconPath = new vscode.ThemeIcon(statusIcon.icon, new vscode.ThemeColor(statusIcon.color));
        this.tooltip = this.buildTooltip(ctx);
        this.contextValue = 'service';
    }
    getChildren() {
        const items = [];
        const ctx = this.context;
        // APIs section
        if (ctx.apis.length > 0) {
            const apisHeader = new ServiceItem({ ...ctx, identity: { ...ctx.identity, name: `REST APIs (${ctx.apis.length})` } });
            apisHeader.collapsibleState = vscode.TreeItemCollapsibleState.None;
            apisHeader.iconPath = new vscode.ThemeIcon('symbol-method');
            apisHeader.description = ctx.apis.map(a => `${a.method} ${a.path}`).slice(0, 3).join(', ');
            items.push(apisHeader);
        }
        // Database section
        if (ctx.database.length > 0) {
            const dbHeader = new ServiceItem({ ...ctx, identity: { ...ctx.identity, name: `Tables (${ctx.database.length})` } });
            dbHeader.collapsibleState = vscode.TreeItemCollapsibleState.None;
            dbHeader.iconPath = new vscode.ThemeIcon('database');
            dbHeader.description = ctx.database.map(t => t.tableName).join(', ');
            items.push(dbHeader);
        }
        // Dependencies
        const restDeps = ctx.dependencies.filter(d => d.type === 'REST');
        if (restDeps.length > 0) {
            const depsHeader = new ServiceItem({ ...ctx, identity: { ...ctx.identity, name: `Depends on (${restDeps.length})` } });
            depsHeader.collapsibleState = vscode.TreeItemCollapsibleState.None;
            depsHeader.iconPath = new vscode.ThemeIcon('references');
            depsHeader.description = restDeps.map(d => d.targetService).join(', ');
            items.push(depsHeader);
        }
        // Semantic summary
        if (ctx.semanticSummary) {
            const summaryItem = new ServiceItem({ ...ctx, identity: { ...ctx.identity, name: 'Summary' } });
            summaryItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
            summaryItem.iconPath = new vscode.ThemeIcon('comment');
            summaryItem.tooltip = ctx.semanticSummary;
            summaryItem.description = ctx.semanticSummary.slice(0, 60) + (ctx.semanticSummary.length > 60 ? '…' : '');
            items.push(summaryItem);
        }
        return items;
    }
    getStatusIcon(status) {
        switch (status) {
            case 'Cached': return { icon: 'pass', color: 'testing.iconPassed' };
            case 'Indexed': return { icon: 'check', color: 'testing.iconPassed' };
            case 'Changed': return { icon: 'warning', color: 'testing.iconFailed' };
            case 'Analyzing': return { icon: 'loading~spin', color: 'charts.blue' };
            case 'Error': return { icon: 'error', color: 'testing.iconErrored' };
            default: return { icon: 'circle-outline', color: 'foreground' };
        }
    }
    buildTooltip(ctx) {
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
exports.ServiceItem = ServiceItem;
//# sourceMappingURL=ServiceExplorerProvider.js.map