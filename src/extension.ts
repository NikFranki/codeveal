import * as vscode from 'vscode';
import { GlimpsePanelManager } from './webview/provider';
import { analyzeModuleCommand } from './commands/analyzeModule';

export function activate(context: vscode.ExtensionContext): void {
  const manager = GlimpsePanelManager.getInstance(context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand('glimpse.analyzeModule', (uri: vscode.Uri) => {
      analyzeModuleCommand(manager, uri).catch((err: unknown) => {
        vscode.window.showErrorMessage(
          `Glimpse 出错: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    })
  );
}

export function deactivate(): void {}
