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
exports.getGraphHtml = getGraphHtml;
const crypto = __importStar(require("crypto"));
/**
 * F22: Generate the webview HTML with a Content Security Policy nonce.
 * Graph data is NOT interpolated into the script — it is delivered via postMessage
 * after the panel loads to avoid XSS from malicious label/summary/impact text.
 */
function getGraphHtml(graph, impactReport, nonce) {
    // Generate a cryptographic nonce per panel load
    const scriptNonce = nonce ?? crypto.randomBytes(16).toString('base64');
    // The HTML contains NO injected user data — all data arrives via postMessage
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}';">
<title>Bob Context Graph</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    background: #1e1e1e;
    color: #d4d4d4;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #252526;
    border-bottom: 1px solid #3e3e42;
    flex-shrink: 0;
  }
  .header-title { font-size: 14px; font-weight: 600; color: #9cdcfe; }
  .header-info { font-size: 11px; color: #858585; }
  .header-actions { display: flex; gap: 8px; }
  .btn {
    background: #0e639c; color: #fff; border: none; border-radius: 3px;
    padding: 4px 10px; font-size: 11px; cursor: pointer;
  }
  .btn:hover { background: #1177bb; }
  .btn.secondary { background: #3c3c3c; }
  .btn.secondary:hover { background: #505050; }
  .main { display: flex; flex: 1; overflow: hidden; }
  #graph-container { flex: 1; position: relative; overflow: hidden; background: #1e1e1e; }
  #graph-svg { width: 100%; height: 100%; cursor: grab; }
  #graph-svg:active { cursor: grabbing; }
  .node-label { fill: #d4d4d4; font-size: 11px; text-anchor: middle; pointer-events: none; font-weight: 500; }
  .impact-badge { font-size: 10px; font-weight: 700; text-anchor: middle; pointer-events: none; }
  .edge { stroke: #555; stroke-width: 1.5; fill: none; }
  .detail-panel {
    width: 280px; flex-shrink: 0; background: #252526;
    border-left: 1px solid #3e3e42; overflow-y: auto; display: flex; flex-direction: column;
  }
  .detail-header {
    padding: 10px 14px; border-bottom: 1px solid #3e3e42;
    font-size: 12px; font-weight: 600; color: #9cdcfe; background: #2d2d2d;
  }
  .detail-body { padding: 12px 14px; flex: 1; }
  .detail-empty { color: #858585; font-size: 11px; padding: 20px 14px; text-align: center; }
  .detail-section { margin-bottom: 14px; }
  .detail-section-title {
    font-size: 10px; text-transform: uppercase; color: #858585;
    letter-spacing: 0.8px; margin-bottom: 6px;
    border-bottom: 1px solid #3e3e42; padding-bottom: 3px;
  }
  .detail-row { display: flex; justify-content: space-between; align-items: flex-start; font-size: 11px; padding: 2px 0; gap: 8px; }
  .detail-label { color: #858585; flex-shrink: 0; }
  .detail-value { color: #d4d4d4; text-align: right; word-break: break-all; }
  .status-cached { color: #66bb6a; }
  .status-changed { color: #ffa726; }
  .status-error { color: #ef5350; }
  .impact-section { background: #1e1e1e; border-top: 1px solid #3e3e42; padding: 10px 14px; max-height: 200px; overflow-y: auto; flex-shrink: 0; }
  .impact-title { font-size: 12px; font-weight: 600; color: #ef5350; margin-bottom: 8px; }
  .impact-item { padding: 6px 8px; margin-bottom: 6px; border-radius: 3px; font-size: 11px; }
  .impact-HIGH { background: #3e1010; border-left: 3px solid #ef5350; }
  .impact-MEDIUM { background: #3e2800; border-left: 3px solid #ffa726; }
  .impact-LOW { background: #102030; border-left: 3px solid #4fc3f7; }
  .impact-component { font-weight: 600; margin-bottom: 2px; }
  .impact-reason { color: #a0a0a0; font-size: 10px; }
  .legend {
    position: absolute; bottom: 10px; left: 10px;
    background: rgba(37,37,38,0.9); border: 1px solid #3e3e42;
    border-radius: 4px; padding: 8px 10px; font-size: 10px; pointer-events: none;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid; }
  .legend-rect { width: 12px; height: 8px; border-radius: 1px; border: 1.5px solid; }
  .tooltip {
    position: absolute; background: #252526; border: 1px solid #3e3e42;
    border-radius: 4px; padding: 6px 10px; font-size: 11px;
    pointer-events: none; max-width: 250px; z-index: 100; display: none; word-wrap: break-word;
  }
  #loading-msg { color: #858585; text-align: center; padding-top: 40px; font-size: 13px; }
</style>
</head>
<body>
<div class="header">
  <div class="header-title">Bob Context Graph</div>
  <div class="header-info" id="header-info">Loading...</div>
  <div class="header-actions">
    <button class="btn secondary" id="btn-reset">Reset View</button>
    <button class="btn" id="btn-analyze">Analyze Changes</button>
  </div>
</div>
<div class="main">
  <div id="graph-container">
    <svg id="graph-svg">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#555" />
        </marker>
        <marker id="arrowhead-blue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#4fc3f7" />
        </marker>
        <marker id="arrowhead-purple" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#9575cd" />
        </marker>
      </defs>
      <g id="zoom-group">
        <g id="edges-layer"></g>
        <g id="nodes-layer"></g>
      </g>
    </svg>
    <div id="loading-msg">Waiting for graph data...</div>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#264f78;border-color:#4fc3f7"></div> Service</div>
      <div class="legend-item"><div class="legend-rect" style="background:#2d2d5e;border-color:#9575cd"></div> Database</div>
      <div class="legend-item"><div class="legend-dot" style="background:#1b5e20;border-color:#66bb6a"></div> Cached/Indexed</div>
      <div class="legend-item"><div class="legend-dot" style="background:#7b3800;border-color:#ffa726"></div> Changed</div>
      <div class="legend-item"><div class="legend-dot" style="background:#6a1a1a;border-color:#ef5350"></div> HIGH Impact</div>
    </div>
    <div class="tooltip" id="tooltip"></div>
  </div>
  <div class="detail-panel">
    <div class="detail-header">Selected Node</div>
    <div id="detail-content"><div class="detail-empty">Click a node to see details</div></div>
    <div id="impact-panel"></div>
  </div>
</div>

<script nonce="${scriptNonce}">
(function() {
  'use strict';
  const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

  // ── Constants ──────────────────────────────────────────────────────────────
  const SERVICE_RADIUS = 38;
  const DB_WIDTH = 80;
  const DB_HEIGHT = 36;

  // ── State ──────────────────────────────────────────────────────────────────
  let scale = 1, offsetX = 0, offsetY = 0;
  let isDragging = false, dragStartX = 0, dragStartY = 0, dragOffX = 0, dragOffY = 0;
  let selectedNodeId = null;
  let nodePositions = {};
  let currentGraph = null;
  let currentImpact = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const svg = document.getElementById('graph-svg');
  const zoomGroup = document.getElementById('zoom-group');
  const edgesLayer = document.getElementById('edges-layer');
  const nodesLayer = document.getElementById('nodes-layer');
  const loadingMsg = document.getElementById('loading-msg');

  // ── Button wiring (no inline handlers → satisfies CSP) ────────────────────
  document.getElementById('btn-reset').addEventListener('click', resetZoom);
  document.getElementById('btn-analyze').addEventListener('click', function() {
    if (vscode) vscode.postMessage({ type: 'analyzeChanges' });
  });

  // ── Safe text rendering helpers ────────────────────────────────────────────
  function svgNS() { return 'http://www.w3.org/2000/svg'; }

  /** Create an SVG element with attributes. Text content is set via textContent (not innerHTML). */
  function el(tag, attrs) {
    const e = document.createElementNS(svgNS(), tag);
    if (attrs) Object.keys(attrs).forEach(function(k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  /** Create a div with safe textContent (no innerHTML for user data). */
  function safeText(tag, text, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    e.textContent = text || '';
    return e;
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  function computeLayout(nodes, edges) {
    const W = svg.clientWidth || 800;
    const H = svg.clientHeight || 600;
    const positions = {};
    const services = nodes.filter(function(n) { return n.type === 'SERVICE'; });
    const databases = nodes.filter(function(n) { return n.type === 'DATABASE'; });
    const centerX = W / 2;
    const centerY = H * 0.38;
    const radius = Math.min(W, H) * 0.28;

    if (services.length === 1) {
      positions[services[0].id] = { x: centerX, y: centerY };
    } else {
      services.forEach(function(n, i) {
        const angle = (i / services.length) * 2 * Math.PI - Math.PI / 2;
        positions[n.id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });
    }

    databases.forEach(function(db, i) {
      const ownerEdge = (edges || []).find(function(e) { return e.target === db.id && e.type === 'SERVICE_USES_DATABASE'; });
      if (ownerEdge && positions[ownerEdge.source]) {
        const ownerPos = positions[ownerEdge.source];
        positions[db.id] = { x: ownerPos.x, y: ownerPos.y + 130 + (i % 2 === 0 ? 0 : 20) };
      } else {
        positions[db.id] = { x: 80 + i * 160, y: H * 0.78 };
      }
    });

    return positions;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render(data, impact) {
    nodesLayer.innerHTML = '';
    edgesLayer.innerHTML = '';

    if (!data || !data.nodes) {
      loadingMsg.style.display = 'block';
      return;
    }
    loadingMsg.style.display = 'none';

    nodePositions = computeLayout(data.nodes, data.edges || []);

    const svcCount = data.nodes.filter(function(n) { return n.type === 'SERVICE'; }).length;
    const dbCount = data.nodes.filter(function(n) { return n.type === 'DATABASE'; }).length;
    // F22: use textContent to safely set header info
    const headerInfo = document.getElementById('header-info');
    headerInfo.textContent = svcCount + ' services · ' + dbCount + ' databases · ' + (data.edges || []).length + ' edges';

    (data.edges || []).forEach(function(edge) {
      const src = nodePositions[edge.source];
      const tgt = nodePositions[edge.target];
      if (!src || !tgt) return;
      const srcNode = data.nodes.find(function(n) { return n.id === edge.source; });
      const tgtNode = data.nodes.find(function(n) { return n.id === edge.target; });
      const pts = getEdgePoints(src, tgt, srcNode, tgtNode);
      const path = el('path', {
        class: 'edge',
        d: 'M' + pts.sx + ',' + pts.sy + ' C' + pts.sx + ',' + ((pts.sy + pts.ty) / 2) + ' ' + pts.tx + ',' + ((pts.sy + pts.ty) / 2) + ' ' + pts.tx + ',' + pts.ty,
        'marker-end': edge.type === 'SERVICE_USES_DATABASE' ? 'url(#arrowhead-purple)' : 'url(#arrowhead-blue)',
        stroke: edge.type === 'SERVICE_USES_DATABASE' ? '#9575cd' : '#4fc3f7',
        'stroke-width': '1.5',
        fill: 'none',
      });
      edgesLayer.appendChild(path);
    });

    data.nodes.forEach(function(node) {
      const pos = nodePositions[node.id];
      if (!pos) return;
      const g = drawNode(node, pos);
      nodesLayer.appendChild(g);
    });

    renderImpactPanel(impact);
  }

  function getEdgePoints(src, tgt, srcNode, tgtNode) {
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const srcR = srcNode && srcNode.type === 'SERVICE' ? SERVICE_RADIUS : 18;
    const tgtR = tgtNode && tgtNode.type === 'SERVICE' ? SERVICE_RADIUS : 18;
    return {
      sx: src.x + (dx / dist) * srcR,
      sy: src.y + (dy / dist) * srcR,
      tx: tgt.x - (dx / dist) * tgtR,
      ty: tgt.y - (dy / dist) * tgtR,
    };
  }

  function drawNode(node, pos) {
    const g = el('g', { transform: 'translate(' + pos.x + ',' + pos.y + ')', style: 'cursor:pointer' });

    if (node.type === 'SERVICE') {
      const fill = getServiceFill(node);
      const stroke = getServiceStroke(node);
      const strokeW = node.impactSeverity && node.impactSeverity !== 'SAFE' ? '3' : '2';
      g.appendChild(el('circle', { r: SERVICE_RADIUS, fill: fill, stroke: stroke, 'stroke-width': strokeW }));

      // F22: label text via textContent, not innerHTML
      const lines = wrapText(node.label, 10);
      lines.forEach(function(line, i) {
        const t = el('text', { class: 'node-label', y: String((i - (lines.length - 1) / 2) * 14) });
        t.textContent = line; // safe — no innerHTML
        g.appendChild(t);
      });

      if (node.impactSeverity && node.impactSeverity !== 'SAFE') {
        const badge = el('g', {});
        badge.appendChild(el('circle', { r: '10', fill: severityColor(node.impactSeverity), cy: String(-(SERVICE_RADIUS - 6)), cx: '18' }));
        const bt = el('text', { class: 'impact-badge', y: String(-(SERVICE_RADIUS - 6 - 3.5)), x: '18', fill: '#fff' });
        bt.textContent = node.impactSeverity[0]; // safe
        badge.appendChild(bt);
        g.appendChild(badge);
      }

      const statusColor = getStatusDotColor(node.data);
      g.appendChild(el('circle', { r: '5', cx: String(SERVICE_RADIUS - 4), cy: String(-(SERVICE_RADIUS - 4)), fill: statusColor }));

    } else if (node.type === 'DATABASE') {
      g.appendChild(el('rect', { x: String(-DB_WIDTH / 2), y: String(-DB_HEIGHT / 2), width: String(DB_WIDTH), height: String(DB_HEIGHT), rx: '4', fill: '#2d2d5e', stroke: '#9575cd', 'stroke-width': '2' }));
      g.appendChild(el('ellipse', { cx: '0', cy: String(-DB_HEIGHT / 2), rx: String(DB_WIDTH / 2), ry: '6', fill: '#3d3d7e', stroke: '#9575cd', 'stroke-width': '1.5' }));
      const lines = wrapText(node.label, 9);
      lines.forEach(function(line, i) {
        const t = el('text', { class: 'node-label', y: String((i - (lines.length - 1) / 2) * 13 + 4), style: 'font-size:10px' });
        t.textContent = line; // safe
        g.appendChild(t);
      });
    }

    g.addEventListener('click', function() { selectNode(node); });
    g.addEventListener('mouseenter', function(e) { showTooltip(e, node); });
    g.addEventListener('mouseleave', hideTooltip);
    return g;
  }

  function getServiceFill(node) {
    if (node.impactSeverity === 'HIGH') return '#6a1a1a';
    if (node.impactSeverity === 'MEDIUM') return '#6a4400';
    if (node.impactSeverity === 'SAFE') return '#1b5e20';
    const status = node.data && node.data.status;
    if (status === 'Cached' || status === 'Indexed') return '#1b4a1b';
    if (status === 'Changed') return '#7b3800';
    if (status === 'Error') return '#5c1010';
    return '#264f78';
  }

  function getServiceStroke(node) {
    if (node.impactSeverity === 'HIGH') return '#ef5350';
    if (node.impactSeverity === 'MEDIUM') return '#ffa726';
    if (node.impactSeverity === 'SAFE') return '#66bb6a';
    const status = node.data && node.data.status;
    if (status === 'Cached' || status === 'Indexed') return '#66bb6a';
    if (status === 'Changed') return '#ffa726';
    if (status === 'Error') return '#ef5350';
    return '#4fc3f7';
  }

  function getStatusDotColor(data) {
    if (!data) return '#858585';
    switch (data.status) {
      case 'Cached': case 'Indexed': return '#66bb6a';
      case 'Changed': return '#ffa726';
      case 'Error': return '#ef5350';
      default: return '#858585';
    }
  }

  function severityColor(severity) {
    if (severity === 'HIGH') return '#ef5350';
    if (severity === 'MEDIUM') return '#ffa726';
    return '#4fc3f7';
  }

  function wrapText(text, maxLen) {
    if (!text) return [''];
    const words = text.split(/[-_\\s]+/);
    const lines = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if ((current + ' ' + w).trim().length <= maxLen) {
        current = (current + ' ' + w).trim();
      } else {
        if (current) lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 3);
  }

  // ── Node selection ─────────────────────────────────────────────────────────
  function selectNode(node) {
    selectedNodeId = node.id;
    renderDetailPanel(node);
    if (vscode) vscode.postMessage({ type: 'nodeSelected', nodeId: node.id });
  }

  /** F22: Build detail panel using DOM APIs (textContent), not innerHTML with user data. */
  function renderDetailPanel(node) {
    const content = document.getElementById('detail-content');
    content.innerHTML = '';

    if (!node) {
      content.appendChild(safeText('div', 'Click a node to see details', 'detail-empty'));
      return;
    }

    const d = node.data || {};
    const body = document.createElement('div');
    body.className = 'detail-body';

    if (node.type === 'DATABASE') {
      body.appendChild(makeSection('Database', [
        ['Name', node.label],
        ['Tables', String(d.tableCount || 0)],
        ['Owner', d.owner || '—'],
      ]));
    } else {
      body.appendChild(makeSection('Service Identity', [
        ['ID', d.serviceId || node.id],
        ['Commit', d.commit || '—'],
        ['Branch', d.branch || '—'],
        ['Status', d.status || '—'],
        ['Analyzed', d.analyzedAt ? new Date(d.analyzedAt).toLocaleTimeString() : '—'],
      ]));
      body.appendChild(makeSection('Metrics', [
        ['APIs', String(d.apiCount || 0)],
        ['Tables', String(d.tableCount || 0)],
        ['Depends on', String(d.dependencyCount || 0)],
      ]));
      if (node.impactSeverity && node.impactSeverity !== 'SAFE') {
        const impSec = document.createElement('div');
        impSec.className = 'detail-section';
        const title = document.createElement('div');
        title.className = 'detail-section-title';
        title.style.color = severityColor(node.impactSeverity);
        title.textContent = 'Impact: ' + node.impactSeverity; // safe
        impSec.appendChild(title);
        const reason = document.createElement('div');
        reason.style.fontSize = '11px';
        reason.style.color = '#a0a0a0';
        reason.textContent = node.impactReason || ''; // safe
        impSec.appendChild(reason);
        body.appendChild(impSec);
      }
      if (d.semanticSummary) {
        const sumSec = document.createElement('div');
        sumSec.className = 'detail-section';
        const title = document.createElement('div');
        title.className = 'detail-section-title';
        title.textContent = 'Summary'; // safe
        sumSec.appendChild(title);
        const sumText = document.createElement('div');
        sumText.style.fontSize = '11px';
        sumText.style.color = '#a0a0a0';
        sumText.style.lineHeight = '1.5';
        sumText.textContent = d.semanticSummary; // safe
        sumSec.appendChild(sumText);
        body.appendChild(sumSec);
      }
    }
    if (d.apis && d.apis.length) {
      const list = document.createElement('details');
      list.appendChild(safeText('summary', 'Endpoints (' + d.apis.length + ')'));
      d.apis.forEach(function(api) {
        list.appendChild(makeSection(api.method + ' ' + api.path, [
          ['Request', api.requestModel || 'Unknown'], ['Response', api.responseModel || 'Unknown'],
          ['Description', api.semanticDescription || 'Not generated']
        ]));
      });
      body.appendChild(list);
    }
    (d.tables || []).forEach(function(table) {
      const list = document.createElement('details');
      list.appendChild(safeText('summary', table.tableName + ' (' + table.columns.length + ' columns)'));
      list.appendChild(makeSection('Columns', table.columns.map(function(c) {return [c.name, c.type + (c.isPrimaryKey ? ' · primary key' : '')];})));
      body.appendChild(list);
    });
    if (d.coverage) body.appendChild(safeText('div', 'Static analysis · schemas: ' + d.coverage.schemas + ' · events: ' + d.coverage.events, 'detail-empty'));
    content.appendChild(body);
  }

  function makeSection(title, rows) {
    const sec = document.createElement('div');
    sec.className = 'detail-section';
    const h = document.createElement('div');
    h.className = 'detail-section-title';
    h.textContent = title; // safe
    sec.appendChild(h);
    rows.forEach(function(row) {
      const r = document.createElement('div');
      r.className = 'detail-row';
      const label = document.createElement('span');
      label.className = 'detail-label';
      label.textContent = row[0]; // safe
      const val = document.createElement('span');
      val.className = 'detail-value';
      val.textContent = row[1]; // safe
      r.appendChild(label);
      r.appendChild(val);
      sec.appendChild(r);
    });
    return sec;
  }

  // ── Impact panel ───────────────────────────────────────────────────────────
  /** F22: Build impact panel using DOM APIs (textContent), not innerHTML with user data. */
  function renderImpactPanel(impact) {
    const panel = document.getElementById('impact-panel');
    panel.innerHTML = '';
    if (!impact || !impact.impacts || impact.impacts.length === 0) return;

    const section = document.createElement('div');
    section.className = 'impact-section';

    const title = document.createElement('div');
    title.className = 'impact-title';
    title.textContent = 'CHANGE IMPACT'; // safe — not user data
    section.appendChild(title);

    const changeDesc = document.createElement('div');
    changeDesc.style.fontSize = '11px';
    changeDesc.style.color = '#858585';
    changeDesc.style.marginBottom = '8px';
    changeDesc.textContent = impact.change || ''; // safe
    section.appendChild(changeDesc);

    impact.impacts.forEach(function(i) {
      const item = document.createElement('div');
      item.className = 'impact-item impact-' + (i.severity || 'LOW');
      const comp = document.createElement('div');
      comp.className = 'impact-component';
      comp.textContent = (i.severity || '') + ': ' + (i.component || ''); // safe
      item.appendChild(comp);
      const reason = document.createElement('div');
      reason.className = 'impact-reason';
      reason.textContent = i.reason || ''; // safe
      item.appendChild(reason);
      section.appendChild(item);
    });

    panel.appendChild(section);
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────
  function showTooltip(e, node) {
    const tooltip = document.getElementById('tooltip');
    const d = node.data || {};
    // F22: use textContent — no innerHTML
    tooltip.textContent = node.type === 'DATABASE'
      ? node.label + ' (Database) · ' + (d.tableCount || 0) + ' tables'
      : node.label + ' · ' + (d.status || '') + ' · commit ' + (d.commit || '');
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY - 28) + 'px';
  }

  function hideTooltip() {
    document.getElementById('tooltip').style.display = 'none';
  }

  // ── Pan + Zoom ─────────────────────────────────────────────────────────────
  function applyTransform() {
    zoomGroup.setAttribute('transform', 'translate(' + offsetX + ',' + offsetY + ') scale(' + scale + ')');
  }

  svg.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    dragOffX = offsetX; dragOffY = offsetY;
  });

  window.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    offsetX = dragOffX + (e.clientX - dragStartX);
    offsetY = dragOffY + (e.clientY - dragStartY);
    applyTransform();
  });

  window.addEventListener('mouseup', function() { isDragging = false; });

  svg.addEventListener('wheel', function(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    offsetX = mx - (mx - offsetX) * delta;
    offsetY = my - (my - offsetY) * delta;
    scale = Math.max(0.2, Math.min(4, scale * delta));
    applyTransform();
  }, { passive: false });

  function resetZoom() {
    scale = 1; offsetX = 0; offsetY = 0;
    applyTransform();
  }

  // ── postMessage data receiver ──────────────────────────────────────────────
  window.addEventListener('message', function(e) {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'update') {
      currentGraph = msg.graph || null;
      currentImpact = msg.impactReport || null;
      render(currentGraph, currentImpact);
      // Re-render detail panel for selected node if still present
      if (selectedNodeId && currentGraph) {
        const updated = currentGraph.nodes.find(function(n) { return n.id === selectedNodeId; });
        if (updated) renderDetailPanel(updated);
      }
    }
  });

  // On load, request initial data via postMessage back to extension
  // (the extension will call panel.webview.postMessage({type:'update',...}) shortly after)
  applyTransform();
})();
</script>
</body>
</html>`;
}
//# sourceMappingURL=graphHtml.js.map