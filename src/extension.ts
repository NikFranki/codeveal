import * as vscode from 'vscode';
import { CodevealPanelManager } from './webview/provider';
import { analyzeModuleCommand } from './commands/analyzeModule';

export function activate(context: vscode.ExtensionContext): void {
  const manager = CodevealPanelManager.getInstance(context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand('codeveal.analyzeModule', (uri: vscode.Uri) => {
      analyzeModuleCommand(manager, uri).catch((err: unknown) => {
        vscode.window.showErrorMessage(
          `Codeveal 出错: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    })
  );
}

export function deactivate(): void {}
