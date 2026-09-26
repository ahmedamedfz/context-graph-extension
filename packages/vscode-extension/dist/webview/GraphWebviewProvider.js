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
exports.GraphWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
const graphHtml_1 = require("./graphHtml");
class GraphWebviewProvider {
    static show(extensionUri, graph, impactReport) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (GraphWebviewProvider.currentPanel) {
            GraphWebviewProvider.currentPanel.reveal(column);
            GraphWebviewProvider.currentPanel.webview.postMessage({
                type: 'update',
                graph: graphToVisualization(graph),
                impactReport,
            });
            return;
        }
        const panel = vscode.window.createWebviewPanel('bcg.graph', 'Bob Context Graph', column ?? vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        GraphWebviewProvider.currentPanel = panel;
        panel.webview.html = (0, graphHtml_1.getGraphHtml)(graphToVisualization(graph), impactReport);
        panel.onDidDispose(() => {
            GraphWebviewProvider.currentPanel = undefined;
        });
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'nodeSelected') {
                // Handle node click — could show details in status bar or sidebar
                console.log('[BCG] Node selected:', msg.nodeId);
            }
        });
    }
}
exports.GraphWebviewProvider = GraphWebviewProvider;
function graphToVisualization(graph) {
    return {
        nodes: graph.nodes.map(n => ({
            id: n.id,
            type: n.type,
            label: n.label,
            impactSeverity: n.impactSeverity,
            impactReason: n.impactReason,
            data: summarizeData(n),
        })),
        edges: graph.edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: e.type,
            label: e.label,
        })),
        generatedAt: graph.generatedAt,
    };
}
function summarizeData(node) {
    if (node.type === 'DATABASE') {
        const db = node.data;
        return { name: db.name, tableCount: db.tables?.length ?? 0, owner: db.ownerServiceId };
    }
    const svc = node.data;
    return {
        serviceId: svc?.identity?.serviceId,
        commit: svc?.identity?.commitHash?.slice(0, 7),
        branch: svc?.identity?.branch,
        apiCount: svc?.apis?.length ?? 0,
        tableCount: svc?.database?.length ?? 0,
        dependencyCount: svc?.dependencies?.length ?? 0,
        status: svc?.status,
        analyzedAt: svc?.analyzedAt,
        semanticSummary: svc?.semanticSummary,
    };
}
//# sourceMappingURL=GraphWebviewProvider.js.map