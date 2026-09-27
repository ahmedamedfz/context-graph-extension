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
        return element instanceof ServiceItem ? element.getChildren() : element.children ?? [];
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
        const ctx = this.context;
        const leaf = (label, description) => {
            const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
            item.description = description;
            item.tooltip = description;
            return item;
        };
        const group = (label, children) => {
            const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
            item.children = children;
            return item;
        };
        const items = [];
        items.push(group(`REST APIs (${ctx.apis.length})`, ctx.apis.map(api => group(`${api.method} ${api.path}`, [
            leaf('Request', api.requestModel ?? 'Unknown'), leaf('Response', api.responseModel ?? 'Unknown'),
            leaf('Description', api.semanticDescription ?? 'Not generated'),
        ]))));
        items.push(group(`Tables (${ctx.database.length})`, ctx.database.map(table => group(table.tableName, table.columns.map(column => leaf(column.name, `${column.type}${column.isPrimaryKey ? ' · primary key' : ''}`))))));
        items.push(group(`Dependencies (${ctx.dependencies.length})`, ctx.dependencies.map(dep => leaf(`${dep.type}: ${dep.targetService}`, dep.evidence))));
        if (ctx.semanticSummary)
            items.push(leaf('Summary', ctx.semanticSummary));
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