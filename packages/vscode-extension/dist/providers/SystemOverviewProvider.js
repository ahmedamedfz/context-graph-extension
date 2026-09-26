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
exports.SystemOverviewProvider = void 0;
const vscode = __importStar(require("vscode"));
class SystemOverviewProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.services = [];
        this.cacheStats = { cached: 0, refreshed: 0, failed: 0 };
    }
    setData(services, stats) {
        this.services = services;
        this.cacheStats = stats;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return this.buildRootItems();
        }
        return [];
    }
    buildRootItems() {
        const items = [];
        if (this.services.length === 0) {
            const loading = new vscode.TreeItem('Analyzing workspace...', vscode.TreeItemCollapsibleState.None);
            loading.iconPath = new vscode.ThemeIcon('loading~spin');
            return [loading];
        }
        // Summary header
        const apiCount = this.services.reduce((n, s) => n + s.apis.length, 0);
        const dbCount = new Set(this.services.flatMap(s => s.dependencies.filter(d => d.type === 'DATABASE').map(d => d.targetService))).size;
        const summary = new vscode.TreeItem(`${this.services.length} Services · ${apiCount} APIs · ${dbCount} Databases`, vscode.TreeItemCollapsibleState.None);
        summary.iconPath = new vscode.ThemeIcon('server-environment');
        summary.contextValue = 'system-summary';
        items.push(summary);
        // Cache stats
        const cacheItem = new vscode.TreeItem(`Cache: ✓ ${this.cacheStats.cached} cached · ↺ ${this.cacheStats.refreshed} refreshed`, vscode.TreeItemCollapsibleState.None);
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
exports.SystemOverviewProvider = SystemOverviewProvider;
//# sourceMappingURL=SystemOverviewProvider.js.map