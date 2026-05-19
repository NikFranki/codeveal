import * as vscode from 'vscode';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './messages';
import { buildMarkmapMarkdown } from './ui/mindmap';
import { buildFeatureGraph } from './ui/feature-graph';

/**
 * Manages a singleton WebviewPanel in the main editor area.
 * Replaces the old sidebar WebviewView to give the mindmap full screen space.
 */
export class GlimpsePanelManager {
  private static _instance?: GlimpsePanelManager;

  private _panel?: vscode.WebviewPanel;
  private _pendingMessages: ExtensionToWebviewMessage[] = [];

  private constructor(private readonly _extensionUri: vscode.Uri) {}

  static getInstance(extensionUri: vscode.Uri): GlimpsePanelManager {
    if (!GlimpsePanelManager._instance) {
      GlimpsePanelManager._instance = new GlimpsePanelManager(extensionUri);
    }
    return GlimpsePanelManager._instance;
  }

  /** Create the panel (or reveal it if already open). */
  show(): void {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'glimpse.mindmap',
      'Glimpse',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this._extensionUri],
      }
    );

    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage((msg: WebviewToExtensionMessage) => {
      switch (msg.type) {
        case 'openFile':
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.filePath));
          break;
        case 'openFolder':
          vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(msg.folderPath));
          break;
        case 'openUrl':
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
        case 'drillDown':
          vscode.commands.executeCommand(
            'glimpse.analyzeModule',
            vscode.Uri.file(msg.folderPath)
          );
          break;

      }
    });

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    for (const msg of this._pendingMessages) {
      this._send(msg);
    }
    this._pendingMessages = [];
  }

  postMessage(message: ExtensionToWebviewMessage): void {
    if (this._panel) {
      this._send(message);
    } else {
      this._pendingMessages.push(message);
    }
  }

  focusView(): Thenable<void> {
    this.show();
    return Promise.resolve();
  }

  private _send(message: ExtensionToWebviewMessage): void {
    if (message.type === 'data') {
      const markdown = buildMarkmapMarkdown(message.analysis);
      const graph = buildFeatureGraph(message.analysis);
      this._panel?.webview.postMessage({ ...message, markdown, graph });
    } else {
      this._panel?.webview.postMessage(message);
    }
  }

  private _getHtml(): string {
    const nonce = getNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
             style-src 'unsafe-inline' https://cdn.jsdelivr.net;
             img-src data: https:;
             font-src data: https://cdn.jsdelivr.net;" />
  <title>Glimpse</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      height: 100vh;
      display: flex;
      flex-direction: column;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    /* ── states ── */
    #state-welcome, #state-loading, #state-error { padding: 24px 16px; }
    #state-welcome {
      display: flex; flex-direction: column;
      align-items: center; gap: 10px;
      margin-top: 40px; opacity: 0.6; text-align: center;
    }
    #state-loading {
      display: none; flex-direction: column;
      padding: 20px 16px; gap: 0;
    }
    #loading-header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 14px; color: var(--vscode-descriptionForeground); font-size: 11px;
    }
    #loading-steps { display: flex; flex-direction: column; gap: 0; }
    .step-row {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 0; font-size: 12px;
      color: var(--vscode-descriptionForeground);
      border-left: 2px solid transparent;
    }
    .step-row.step-done {
      color: var(--vscode-foreground);
      border-left-color: var(--vscode-terminal-ansiGreen, #4ec9b0);
    }
    .step-row.step-active {
      color: var(--vscode-foreground);
      border-left-color: var(--vscode-focusBorder, #007acc);
    }
    .step-icon { width: 14px; text-align: center; flex-shrink: 0; font-size: 11px; }
    .step-text { flex: 1; line-height: 1.4; }
    .step-timer { color: var(--vscode-focusBorder, #007acc); font-size: 11px; font-variant-numeric: tabular-nums; flex-shrink: 0; margin-left: auto; padding-left: 8px; }
    #state-error {
      display: none; flex-direction: column; gap: 10px;
      padding: 16px; color: var(--vscode-errorForeground);
      border-left: 3px solid var(--vscode-errorForeground);
    }
    #error-message { word-break: break-word; font-size: 12px; }
    #retry-btn {
      align-self: flex-start; padding: 4px 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 2px; cursor: pointer; font-size: 12px;
    }
    #retry-btn:hover { background: var(--vscode-button-hoverBackground); }
    #state-mindmap { display: none; flex: 1; overflow: hidden; position: relative; flex-direction: column; }

    /* ── tab bar ── */
    #tab-bar {
      display: flex; flex-shrink: 0;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      background: var(--vscode-editor-background);
      z-index: 5;
    }
    .tab-btn {
      padding: 6px 16px; border: none; border-bottom: 2px solid transparent;
      background: none; color: var(--vscode-descriptionForeground);
      cursor: pointer; font-size: 12px; font-family: var(--vscode-font-family);
    }
    .tab-btn.active {
      color: var(--vscode-foreground);
      border-bottom-color: var(--vscode-focusBorder, #007acc);
    }
    .tab-btn:hover:not(.active) { color: var(--vscode-foreground); }

    /* ── content panes ── */
    #mindmap-pane, #graph-pane { flex: 1; overflow: hidden; min-height: 0; position: relative; }

    /* ── toolbar ── */
    #toolbar {
      position: absolute; top: 38px; right: 6px; z-index: 10;
      display: flex; flex-direction: column; gap: 3px;
    }
    .tb-btn {
      width: 28px; height: 28px; padding: 0;
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: 1px solid var(--vscode-widget-border, #555);
      border-radius: 3px; cursor: pointer;
      font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      opacity: 0.75; line-height: 1;
    }
    .tb-btn:hover { opacity: 1; background: var(--vscode-button-secondaryHoverBackground, #45494e); }
    .tb-sep { height: 1px; background: var(--vscode-widget-border, #555); margin: 2px 0; }

    /* ── spinner ── */
    .spinner {
      flex-shrink: 0; width: 12px; height: 12px;
      border: 2px solid var(--vscode-focusBorder, #007acc);
      border-top-color: transparent; border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── mindmap svg ── */
    #mindmap, #graph-svg { width: 100%; height: 100%; }
    .markmap-foreign { color: var(--vscode-foreground, #cccccc); }
    .markmap-foreign a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    .markmap-foreign a:hover { text-decoration: underline; }

    /* ── D3 graph styles ── */
    .g-link { stroke: var(--vscode-descriptionForeground, #888); stroke-opacity: 0.55; fill: none; }
    .g-node-label { fill: var(--vscode-foreground, #ccc); pointer-events: none; }
    .g-empty { fill: var(--vscode-descriptionForeground, #888); font-size: 13px; }

    /* ── graph legend ── */
    #g-legend {
      position: absolute;
      bottom: 12px;
      left: 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 7px 10px;
      background: var(--vscode-editorWidget-background, rgba(30,30,30,0.85));
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: 4px;
      font-size: 11px;
      opacity: 0.75;
      pointer-events: none;
      z-index: 5;
    }
    .g-legend-arrow {
      font-family: monospace;
      color: var(--vscode-foreground, #ccc);
      letter-spacing: 1px;
    }
    .g-legend-text {
      color: var(--vscode-descriptionForeground, #888);
    }

    /* ── node / edge tooltip ── */
    #g-tooltip {
      display: none;
      position: absolute;
      max-width: 280px;
      padding: 8px 12px;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      color: var(--vscode-editorHoverWidget-foreground, #cccccc);
      font-size: 12px; line-height: 1.6;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      pointer-events: none;
      z-index: 20;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div id="state-welcome">
    <div>💡</div>
    <p>右键文件夹 →<br><strong>Glimpse: 分析此模块</strong></p>
  </div>

  <div id="state-loading">
    <div id="loading-header">
      <div class="spinner"></div>
      <span id="loading-path" style="word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
    </div>
    <div id="loading-steps"></div>
  </div>

  <div id="state-error">
    <span id="error-message"></span>
    <button id="retry-btn">重试</button>
  </div>

  <div id="state-mindmap">
    <div id="tab-bar">
      <button class="tab-btn active" data-tab="mindmap">思维导图</button>
      <button class="tab-btn" data-tab="graph">功能关系图</button>
    </div>
    <div id="toolbar">
      <button class="tb-btn" id="btn-fit"        title="适应屏幕">⊡</button>
      <button class="tb-btn" id="btn-zoom-in"    title="放大">＋</button>
      <button class="tb-btn" id="btn-zoom-out"   title="缩小">－</button>
      <div class="tb-sep"></div>
      <button class="tb-btn" id="btn-export-svg" title="导出 SVG" style="font-size:9px;">SVG</button>
      <button class="tb-btn" id="btn-export-png" title="导出 PNG" style="font-size:9px;">PNG</button>
    </div>
    <div id="mindmap-pane"><svg id="mindmap"></svg></div>
    <div id="graph-pane" style="display:none;">
      <svg id="graph-svg"></svg>
      <div id="g-tooltip"></div>
      <div id="g-legend">
        <span class="g-legend-arrow">A ──→ B</span>
        <span class="g-legend-text">A 导入了 B（A 依赖 B）</span>
      </div>
    </div>
  </div>

  <!-- D3 v7 for the feature relation graph (cdn.jsdelivr.net is whitelisted in CSP) -->
  <script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
  <script nonce="${nonce}"
    src="https://cdn.jsdelivr.net/npm/markmap-autoloader@0.17"></script>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const stateWelcome  = document.getElementById('state-welcome');
    const stateLoading  = document.getElementById('state-loading');
    const stateError    = document.getElementById('state-error');
    const stateMindmap  = document.getElementById('state-mindmap');
    const loadingPath   = document.getElementById('loading-path');
    const loadingSteps  = document.getElementById('loading-steps');
    const errorMessage  = document.getElementById('error-message');
    const retryBtn      = document.getElementById('retry-btn');
    const svgEl         = document.getElementById('mindmap');

    let mm = null;
    let currentModulePath = '';
    let activeStepEl = null;
    let stepTimerInterval = null;
    let stepStartTime = 0;
    let currentGraph = null;
    let graphSimulation = null;
    let graphZoom = null;
    let activeTab = 'mindmap';

    const FLEX_STATES = new Set([stateWelcome, stateLoading, stateError, stateMindmap]);
    function showOnly(el) {
      FLEX_STATES.forEach(e => { e.style.display = 'none'; });
      el.style.display = 'flex';
    }

    retryBtn.addEventListener('click', () => {
      if (currentModulePath) {
        vscode.postMessage({ type: 'drillDown', folderPath: currentModulePath });
      }
    });

    // ── tab switching ──────────────────────────────────────────
    function switchTab(tab) {
      activeTab = tab;
      document.getElementById('mindmap-pane').style.display = tab === 'mindmap' ? 'flex' : 'none';
      document.getElementById('graph-pane').style.display   = tab === 'graph'   ? 'flex' : 'none';
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
      });
      if (tab === 'graph' && currentGraph) renderGraph(currentGraph);
      if (tab === 'mindmap' && mm) mm.fit();
    }

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // ── toolbar ────────────────────────────────────────────────
    // Cmd/Ctrl + wheel → zoom (mindmap tab only; D3 handles graph tab natively)
    stateMindmap.addEventListener('wheel', (e) => {
      if (activeTab !== 'mindmap' || !mm || (!e.metaKey && !e.ctrlKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      mm.zoom.scaleBy(mm.svg, factor);
    }, { passive: false });

    document.getElementById('btn-fit').addEventListener('click', () => {
      if (activeTab === 'mindmap') mm?.fit();
      else fitGraph();
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      if (activeTab === 'mindmap' && mm) {
        mm.zoom.scaleBy(mm.svg, 1.3);
      } else if (activeTab === 'graph' && graphZoom) {
        graphZoom.scaleBy(d3.select('#graph-svg'), 1.3);
      }
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      if (activeTab === 'mindmap' && mm) {
        mm.zoom.scaleBy(mm.svg, 1 / 1.3);
      } else if (activeTab === 'graph' && graphZoom) {
        graphZoom.scaleBy(d3.select('#graph-svg'), 1 / 1.3);
      }
    });

    document.getElementById('btn-export-svg').addEventListener('click', () => {
      if (!svgEl) return;
      const name = currentModulePath.split('/').filter(Boolean).pop() || 'mindmap';
      const clone = svgEl.cloneNode(true);
      const bbox = svgEl.getBBox ? svgEl.getBBox() : { width: svgEl.clientWidth, height: svgEl.clientHeight, x: 0, y: 0 };
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', bbox.width || svgEl.clientWidth);
      clone.setAttribute('height', bbox.height || svgEl.clientHeight);
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = 'text { fill: #ccc; font-family: sans-serif; font-size: 14px; } line, path { stroke: #555; }';
      clone.insertBefore(style, clone.firstChild);
      const svgStr = new XMLSerializer().serializeToString(clone);
      const b64 = btoa(unescape(encodeURIComponent(svgStr)));
      const a = document.createElement('a');
      a.href = 'data:image/svg+xml;base64,' + b64;
      a.download = name + '-mindmap.svg';
      a.click();
    });

    document.getElementById('btn-export-png').addEventListener('click', () => {
      if (!svgEl) return;
      const name = currentModulePath.split('/').filter(Boolean).pop() || 'mindmap';
      const w = svgEl.clientWidth || 1200;
      const h = svgEl.clientHeight || 800;
      const svgStr = new XMLSerializer().serializeToString(svgEl);
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#1e1e1e';
        ctx.fillRect(0, 0, w, h);
        try {
          ctx.drawImage(img, 0, 0, w, h);
        } catch (_) { /* cross-origin taint */ }
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = name + '-mindmap.png';
        a.click();
      };
      img.src = dataUrl;
    });

    // ── D3 feature relation graph ──────────────────────────────
    function fitGraph() {
      if (!graphZoom) return;
      d3.select('#graph-svg').transition().duration(300)
        .call(graphZoom.transform, d3.zoomIdentity.translate(
          document.getElementById('graph-pane').clientWidth / 2,
          document.getElementById('graph-pane').clientHeight / 2
        ).scale(0.85));
    }

    function renderGraph(graph) {
      if (graphSimulation) { graphSimulation.stop(); graphSimulation = null; }

      const svgEl = document.getElementById('graph-svg');
      while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

      if (!graph || !graph.nodes.length) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', '50%'); t.setAttribute('y', '50%');
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('class', 'g-empty');
        t.textContent = '未检测到功能关联关系';
        svgEl.appendChild(t);
        return;
      }

      const W = svgEl.clientWidth  || document.getElementById('graph-pane').clientWidth  || 800;
      const H = svgEl.clientHeight || document.getElementById('graph-pane').clientHeight || 600;

      const nodes = graph.nodes.map((n) => ({ ...n }));
      const edges = graph.edges.map((e) => ({ ...e, source: e.from, target: e.to }));

      const svgSel = d3.select(svgEl);
      const COLORS = d3.schemeTableau10;
      const NODE_R = 26;  // circle radius
      const ARROW_OFFSET = NODE_R + 4;  // line endpoint stops here from node center

      // Detect bidirectional pairs: A→B + B→A on the same chord
      const reverseSet = new Set(edges.map((e) => e.to + '\0' + e.from));
      function isBidi(e) { return reverseSet.has(e.from + '\0' + e.to); }
      // Consistent curve sign so both A→B and B→A arc to the same spatial side
      function bidiSign(e) { return e.from <= e.to ? 1 : -1; }
      const CURVE_OFFSET = 36; // px, how far the arc bows out

      // Build SVG path string: straight for one-way, quadratic arc for two-way
      function makePath(d) {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Clip endpoints to circle edge so arrow sits at the rim
        const x1 = d.source.x + (dx / dist) * ARROW_OFFSET;
        const y1 = d.source.y + (dy / dist) * ARROW_OFFSET;
        const x2 = d.target.x - (dx / dist) * ARROW_OFFSET;
        const y2 = d.target.y - (dy / dist) * ARROW_OFFSET;
        if (isBidi(d)) {
          const s = bidiSign(d) * CURVE_OFFSET;
          const mx = (x1 + x2) / 2 + s * (-dy / dist);
          const my = (y1 + y2) / 2 + s * ( dx / dist);
          return 'M' + x1 + ',' + y1 + 'Q' + mx + ',' + my + ' ' + x2 + ',' + y2;
        }
        return 'M' + x1 + ',' + y1 + 'L' + x2 + ',' + y2;
      }

      // Arrow marker — refX=10 puts the tip exactly at the path endpoint
      svgSel.append('defs').append('marker')
        .attr('id', 'g-arrow').attr('viewBox', '0 -5 10 10')
        .attr('refX', 10).attr('refY', 0)
        .attr('markerWidth', 8).attr('markerHeight', 8)
        .attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', 'var(--vscode-foreground, #ccc)');

      const g = svgSel.append('g');

      // Zoom
      const zoom = d3.zoom().scaleExtent([0.15, 4])
        .on('zoom', (ev) => g.attr('transform', ev.transform));
      graphZoom = zoom;
      svgSel.call(zoom);

      // Force simulation
      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(edges).id((n) => n.id).distance(280))
        .force('charge', d3.forceManyBody().strength(-900))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collision', d3.forceCollide(80));
      graphSimulation = simulation;

      // Visible edge paths (use path not line — supports curves for bidi edges)
      const link = g.append('g').selectAll('path')
        .data(edges).join('path')
        .attr('class', 'g-link')
        .attr('stroke-width', (e) => isBidi(e) ? 2 : 1.5)
        .attr('stroke-opacity', (e) => isBidi(e) ? 0.75 : 0.55)
        .attr('fill', 'none')
        .attr('marker-end', 'url(#g-arrow)');

      // Transparent wider hit area for edge hover
      const linkHit = g.append('g').selectAll('path')
        .data(edges).join('path')
        .attr('stroke', 'transparent').attr('stroke-width', 14)
        .attr('fill', 'none').attr('cursor', 'pointer');

      // Custom HTML tooltip (full text, word-wrapped, follows cursor)
      const graphPane = document.getElementById('graph-pane');
      const tooltip   = document.getElementById('g-tooltip');

      function posTooltip(ev) {
        const rect = graphPane.getBoundingClientRect();
        let x = ev.clientX - rect.left + 14;
        let y = ev.clientY - rect.top  - 10;
        if (x + 296 > graphPane.clientWidth)  x = ev.clientX - rect.left - 296;
        if (y + 60   > graphPane.clientHeight) y = ev.clientY - rect.top  - 60;
        tooltip.style.left = x + 'px';
        tooltip.style.top  = y + 'px';
      }

      linkHit
        .on('mouseenter', (ev, e) => {
          tooltip.textContent = (isBidi(e) ? '⇄ ' : '') + e.label;
          tooltip.style.display = 'block';
          posTooltip(ev);
        })
        .on('mousemove', (ev) => posTooltip(ev))
        .on('mouseleave', () => { tooltip.style.display = 'none'; });

      // Node groups
      let nodeDragged = false;
      const nodeG = g.append('g').selectAll('g')
        .data(nodes).join('g').attr('cursor', 'pointer')
        .call(d3.drag()
          .on('start', (ev, d) => { nodeDragged = false; if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag',  (ev, d) => { nodeDragged = true; d.fx = ev.x; d.fy = ev.y; })
          .on('end',   (ev, d) => { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

      nodeG.append('circle').attr('r', NODE_R)
        .attr('fill', (_, i) => COLORS[i % COLORS.length])
        .attr('fill-opacity', 0.9)
        .attr('stroke', 'var(--vscode-editor-background, #1e1e1e)').attr('stroke-width', 2);

      nodeG.append('text').attr('class', 'g-node-label')
        .attr('text-anchor', 'middle').attr('dy', NODE_R + 16).attr('font-size', 12)
        .attr('pointer-events', 'none')
        .text((n) => n.label);

      // Node tooltip (show files on hover) + click to open primary file
      nodeG
        .on('mouseenter', (ev, n) => {
          if (!n.files || !n.files.length) return;
          let html = '<strong style="font-size:12px;">' + n.label + '</strong>'
                   + '<ul style="margin:6px 0 0 0;padding:0;list-style:none;">';
          for (const f of n.files) {
            html += '<li style="padding:4px 0;border-top:1px solid rgba(255,255,255,0.08);">'
                  + '<span style="font-family:monospace;font-size:10px;opacity:0.7;">' + f.path + '</span>';
            if (f.usage) {
              html += '<br><span style="font-size:11px;">' + f.usage + '</span>';
            }
            html += '</li>';
          }
          html += '</ul><div style="margin-top:6px;font-size:10px;opacity:0.5;">点击打开文件</div>';
          tooltip.innerHTML = html;
          tooltip.style.display = 'block';
          posTooltip(ev);
        })
        .on('mousemove', (ev) => { if (tooltip.style.display !== 'none') posTooltip(ev); })
        .on('mouseleave', () => { tooltip.style.display = 'none'; })
        .on('click', (ev, n) => {
          if (nodeDragged) { nodeDragged = false; return; }
          if (!n.files || !n.files.length) return;
          const primary = n.files.find((f) => /\.(tsx|vue)$/i.test(f.path)) ?? n.files[0];
          vscode.postMessage({ type: 'openFile', filePath: currentModulePath + '/' + primary.path });
        });

      simulation.on('tick', () => {
        link.attr('d', makePath);
        linkHit.attr('d', makePath);
        nodeG.attr('transform', (n) => 'translate(' + n.x + ',' + n.y + ')');
      });
    }

    function waitForMarkmap(maxMs = 8000) {
      return new Promise((resolve) => {
        const start = Date.now();
        (function poll() {
          if (window.markmap?.Transformer && window.markmap?.Markmap) return resolve(true);
          if (Date.now() - start > maxMs) return resolve(false);
          setTimeout(poll, 60);
        })();
      });
    }

    async function renderMindmap(markdown) {
      await waitForMarkmap();
      const { Transformer, Markmap } = window.markmap;
      const transformer = new Transformer();
      const { root } = transformer.transform(markdown);
      foldAtDepth(root, 0);
      if (!mm) {
        mm = Markmap.create(svgEl, { zoom: true, pan: true });
      }
      await mm.setData(root);
      mm.fit();
    }

    function foldAtDepth(node, depth) {
      if (depth >= 3 && node.children && node.children.length > 0) {
        node.payload = Object.assign({}, node.payload, { fold: 1 });
      }
      for (const child of (node.children || [])) {
        foldAtDepth(child, depth + 1);
      }
    }

    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('glimpse-file:')) {
        e.preventDefault();
        e.stopPropagation();
        const filePath = decodeURIComponent(href.slice('glimpse-file:'.length));
        vscode.postMessage({ type: 'openFile', filePath });
      } else if (href.startsWith('glimpse-pkg:')) {
        e.preventDefault();
        e.stopPropagation();
        const pkg = decodeURIComponent(href.slice('glimpse-pkg:'.length));
        vscode.postMessage({ type: 'openUrl', url: 'https://www.npmjs.com/package/' + pkg });
      } else if (href.startsWith('glimpse-mod:')) {
        e.preventDefault();
        e.stopPropagation();
        const folderPath = decodeURIComponent(href.slice('glimpse-mod:'.length));
        vscode.postMessage({ type: 'openFolder', folderPath });
      }
    }, true);

    // ── step list helpers ──────────────────────────────────
    function clearStepTimer() {
      if (stepTimerInterval) { clearInterval(stepTimerInterval); stepTimerInterval = null; }
    }

    function addStep(text) {
      clearStepTimer();
      if (activeStepEl) {
        activeStepEl.classList.remove('step-active');
        activeStepEl.classList.add('step-done');
        activeStepEl.querySelector('.step-icon').textContent = '✓';
      }
      const row = document.createElement('div');
      row.className = 'step-row step-active';
      row.innerHTML = '<span class="step-icon"><span class="spinner" style="display:inline-block;"></span></span>'
                    + '<span class="step-text"></span>'
                    + '<span class="step-timer">0s</span>';
      row.querySelector('.step-text').textContent = text;
      loadingSteps.appendChild(row);
      activeStepEl = row;
      stepStartTime = Date.now();
      const timerEl = row.querySelector('.step-timer');
      stepTimerInterval = setInterval(() => {
        const ms = Date.now() - stepStartTime;
        timerEl.textContent = ms < 10000
          ? (ms / 1000).toFixed(1) + 's'
          : Math.floor(ms / 1000) + 's';
      }, 100);
    }

    function finalizeSteps() {
      clearStepTimer();
      if (activeStepEl) {
        activeStepEl.classList.remove('step-active');
        activeStepEl.classList.add('step-done');
        activeStepEl.querySelector('.step-icon').textContent = '✓';
        activeStepEl = null;
      }
    }

    window.addEventListener('message', async (event) => {
      const msg = event.data;

      if (msg.type === 'loading') {
        currentModulePath = msg.modulePath;
        clearStepTimer();
        loadingSteps.innerHTML = '';
        activeStepEl = null;
        const short = msg.modulePath.split('/').filter(Boolean).slice(-2).join('/');
        loadingPath.textContent = short || msg.modulePath;
        showOnly(stateLoading);
        return;
      }

      if (msg.type === 'progress') {
        addStep(msg.step);
        return;
      }

      if (msg.type === 'error') {
        if (msg.modulePath) currentModulePath = msg.modulePath;
        finalizeSteps();
        showOnly(stateError);
        errorMessage.textContent = '⚠ ' + msg.message;
        return;
      }

      if (msg.type === 'data') {
        finalizeSteps();
        currentGraph = msg.graph || null;
        // Reset to mindmap tab on new analysis
        activeTab = 'mindmap';
        document.getElementById('mindmap-pane').style.display = 'flex';
        document.getElementById('graph-pane').style.display = 'none';
        document.querySelectorAll('.tab-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.tab === 'mindmap');
        });
        showOnly(stateMindmap);
        try {
          await renderMindmap(msg.markdown);
          vscode.setState({ markdown: msg.markdown, graph: msg.graph, modulePath: currentModulePath });
        } catch (err) {
          showOnly(stateError);
          stateError.textContent = '渲染失败: ' + (err && err.message || String(err));
        }
      }
    });

    const saved = vscode.getState();
    if (saved && saved.markdown) {
      currentModulePath = saved.modulePath || '';
      currentGraph = saved.graph || null;
      showOnly(stateMindmap);
      renderMindmap(saved.markdown).catch((err) => {
        showOnly(stateError);
        errorMessage.textContent = '⚠ 恢复失败: ' + (err && err.message || String(err));
      });
    }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
