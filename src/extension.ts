import * as vscode from 'vscode';
import { GlimpseViewProvider } from './webview/provider';
import { analyzeModuleCommand } from './commands/analyzeModule';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new GlimpseViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GlimpseViewProvider.viewId, provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('glimpse.analyzeModule', (uri: vscode.Uri) => {
      analyzeModuleCommand(provider, uri).catch((err: unknown) => {
        vscode.window.showErrorMessage(
          `Glimpse 出错: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    })
  );
}

export function deactivate(): void {}
