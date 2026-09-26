"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGraphHtml = getGraphHtml;
function getGraphHtml(graph, impactReport) {
    const graphJson = JSON.stringify(graph);
    const impactJson = JSON.stringify(impactReport);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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

  /* ── Header ── */
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
    background: #0e639c;
    color: #fff;
    border: none;
    border-radius: 3px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .btn:hover { background: #1177bb; }
  .btn.secondary { background: #3c3c3c; }
  .btn.secondary:hover { background: #505050; }

  /* ── Main layout ── */
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Graph canvas ── */
  #graph-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #1e1e1e;
  }
  #graph-svg {
    width: 100%;
    height: 100%;
    cursor: grab;
  }
  #graph-svg:active { cursor: grabbing; }

  /* ── Node styles ── */
  .node-service circle { fill: #264f78; stroke: #4fc3f7; stroke-width: 2; }
  .node-service.CACHED circle { fill: #1b5e20; stroke: #66bb6a; }
  .node-service.CHANGED circle { fill: #7b3800; stroke: #ffa726; }
  .node-service.ERROR circle { fill: #5c1010; stroke: #ef5350; }

  .node-service.impact-HIGH circle { fill: #6a1a1a; stroke: #ef5350; stroke-width: 3; }
  .node-service.impact-MEDIUM circle { fill: #6a4400; stroke: #ffa726; stroke-width: 3; }
  .node-service.impact-LOW circle { fill: #1a4a6a; stroke: #4fc3f7; stroke-width: 3; }
  .node-service.impact-SAFE circle { fill: #1b5e20; stroke: #66bb6a; stroke-width: 2; }

  .node-database rect { fill: #2d2d5e; stroke: #9575cd; stroke-width: 2; }

  .node-label {
    fill: #d4d4d4;
    font-size: 11px;
    text-anchor: middle;
    pointer-events: none;
    font-weight: 500;
  }

  .impact-badge {
    fill: #ef5350;
    font-size: 10px;
    font-weight: 700;
    text-anchor: middle;
    pointer-events: none;
  }

  /* ── Edge styles ── */
  .edge {
    stroke: #555;
    stroke-width: 1.5;
    fill: none;
    marker-end: url(#arrowhead);
  }
  .edge.SERVICE_DEPENDS_ON_SERVICE { stroke: #4fc3f7; }
  .edge.SERVICE_USES_DATABASE { stroke: #9575cd; stroke-dasharray: 5,3; }

  .edge-label {
    fill: #858585;
    font-size: 9px;
    text-anchor: middle;
  }

  /* ── Detail panel ── */
  .detail-panel {
    width: 280px;
    flex-shrink: 0;
    background: #252526;
    border-left: 1px solid #3e3e42;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .detail-header {
    padding: 10px 14px;
    border-bottom: 1px solid #3e3e42;
    font-size: 12px;
    font-weight: 600;
    color: #9cdcfe;
    background: #2d2d2d;
  }
  .detail-body { padding: 12px 14px; flex: 1; }
  .detail-empty {
    color: #858585;
    font-size: 11px;
    padding: 20px 14px;
    text-align: center;
  }
  .detail-section { margin-bottom: 14px; }
  .detail-section-title {
    font-size: 10px;
    text-transform: uppercase;
    color: #858585;
    letter-spacing: 0.8px;
    margin-bottom: 6px;
    border-bottom: 1px solid #3e3e42;
    padding-bottom: 3px;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    font-size: 11px;
    padding: 2px 0;
    gap: 8px;
  }
  .detail-label { color: #858585; flex-shrink: 0; }
  .detail-value { color: #d4d4d4; text-align: right; word-break: break-all; }
  .status-cached { color: #66bb6a; }
  .status-changed { color: #ffa726; }
  .status-error { color: #ef5350; }
  .api-item { font-size: 10px; color: #ce9178; padding: 1px 0; }
  .api-method { color: #4fc3f7; }

  /* ── Impact panel ── */
  .impact-section {
    background: #1e1e1e;
    border-top: 1px solid #3e3e42;
    padding: 10px 14px;
    max-height: 200px;
    overflow-y: auto;
    flex-shrink: 0;
  }
  .impact-title { font-size: 12px; font-weight: 600; color: #ef5350; margin-bottom: 8px; }
  .impact-item {
    padding: 6px 8px;
    margin-bottom: 6px;
    border-radius: 3px;
    font-size: 11px;
  }
  .impact-HIGH { background: #3e1010; border-left: 3px solid #ef5350; }
  .impact-MEDIUM { background: #3e2800; border-left: 3px solid #ffa726; }
  .impact-LOW { background: #102030; border-left: 3px solid #4fc3f7; }
  .impact-component { font-weight: 600; margin-bottom: 2px; }
  .impact-reason { color: #a0a0a0; font-size: 10px; }

  /* ── Legend ── */
  .legend {
    position: absolute;
    bottom: 10px;
    left: 10px;
    background: rgba(37,37,38,0.9);
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 10px;
    pointer-events: none;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid; }
  .legend-rect { width: 12px; height: 8px; border-radius: 1px; border: 1.5px solid; }

  /* ── Tooltip ── */
  .tooltip {
    position: absolute;
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 11px;
    pointer-events: none;
    max-width: 250px;
    z-index: 100;
    display: none;
    word-wrap: break-word;
  }
</style>
</head>
<body>
<div class="header">
  <div class="header-title">⬡ Bob Context Graph</div>
  <div class="header-info" id="header-info">Loading...</div>
  <div class="header-actions">
    <button class="btn secondary" onclick="resetZoom()">Reset View</button>
    <button class="btn" onclick="analyzeChanges()">Analyze Changes</button>
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
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#264f78;border-color:#4fc3f7"></div> Service</div>
      <div class="legend-item"><div class="legend-rect" style="background:#2d2d5e;border-color:#9575cd"></div> Database</div>
      <div class="legend-item"><div class="legend-dot" style="background:#1b5e20;border-color:#66bb6a"></div> Cached</div>
      <div class="legend-item"><div class="legend-dot" style="background:#7b3800;border-color:#ffa726"></div> Changed</div>
      <div class="legend-item"><div class="legend-dot" style="background:#6a1a1a;border-color:#ef5350"></div> HIGH Impact</div>
    </div>
    <div class="tooltip" id="tooltip"></div>
  </div>

  <div class="detail-panel">
    <div class="detail-header">Selected Node</div>
    <div id="detail-content">
      <div class="detail-empty">Click a node to see details</div>
    </div>
    <div id="impact-panel"></div>
  </div>
</div>

<script>
(function() {
  const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

  // ── Data ──────────────────────────────────────────────────────────────
  let graphData = ${graphJson};
  let impactData = ${impactJson};

  // ── Layout constants ──────────────────────────────────────────────────
  const SERVICE_RADIUS = 38;
  const DB_WIDTH = 80;
  const DB_HEIGHT = 36;

  // ── State ─────────────────────────────────────────────────────────────
  let scale = 1, offsetX = 0, offsetY = 0;
  let isDragging = false, dragStartX = 0, dragStartY = 0, dragOffX = 0, dragOffY = 0;
  let selectedNode = null;
  let nodePositions = {};

  // ── SVG refs ──────────────────────────────────────────────────────────
  const svg = document.getElementById('graph-svg');
  const zoomGroup = document.getElementById('zoom-group');
  const edgesLayer = document.getElementById('edges-layer');
  const nodesLayer = document.getElementById('nodes-layer');

  function svgNS() { return 'http://www.w3.org/2000/svg'; }
  function el(tag, attrs = {}, text = '') {
    const e = document.createElementNS(svgNS(), tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (text) e.textContent = text;
    return e;
  }

  // ── Layout ────────────────────────────────────────────────────────────
  function computeLayout(nodes, edges) {
    const W = svg.clientWidth || 800;
    const H = svg.clientHeight || 600;
    const positions = {};

    // Separate services and databases
    const services = nodes.filter(n => n.type === 'SERVICE');
    const databases = nodes.filter(n => n.type === 'DATABASE');

    // Arrange services in a circle in top portion
    const centerX = W / 2;
    const centerY = H * 0.38;
    const radius = Math.min(W, H) * 0.28;

    if (services.length === 1) {
      positions[services[0].id] = { x: centerX, y: centerY };
    } else {
      services.forEach((n, i) => {
        const angle = (i / services.length) * 2 * Math.PI - Math.PI / 2;
        positions[n.id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });
    }

    // Position databases below their owner service
    databases.forEach((db, i) => {
      // Find the service that owns this db
      const ownerEdge = edges.find(e => e.target === db.id && e.type === 'SERVICE_USES_DATABASE');
      if (ownerEdge && positions[ownerEdge.source]) {
        const ownerPos = positions[ownerEdge.source];
        positions[db.id] = {
          x: ownerPos.x,
          y: ownerPos.y + 130 + (i % 2 === 0 ? 0 : 20),
        };
      } else {
        positions[db.id] = {
          x: 80 + i * 160,
          y: H * 0.78,
        };
      }
    });

    return positions;
  }

  // ── Render ────────────────────────────────────────────────────────────
  function render(data, impact) {
    nodesLayer.innerHTML = '';
    edgesLayer.innerHTML = '';

    if (!data || !data.nodes) return;

    nodePositions = computeLayout(data.nodes, data.edges || []);

    // Update header
    const svcCount = data.nodes.filter(n => n.type === 'SERVICE').length;
    const dbCount = data.nodes.filter(n => n.type === 'DATABASE').length;
    document.getElementById('header-info').textContent =
      svcCount + ' services · ' + dbCount + ' databases · ' + (data.edges || []).length + ' edges · HEAD: ' +
      (data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : '');

    // Draw edges first
    (data.edges || []).forEach(edge => {
      const src = nodePositions[edge.source];
      const tgt = nodePositions[edge.target];
      if (!src || !tgt) return;

      const srcNode = data.nodes.find(n => n.id === edge.source);
      const tgtNode = data.nodes.find(n => n.id === edge.target);

      const {sx, sy, tx, ty} = getEdgePoints(src, tgt, srcNode, tgtNode);

      const path = el('path', {
        class: 'edge ' + edge.type,
        d: \`M\${sx},\${sy} C\${sx},\${(sy+ty)/2} \${tx},\${(sy+ty)/2} \${tx},\${ty}\`,
        'marker-end': edge.type === 'SERVICE_USES_DATABASE' ? 'url(#arrowhead-purple)' : 'url(#arrowhead-blue)',
        stroke: edge.type === 'SERVICE_USES_DATABASE' ? '#9575cd' : '#4fc3f7',
      });
      edgesLayer.appendChild(path);
    });

    // Draw nodes
    data.nodes.forEach(node => {
      const pos = nodePositions[node.id];
      if (!pos) return;
      const g = drawNode(node, pos);
      nodesLayer.appendChild(g);
    });

    // Render impact panel
    renderImpactPanel(impact);
  }

  function getEdgePoints(src, tgt, srcNode, tgtNode) {
    let sx = src.x, sy = src.y, tx = tgt.x, ty = tgt.y;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;

    // Adjust for node shapes
    const srcR = srcNode && srcNode.type === 'SERVICE' ? SERVICE_RADIUS : 18;
    const tgtR = tgtNode && tgtNode.type === 'SERVICE' ? SERVICE_RADIUS : 18;

    sx = src.x + (dx / dist) * srcR;
    sy = src.y + (dy / dist) * srcR;
    tx = tgt.x - (dx / dist) * tgtR;
    ty = tgt.y - (dy / dist) * tgtR;

    return {sx, sy, tx, ty};
  }

  function drawNode(node, pos) {
    const g = el('g', {
      class: 'node-' + node.type.toLowerCase() +
        (node.data && node.data.status ? ' ' + node.data.status.toUpperCase() : '') +
        (node.impactSeverity ? ' impact-' + node.impactSeverity : ''),
      transform: \`translate(\${pos.x},\${pos.y})\`,
      style: 'cursor:pointer',
    });

    if (node.type === 'SERVICE') {
      const fill = getServiceFill(node);
      const stroke = getServiceStroke(node);
      const strokeW = node.impactSeverity && node.impactSeverity !== 'SAFE' ? '3' : '2';

      g.appendChild(el('circle', {
        r: SERVICE_RADIUS,
        fill,
        stroke,
        'stroke-width': strokeW,
      }));

      // Main label
      const lines = wrapText(node.label, 10);
      lines.forEach((line, i) => {
        const t = el('text', {
          class: 'node-label',
          y: (i - (lines.length - 1) / 2) * 14,
        }, line);
        g.appendChild(t);
      });

      // Impact badge
      if (node.impactSeverity && node.impactSeverity !== 'SAFE') {
        const badge = el('g', {});
        badge.appendChild(el('circle', { r: '10', fill: severityColor(node.impactSeverity), cy: '-' + (SERVICE_RADIUS - 6), cx: '18' }));
        badge.appendChild(el('text', {
          class: 'impact-badge',
          y: '-' + (SERVICE_RADIUS - 6 - 3.5),
          x: '18',
          fill: '#fff',
        }, node.impactSeverity[0]));
        g.appendChild(badge);
      }

      // Status dot
      const statusColor = getStatusDotColor(node.data);
      g.appendChild(el('circle', { r: '5', cx: SERVICE_RADIUS - 4, cy: -(SERVICE_RADIUS - 4), fill: statusColor }));

    } else if (node.type === 'DATABASE') {
      g.appendChild(el('rect', {
        x: -DB_WIDTH / 2, y: -DB_HEIGHT / 2,
        width: DB_WIDTH, height: DB_HEIGHT,
        rx: '4',
        fill: '#2d2d5e',
        stroke: '#9575cd',
        'stroke-width': '2',
      }));
      // Cylinder "lid"
      g.appendChild(el('ellipse', {
        cx: '0', cy: (-DB_HEIGHT / 2).toString(),
        rx: (DB_WIDTH / 2).toString(), ry: '6',
        fill: '#3d3d7e', stroke: '#9575cd', 'stroke-width': '1.5'
      }));

      const lines = wrapText(node.label, 9);
      lines.forEach((line, i) => {
        const t = el('text', {
          class: 'node-label',
          y: (i - (lines.length - 1) / 2) * 13 + 4,
          style: 'font-size:10px',
        }, line);
        g.appendChild(t);
      });
    }

    // Click + hover
    g.addEventListener('click', () => selectNode(node));
    g.addEventListener('mouseenter', (e) => showTooltip(e, node));
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
      case 'Cached': return '#66bb6a';
      case 'Indexed': return '#66bb6a';
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
    const words = text.split(/[-_\s]+/);
    const lines = [];
    let current = '';
    for (const w of words) {
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

  // ── Node selection ─────────────────────────────────────────────────────
  function selectNode(node) {
    selectedNode = node;
    renderDetailPanel(node);
    if (vscode) {
      vscode.postMessage({ type: 'nodeSelected', nodeId: node.id });
    }
  }

  function renderDetailPanel(node) {
    const content = document.getElementById('detail-content');

    if (!node) {
      content.innerHTML = '<div class="detail-empty">Click a node to see details</div>';
      return;
    }

    const d = node.data || {};

    if (node.type === 'DATABASE') {
      content.innerHTML = \`
        <div class="detail-body">
          <div class="detail-section">
            <div class="detail-section-title">Database</div>
            <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">\${node.label}</span></div>
            <div class="detail-row"><span class="detail-label">Tables</span><span class="detail-value">\${d.tableCount || 0}</span></div>
            <div class="detail-row"><span class="detail-label">Owner</span><span class="detail-value">\${d.owner || '—'}</span></div>
          </div>
        </div>\`;
      return;
    }

    const statusClass = d.status === 'Cached' ? 'status-cached' : d.status === 'Changed' ? 'status-changed' : d.status === 'Error' ? 'status-error' : '';

    content.innerHTML = \`
      <div class="detail-body">
        <div class="detail-section">
          <div class="detail-section-title">Service Identity</div>
          <div class="detail-row"><span class="detail-label">ID</span><span class="detail-value">\${d.serviceId || node.id}</span></div>
          <div class="detail-row"><span class="detail-label">Commit</span><span class="detail-value">\${d.commit || '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Branch</span><span class="detail-value">\${d.branch || '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value \${statusClass}">\${d.status || '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Analyzed</span><span class="detail-value">\${d.analyzedAt ? new Date(d.analyzedAt).toLocaleTimeString() : '—'}</span></div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">Metrics</div>
          <div class="detail-row"><span class="detail-label">APIs</span><span class="detail-value">\${d.apiCount || 0}</span></div>
          <div class="detail-row"><span class="detail-label">Tables</span><span class="detail-value">\${d.tableCount || 0}</span></div>
          <div class="detail-row"><span class="detail-label">Depends on</span><span class="detail-value">\${d.dependencyCount || 0}</span></div>
        </div>
        \${node.impactSeverity && node.impactSeverity !== 'SAFE' ? \`
        <div class="detail-section">
          <div class="detail-section-title" style="color:\${severityColor(node.impactSeverity)}">Impact: \${node.impactSeverity}</div>
          <div style="font-size:11px;color:#a0a0a0;">\${node.impactReason || ''}</div>
        </div>\` : ''}
        \${d.semanticSummary ? \`
        <div class="detail-section">
          <div class="detail-section-title">Summary</div>
          <div style="font-size:11px;color:#a0a0a0;line-height:1.5;">\${d.semanticSummary}</div>
        </div>\` : ''}
      </div>\`;
  }

  // ── Impact panel ──────────────────────────────────────────────────────
  function renderImpactPanel(impact) {
    const panel = document.getElementById('impact-panel');
    if (!impact || !impact.impacts || impact.impacts.length === 0) {
      panel.innerHTML = '';
      return;
    }

    const items = impact.impacts.map(i => \`
      <div class="impact-item impact-\${i.severity}">
        <div class="impact-component">\${i.severity}: \${i.component}</div>
        <div class="impact-reason">\${i.reason}</div>
      </div>\`).join('');

    panel.innerHTML = \`
      <div class="impact-section">
        <div class="impact-title">⚠ BREAKING CHANGE</div>
        <div style="font-size:11px;color:#858585;margin-bottom:8px;">\${impact.change}</div>
        \${items}
      </div>\`;
  }

  // ── Tooltip ───────────────────────────────────────────────────────────
  function showTooltip(e, node) {
    const tooltip = document.getElementById('tooltip');
    const d = node.data || {};
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

  // ── Pan + Zoom ────────────────────────────────────────────────────────
  function applyTransform() {
    zoomGroup.setAttribute('transform', \`translate(\${offsetX},\${offsetY}) scale(\${scale})\`);
  }

  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOffX = offsetX;
    dragOffY = offsetY;
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    offsetX = dragOffX + (e.clientX - dragStartX);
    offsetY = dragOffY + (e.clientY - dragStartY);
    applyTransform();
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  svg.addEventListener('wheel', e => {
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

  function analyzeChanges() {
    if (vscode) vscode.postMessage({ type: 'analyzeChanges' });
  }

  // ── Message handler ───────────────────────────────────────────────────
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'update') {
      graphData = msg.graph;
      impactData = msg.impactReport;
      render(graphData, impactData);
      if (selectedNode) {
        const updated = graphData.nodes.find(n => n.id === selectedNode.id);
        if (updated) renderDetailPanel(updated);
      }
    }
  });

  // ── Initial render ────────────────────────────────────────────────────
  setTimeout(() => {
    render(graphData, impactData);
    // Center the view
    const W = svg.clientWidth || 800;
    const H = svg.clientHeight || 600;
    applyTransform();
  }, 100);

})();
</script>
</body>
</html>`;
}
//# sourceMappingURL=graphHtml.js.map