import * as vscode from 'vscode';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './messages';
import { buildMarkmapMarkdown } from './ui/mindmap';
import { buildFeatureGraph } from './ui/feature-graph';

/**
 * Manages a singleton WebviewPanel in the main editor area.
 * Replaces the old sidebar WebviewView to give the mindmap full screen space.
 */
export class CodevealPanelManager {
  private static _instance?: CodevealPanelManager;

  private _panel?: vscode.WebviewPanel;
  private _pendingMessages: ExtensionToWebviewMessage[] = [];

  private constructor(private readonly _extensionUri: vscode.Uri) {}

  static getInstance(extensionUri: vscode.Uri): CodevealPanelManager {
    if (!CodevealPanelManager._instance) {
      CodevealPanelManager._instance = new CodevealPanelManager(extensionUri);
    }
    return CodevealPanelManager._instance;
  }

  /** Create the panel (or reveal it if already open). */
  show(): void {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'codeveal.mindmap',
      'Codeveal',
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
        case 'openFileAtSymbol':
          openFileAtSymbol(msg.filePath, msg.symbol);
          break;
        case 'openFolder':
          vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(msg.folderPath));
          break;
        case 'openUrl':
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
        case 'drillDown':
          vscode.commands.executeCommand(
            'codeveal.analyzeModule',
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
  <title>Codeveal</title>
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

    /* ── reset-folds button ── */
    #g-reset-folds {
      position: absolute;
      bottom: 12px; right: 12px;
      padding: 4px 10px;
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: 1px solid var(--vscode-widget-border, #555);
      border-radius: 3px; cursor: pointer; font-size: 11px;
      z-index: 5; opacity: 0.8;
    }
    #g-reset-folds:hover { opacity: 1; background: var(--vscode-button-secondaryHoverBackground, #45494e); }

    /* ── graph legend ── */
    #g-legend {
      position: absolute;
      top: 12px;
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
      max-height: 360px;
      overflow-x: hidden;
      overflow-y: auto;
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
    /* ── collapsible tooltip sections (click to expand) ── */
    .tip-section { margin-top: 6px; }
    .tip-section-hd {
      display: flex; align-items: center;
      font-size: 10px; opacity: 0.45;
      cursor: pointer; user-select: none;
    }
    .tip-section-hd:hover { opacity: 0.7; }
    .tip-section-hd::after { content: ' ▶'; font-size: 8px; margin-left: 2px; }
    .tip-section-bd {
      overflow: hidden; max-height: 0;
      opacity: 0;
      transition: max-height 0.2s ease, opacity 0.15s;
    }
    .tip-section.open .tip-section-bd { max-height: 200px; opacity: 1; }
    .tip-section.open .tip-section-hd { opacity: 0.8; }
    .tip-section.open .tip-section-hd::after { content: ' ▼'; }
    .tip-symbol {
      display: inline-block;
      font-family: monospace; font-size: 10px;
      padding: 1px 5px; margin: 2px 2px 0 0;
      border-radius: 3px;
      background: rgba(79,193,255,0.12);
      color: #7dd3f8;
      border: 1px solid rgba(79,193,255,0.25);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .tip-symbol:hover { background: rgba(79,193,255,0.25); border-color: rgba(79,193,255,0.5); text-decoration: underline; }
  </style>
</head>
<body>
  <div id="state-welcome">
    <div>💡</div>
    <p>右键文件夹 →<br><strong>Codeveal: 分析此模块</strong></p>
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
      <button id="g-reset-folds" style="display:none;">↩ 折叠目录</button>
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
    let nodeHideTimer = null;
    let expandedDirs = new Set();
    let currentTooltipNode = null;
    let tooltipRepos = null;

    // "Collapse dirs" reset button
    document.getElementById('g-reset-folds').addEventListener('click', () => {
      expandedDirs = new Set();
      if (currentGraph) renderGraph(currentGraph);
    });

    // Tooltip stays open while mouse is inside it (interactive sections)
    const gTooltipEl = document.getElementById('g-tooltip');
    gTooltipEl.addEventListener('mouseenter', () => {
      if (nodeHideTimer) { clearTimeout(nodeHideTimer); nodeHideTimer = null; }
    });
    gTooltipEl.addEventListener('mouseleave', () => {
      gTooltipEl.style.display = 'none';
      gTooltipEl.style.pointerEvents = 'none';
      nodeHideTimer = null;
    });
    // Click on section header toggles .open; click on symbol navigates to its definition
    gTooltipEl.addEventListener('click', (ev) => {
      const sym = ev.target.closest('.tip-symbol');
      if (sym) {
        if (currentTooltipNode && !currentTooltipNode.isDir) {
          const absPath = currentModulePath + '/' + currentTooltipNode.path;
          vscode.postMessage({ type: 'openFileAtSymbol', filePath: absPath, symbol: sym.dataset.symbol });
        }
        return;
      }
      const hd = ev.target.closest('.tip-section-hd');
      if (!hd) return;
      hd.closest('.tip-section').classList.toggle('open');
      // Delay matches max-height transition (0.2s); check tooltip is still visible before moving
      setTimeout(() => {
        if (gTooltipEl.style.display !== 'none' && tooltipRepos) tooltipRepos();
      }, 220);
    });

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
      if (!graphZoom || !graphSimulation) return;
      const pane = document.getElementById('graph-pane');
      const W = pane.clientWidth;
      const H = pane.clientHeight;
      const simNodes = graphSimulation.nodes();
      if (!simNodes.length) return;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of simNodes) {
        const r = n.isDir ? (n.rectW || 120) / 2 + 4 : 28;
        minX = Math.min(minX, n.x - r);
        maxX = Math.max(maxX, n.x + r);
        minY = Math.min(minY, n.y - r);
        maxY = Math.max(maxY, n.y + r);
      }

      const bw = maxX - minX || 1;
      const bh = maxY - minY || 1;
      const pad = 40;
      const scale = Math.min(0.95, (W - pad * 2) / bw, (H - pad * 2) / bh);
      const tx = W / 2 - scale * (minX + bw / 2);
      const ty = H / 2 - scale * (minY + bh / 2);

      d3.select('#graph-svg').transition().duration(300)
        .call(graphZoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    function computeVisibleGraph(graph) {
      const foldableDirs = new Set(graph.foldedDirs || []);
      if (!foldableDirs.size) return { nodes: graph.nodes, edges: graph.edges };

      // Build dir metadata
      const dirCounts = new Map();
      const dirDepths = new Map();
      for (const n of graph.nodes) {
        const d = n.dir;
        if (d && foldableDirs.has(d)) {
          dirCounts.set(d, (dirCounts.get(d) || 0) + 1);
          if (!dirDepths.has(d) || n.depth < dirDepths.get(d)) dirDepths.set(d, n.depth);
        }
      }

      // Map foldable file id → its dir
      const fileToDir = new Map();
      for (const n of graph.nodes) {
        if (n.dir && foldableDirs.has(n.dir)) fileToDir.set(n.id, n.dir);
      }

      // Build visible nodes: dir node always present; file nodes only when expanded
      const visibleNodes = [];
      const seenDirs = new Set();
      for (const n of graph.nodes) {
        if (n.dir && foldableDirs.has(n.dir)) {
          const dir = n.dir;
          if (!seenDirs.has(dir)) {
            seenDirs.add(dir);
            const isExpanded = expandedDirs.has(dir);
            const rw = Math.max(120, dir.length * 8 + 44);
            visibleNodes.push({
              id: 'dir:' + dir, label: dir, path: dir,
              depth: dirDepths.get(dir) || 0,
              dir: '', usage: '', state: [], behaviors: [], methods: [],
              isDir: true, fileCount: dirCounts.get(dir),
              expanded: isExpanded, rectW: rw,
            });
          }
          if (expandedDirs.has(n.dir)) visibleNodes.push(n);
        } else {
          visibleNodes.push(n);
        }
      }

      // Resolve a file id to its visible representative
      function resolveId(id) {
        const dir = fileToDir.get(id);
        if (!dir) return id;
        if (expandedDirs.has(dir)) return id;
        return 'dir:' + dir;
      }

      const edgeKeys = new Set();
      const visibleEdges = [];
      function addEdge(from, to, type) {
        if (from === to) return;
        const key = from + '\0' + to;
        if (!edgeKeys.has(key)) { edgeKeys.add(key); visibleEdges.push({ from, to, type }); }
      }

      // Remap import edges
      for (const e of graph.edges) addEdge(resolveId(e.from), resolveId(e.to), 'import');

      // Member edges: dir node → its expanded file nodes (for visual grouping)
      for (const dir of expandedDirs) {
        if (!foldableDirs.has(dir)) continue;
        const dirId = 'dir:' + dir;
        for (const n of graph.nodes) {
          if (n.dir === dir) addEdge(dirId, n.id, 'member');
        }
      }

      return { nodes: visibleNodes, edges: visibleEdges };
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
        t.textContent = '未检测到文件依赖关系';
        svgEl.appendChild(t);
        return;
      }

      const W = svgEl.clientWidth  || document.getElementById('graph-pane').clientWidth  || 800;
      const H = svgEl.clientHeight || document.getElementById('graph-pane').clientHeight || 600;

      // Show reset button when at least one dir has been expanded
      document.getElementById('g-reset-folds').style.display = expandedDirs.size > 0 ? 'block' : 'none';

      // Apply directory folding, then clone so D3 can mutate freely
      const vg = computeVisibleGraph(graph);
      const nodes = vg.nodes.map((n) => ({ ...n }));
      const edges = vg.edges.map((e) => ({ ...e, source: e.from, target: e.to }));

      const svgSel = d3.select(svgEl);
      const COLORS = d3.schemeTableau10;
      const NODE_R = 24;
      const CURVE_OFFSET = 34;
      function nodeR(n) { return n && n.isDir ? (n.rectW || 120) / 2 + 2 : NODE_R; }

      // Color nodes by AI feature group (same group = same colour)
      const groups = [...new Set(nodes.map((n) => n.featureGroup).filter(Boolean))];
      const groupColor = new Map(groups.map((g, i) => [g, COLORS[i % COLORS.length]]));

      // Update legend: arrow rule + one dot row per feature group
      const legendEl = document.getElementById('g-legend');
      legendEl.innerHTML =
        '<span class="g-legend-arrow">A ──→ B</span>'
        + '<span class="g-legend-text">A 导入了 B（A 依赖 B）</span>';
      if (groups.length) {
        legendEl.innerHTML += '<div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:5px;display:flex;flex-direction:column;gap:3px;">'
          + groups.map((g) =>
              '<div style="display:flex;align-items:center;gap:5px;">'
              + '<span style="width:9px;height:9px;border-radius:50%;flex-shrink:0;background:' + groupColor.get(g) + ';display:inline-block;"></span>'
              + '<span class="g-legend-text" style="font-size:10px;">' + g + '</span>'
              + '</div>'
            ).join('')
          + '</div>';
      }

      // Bidirectional edge detection (import edges only)
      const reverseSet = new Set(edges.filter((e) => e.type === 'import').map((e) => e.to + '\0' + e.from));
      function isBidi(e) { return e.type === 'import' && reverseSet.has(e.from + '\0' + e.to); }
      function bidiSign(e) { return e.from <= e.to ? 1 : -1; }

      function makePath(d) {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const r1 = nodeR(d.source) + 4;
        const r2 = nodeR(d.target) + 4;
        const x1 = d.source.x + (dx / dist) * r1;
        const y1 = d.source.y + (dy / dist) * r1;
        const x2 = d.target.x - (dx / dist) * r2;
        const y2 = d.target.y - (dy / dist) * r2;
        if (isBidi(d)) {
          const s = bidiSign(d) * CURVE_OFFSET;
          const mx = (x1 + x2) / 2 + s * (-dy / dist);
          const my = (y1 + y2) / 2 + s * ( dx / dist);
          return 'M' + x1 + ',' + y1 + 'Q' + mx + ',' + my + ' ' + x2 + ',' + y2;
        }
        return 'M' + x1 + ',' + y1 + 'L' + x2 + ',' + y2;
      }

      // Arrow marker
      svgSel.append('defs').append('marker')
        .attr('id', 'g-arrow').attr('viewBox', '0 -5 10 10')
        .attr('refX', 10).attr('refY', 0)
        .attr('markerWidth', 8).attr('markerHeight', 8)
        .attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', 'var(--vscode-foreground, #ccc)');

      const g = svgSel.append('g');

      // Zoom
      const zoom = d3.zoom().scaleExtent([0.1, 4])
        .on('zoom', (ev) => g.attr('transform', ev.transform));
      graphZoom = zoom;
      svgSel.call(zoom);

      // ── Hybrid force-DAG layout ────────────────────────────────
      // Strong forceY pulls each node to its topo depth level;
      // gentle forceX keeps the graph horizontally centred.
      const maxDepth = Math.max(...nodes.map((n) => n.depth), 0) || 1;
      const levelH   = (H * 0.78) / (maxDepth + 1);

      const simulation = d3.forceSimulation(nodes)
        .force('link',      d3.forceLink(edges).id((n) => n.id).distance(180).strength(0.25))
        .force('charge',    d3.forceManyBody().strength(-500))
        .force('x',         d3.forceX(W / 2).strength(0.04))
        .force('y',         d3.forceY((n) => (n.depth + 0.8) * levelH).strength(0.55))
        .force('collision', d3.forceCollide((n) => (n.isDir ? (n.rectW || 120) / 2 + 12 : NODE_R + 22)));
      graphSimulation = simulation;

      // Edge paths
      const link = g.append('g').selectAll('path')
        .data(edges).join('path')
        .attr('class', 'g-link')
        .attr('stroke-width', (e) => e.type === 'member' ? 1 : isBidi(e) ? 2 : 1.5)
        .attr('stroke-opacity', (e) => e.type === 'member' ? 0.2 : isBidi(e) ? 0.75 : 0.5)
        .attr('stroke-dasharray', (e) => e.type === 'member' ? '3,3' : null)
        .attr('fill', 'none')
        .attr('marker-end', (e) => e.type === 'member' ? null : 'url(#g-arrow)');

      // Wider transparent hit area for import edges only
      const linkHit = g.append('g').selectAll('path')
        .data(edges.filter((e) => e.type === 'import')).join('path')
        .attr('stroke', 'transparent').attr('stroke-width', 14)
        .attr('fill', 'none').attr('cursor', 'default');

      const graphPane = document.getElementById('graph-pane');
      const tooltip   = document.getElementById('g-tooltip');

      // Edge tooltip: cursor-following, no interaction
      function posEdgeTooltip(ev) {
        const rect = graphPane.getBoundingClientRect();
        let x = ev.clientX - rect.left + 14;
        let y = ev.clientY - rect.top  - 10;
        if (x + 240 > graphPane.clientWidth)  x = ev.clientX - rect.left - 240;
        if (y + 40  > graphPane.clientHeight) y = ev.clientY - rect.top  - 40;
        tooltip.style.left = x + 'px';
        tooltip.style.top  = y + 'px';
      }

      linkHit
        .on('mouseenter', (ev, e) => {
          if (nodeHideTimer) { clearTimeout(nodeHideTimer); nodeHideTimer = null; }
          const fmt = (id) => id.startsWith('dir:') ? id.slice(4) + '/' : id;
          const fromPath = fmt(e.from);
          const toPath   = fmt(e.to);
          tooltip.innerHTML =
            '<div style="font-size:10px;opacity:0.5;margin-bottom:4px;">'
            + (isBidi(e) ? '⇄ 双向依赖' : '导入关系') + '</div>'
            + '<code style="font-size:10px;word-break:break-all;">' + fromPath + '</code>'
            + '<div style="font-size:11px;padding:3px 0 2px;opacity:0.6;">→ 导入了</div>'
            + '<code style="font-size:10px;word-break:break-all;">' + toPath + '</code>';
          tooltip.style.pointerEvents = 'none';
          tooltip.style.display = 'block';
          posEdgeTooltip(ev);
        })
        .on('mousemove',  (ev) => posEdgeTooltip(ev))
        .on('mouseleave', ()  => { tooltip.style.display = 'none'; });

      // Node tooltip: anchored to node, interactive (sections expand on click)
      function posNodeTooltip(n) {
        if (!n) return;
        const PAD = 6;
        const W = graphPane.clientWidth;
        const H = graphPane.clientHeight;

        const t  = d3.zoomTransform(svgEl);
        const nx = t.applyX(n.x);
        const ny = t.applyY(n.y);
        const nr = nodeR(n);

        tooltip.style.maxHeight = Math.min(360, H - PAD * 2) + 'px';

        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;

        // 左右：右边放得下就放右边，否则放左边
        const goLeft = nx + nr + 8 + tw > W - PAD;
        let left = goLeft ? nx - nr - 8 - tw : nx + nr + 8;
        left = Math.max(PAD, Math.min(left, W - tw - PAD));

        // 上下：顶部与节点对齐，超出再夹紧
        let top = ny - PAD;
        top = Math.max(PAD, Math.min(top, H - th - PAD));

        tooltip.style.left = left + 'px';
        tooltip.style.top  = top  + 'px';
      }

      // 展开 section 后只在溢出时才移动，不打扰正常位置
      function adjustTooltipPos() {
        const PAD = 6;
        const H = graphPane.clientHeight;
        tooltip.style.maxHeight = Math.min(360, H - PAD * 2) + 'px';
        const th  = tooltip.offsetHeight;
        const top = parseInt(tooltip.style.top) || 0;
        if (top + th > H - PAD) {
          tooltip.style.top = Math.max(PAD, H - th - PAD) + 'px';
        }
      }
      tooltipRepos = adjustTooltipPos;

      function buildNodeHTML(n) {
        if (n.isDir) {
          return '<strong style="font-size:12px;">' + (n.expanded ? '▼' : '▶') + ' 📁 ' + n.label + '/</strong>'
            + '<div style="font-size:11px;opacity:0.7;margin-top:3px;">' + n.fileCount + ' 个文件</div>';
        }
        const hasSymbols = (n.methods && n.methods.length) || (n.state && n.state.length);
        // ↗ badge in top-right corner when there are clickable symbols
        let html = '<strong style="font-size:12px;">' + n.label + '</strong>';
        if (n.usage) {
          html += '<div style="font-size:11px;opacity:0.7;margin-top:3px;">' + n.usage + '</div>';
        }
        if (n.state && n.state.length) {
          const stateChips = n.state.map(s =>
            '<span class="tip-symbol" data-symbol="' + s + '" title="跳转到 ' + s + '">' + s + '</span>'
          ).join('');
          html += '<div class="tip-section">'
                + '<div class="tip-section-hd">状态</div>'
                + '<div class="tip-section-bd">'
                + '<div style="padding-top:3px;">' + stateChips + '</div>'
                + '</div></div>';
        }
        if (n.behaviors && n.behaviors.length) {
          html += '<div class="tip-section"><div class="tip-section-hd">交互流转</div>'
                + '<div class="tip-section-bd">';
          for (const b of n.behaviors) {
            html += '<div style="font-size:11px;padding:2px 0 2px 6px;margin-top:2px;'
                  + 'border-left:2px solid rgba(255,255,255,0.12);">→ ' + b + '</div>';
          }
          html += '</div></div>';
        }
        if (n.methods && n.methods.length) {
          const methodChips = n.methods.slice(0, 8).map(m =>
            '<span class="tip-symbol" data-symbol="' + m + '" title="跳转到 ' + m + '">' + m + '</span>'
          ).join('');
          html += '<div class="tip-section"><div class="tip-section-hd">方法</div>'
                + '<div class="tip-section-bd">'
                + '<div style="padding-top:3px;">' + methodChips
                + (n.methods.length > 8 ? '<span style="font-size:10px;opacity:0.4;"> +' + (n.methods.length - 8) + '</span>' : '')
                + '</div></div></div>';
        }
        return html;
      }

      // ── Node groups ────────────────────────────────────────────
      let nodeDragged = false;
      const nodeG = g.append('g').selectAll('g')
        .data(nodes).join('g').attr('cursor', 'pointer')
        .call(d3.drag()
          .on('start', (ev, d) => { nodeDragged = false; if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag',  (ev, d) => { nodeDragged = true;  d.fx = ev.x; d.fy = ev.y; })
          .on('end',   (ev, d) => { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

      nodeG.each(function(n) {
        const sel = d3.select(this);
        if (n.isDir) {
          const rw = n.rectW || 120, rh = 28;
          sel.append('rect')
            .attr('x', -rw / 2).attr('y', -rh / 2)
            .attr('width', rw).attr('height', rh).attr('rx', 5)
            .attr('fill', n.expanded ? '#1a2a3a' : '#243447')
            .attr('fill-opacity', n.expanded ? 0.55 : 0.92)
            .attr('stroke', 'var(--vscode-foreground, #ccc)')
            .attr('stroke-width', 1.5).attr('stroke-dasharray', '5,3');
          sel.append('text')
            .attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', 11)
            .attr('fill', 'var(--vscode-foreground, #ccc)').attr('pointer-events', 'none')
            .text((n.expanded ? '▼ ' : '▶ ') + n.label);
          sel.append('text').attr('class', 'g-node-label')
            .attr('text-anchor', 'middle').attr('dy', rh / 2 + 14).attr('font-size', 10)
            .attr('pointer-events', 'none')
            .text(n.fileCount + ' 个文件 · 点击' + (n.expanded ? '折叠' : '展开'));
        } else {
          sel.append('circle').attr('r', NODE_R)
            .attr('fill', groupColor.get(n.featureGroup) ?? '#6c7a8a')
            .attr('fill-opacity', 0.9)
            .attr('stroke', 'var(--vscode-editor-background, #1e1e1e)').attr('stroke-width', 2);
          sel.append('text').attr('class', 'g-node-label')
            .attr('text-anchor', 'middle').attr('dy', NODE_R + 15).attr('font-size', 11)
            .attr('pointer-events', 'none')
            .text(n.label);
        }
      });

      nodeG
        .on('mouseenter', (ev, n) => {
          if (nodeHideTimer) { clearTimeout(nodeHideTimer); nodeHideTimer = null; }
          currentTooltipNode = n;
          tooltip.innerHTML = buildNodeHTML(n);
          tooltip.style.pointerEvents = 'auto';
          tooltip.style.display = 'block';
          posNodeTooltip(n);
        })
        .on('mouseleave', () => {
          nodeHideTimer = setTimeout(() => {
            tooltip.style.display = 'none';
            tooltip.style.pointerEvents = 'none';
            currentTooltipNode = null;
            nodeHideTimer = null;
          }, 150);
        })
        .on('click', (ev, n) => {
          if (nodeDragged) { nodeDragged = false; return; }
          if (n.isDir) {
            if (expandedDirs.has(n.path)) expandedDirs.delete(n.path);
            else expandedDirs.add(n.path);
            renderGraph(currentGraph);
            return;
          }
          const absPath = currentModulePath + '/' + n.path;
          const firstMethod = n.methods && n.methods[0];
          if (firstMethod) {
            vscode.postMessage({ type: 'openFileAtSymbol', filePath: absPath, symbol: firstMethod });
          } else {
            vscode.postMessage({ type: 'openFile', filePath: absPath });
          }
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
      if (href.startsWith('codeveal-file:')) {
        e.preventDefault();
        e.stopPropagation();
        const filePath = decodeURIComponent(href.slice('codeveal-file:'.length));
        vscode.postMessage({ type: 'openFile', filePath });
      } else if (href.startsWith('codeveal-pkg:')) {
        e.preventDefault();
        e.stopPropagation();
        const pkg = decodeURIComponent(href.slice('codeveal-pkg:'.length));
        vscode.postMessage({ type: 'openUrl', url: 'https://www.npmjs.com/package/' + pkg });
      } else if (href.startsWith('codeveal-mod:')) {
        e.preventDefault();
        e.stopPropagation();
        const folderPath = decodeURIComponent(href.slice('codeveal-mod:'.length));
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
        expandedDirs = new Set();
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
          vscode.setState({ markdown: msg.markdown, graph: msg.graph, modulePath: currentModulePath, expandedDirs: [...expandedDirs] });
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
      expandedDirs = new Set(saved.expandedDirs || []);
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

async function openFileAtSymbol(filePath: string, symbol: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  const lines = text.split('\n');

  // Match TS/JS function declarations, state variable declarations, and Vue data keys
  const patterns = [
    new RegExp(`\\bfunction\\s+${escapeRe(symbol)}\\b`),
    new RegExp(`\\b${escapeRe(symbol)}\\s*[:=]\\s*(?:async\\s+)?(?:function|\\()`),
    // React useState: const [symbol, setSomething] = useState(...)
    new RegExp(`\\bconst\\s+\\[${escapeRe(symbol)}[,\\]]`),
    // const/let/var declaration
    new RegExp(`\\b(?:const|let|var)\\s+${escapeRe(symbol)}\\b`),
    // Vue data() object key:  symbol:
    new RegExp(`^\\s*${escapeRe(symbol)}\\s*:`),
    // last resort: function call / usage
    new RegExp(`\\b${escapeRe(symbol)}\\s*\\(`),
  ];

  let lineIndex = -1;
  outer: for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      if (p.test(lines[i])) { lineIndex = i; break outer; }
    }
  }

  const pos = new vscode.Position(Math.max(lineIndex, 0), 0);
  const editor = await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos) });
  if (lineIndex >= 0) {
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
