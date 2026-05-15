import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'glimpse.analyzeModule',
    async (uri: vscode.Uri) => {
      vscode.window.showInformationMessage(`Glimpse: 分析 ${uri.fsPath}`);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
