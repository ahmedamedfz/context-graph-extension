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
/**
 * F21: Explicit state machine — idle / analyzing / ready / empty / error
 * instead of using service count === 0 as a proxy for "loading".
 */
class SystemOverviewProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.services = [];
        this.cacheStats = { cached: 0, refreshed: 0, failed: 0 };
        this.state = 'idle';
        this.errorMessage = '';
    }
    setAnalyzing(analyzing) {
        this.state = analyzing ? 'analyzing' : this.state;
        this._onDidChangeTreeData.fire();
    }
    setData(services, stats) {
        this.services = services;
        this.cacheStats = stats;
        // F21: distinguish empty result from still-loading
        this.state = services.length === 0 ? 'empty' : 'ready';
        this._onDidChangeTreeData.fire();
    }
    setError(message) {
        this.errorMessage = message;
        this.state = 'error';
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
        const dbCount = new Set(this.services.flatMap(s => s.dependencies.filter(d => d.type === 'DATABASE').map(d => d.targetService))).size;
        const summary = new vscode.TreeItem(`${this.services.length} Services · ${apiCount} APIs · ${dbCount} Databases`, vscode.TreeItemCollapsibleState.None);
        summary.iconPath = new vscode.ThemeIcon('server-environment');
        summary.contextValue = 'system-summary';
        items.push(summary);
        const cacheItem = new vscode.TreeItem(`Cache: ✓ ${this.cacheStats.cached} cached · ↺ ${this.cacheStats.refreshed} refreshed`, vscode.TreeItemCollapsibleState.None);
        cacheItem.iconPath = new vscode.ThemeIcon('database');
        items.push(cacheItem);
        this.addActionButtons(items);
        return items;
    }
    addActionButtons(items) {
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
exports.SystemOverviewProvider = SystemOverviewProvider;
//# sourceMappingURL=SystemOverviewProvider.js.map