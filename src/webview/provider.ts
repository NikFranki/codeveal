import * as vscode from 'vscode';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './messages';

export class GlimpseViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'glimpse.moduleView';

  private _view?: vscode.WebviewView;
  // Queue messages sent before the view is resolved
  private _pendingMessages: ExtensionToWebviewMessage[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage((msg: WebviewToExtensionMessage) => {
      switch (msg.type) {
        case 'openFile':
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.filePath));
          break;
        case 'drillDown':
          vscode.commands.executeCommand(
            'glimpse.analyzeModule',
            vscode.Uri.file(msg.folderPath)
          );
          break;
      }
    });

    // Flush any messages queued before view was ready
    for (const msg of this._pendingMessages) {
      webviewView.webview.postMessage(msg);
    }
    this._pendingMessages = [];
  }

  postMessage(message: ExtensionToWebviewMessage): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    } else {
      this._pendingMessages.push(message);
    }
  }

  focusView(): Thenable<unknown> {
    return vscode.commands.executeCommand(`${GlimpseViewProvider.viewId}.focus`);
  }

  private _getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Glimpse</title>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    #welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin-top: 40px;
      opacity: 0.7;
      text-align: center;
    }
    #loading { display: none; }
    #error   { display: none; color: var(--vscode-errorForeground); }
    #mindmap { display: none; }
    .spinner {
      width: 24px; height: 24px;
      border: 3px solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="welcome">
    <p>右键文件夹 → <strong>Glimpse: 分析此模块</strong></p>
  </div>
  <div id="loading">
    <div class="spinner"></div>
    <p id="loading-path"></p>
  </div>
  <div id="error"></div>
  <div id="mindmap"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const welcome = document.getElementById('welcome');
    const loading = document.getElementById('loading');
    const loadingPath = document.getElementById('loading-path');
    const errorDiv = document.getElementById('error');
    const mindmap = document.getElementById('mindmap');

    window.addEventListener('message', (event) => {
      const msg = event.data;
      welcome.style.display = 'none';
      loading.style.display = 'none';
      errorDiv.style.display = 'none';
      mindmap.style.display = 'none';

      if (msg.type === 'loading') {
        loading.style.display = 'flex';
        loadingPath.textContent = msg.modulePath;
      } else if (msg.type === 'error') {
        errorDiv.style.display = 'block';
        errorDiv.textContent = msg.message;
      } else if (msg.type === 'data') {
        mindmap.style.display = 'block';
        mindmap.textContent = JSON.stringify(msg.analysis, null, 2);
      }
    });
  </script>
</body>
</html>`;
  }
}
