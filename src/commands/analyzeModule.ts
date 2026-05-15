import * as vscode from 'vscode';
import { GlimpseViewProvider } from '../webview/provider';

export async function analyzeModuleCommand(
  provider: GlimpseViewProvider,
  uri: vscode.Uri
): Promise<void> {
  // Ensure sidebar is visible before posting messages
  await provider.focusView();
  provider.postMessage({ type: 'loading', modulePath: uri.fsPath });

  try {
    // Phase 2: static analysis
    // Phase 3: AI call
    // Phase 4: render mindmap
    // Placeholder until those phases are implemented:
    vscode.window.showInformationMessage(`Glimpse: 正在分析 ${uri.fsPath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    provider.postMessage({ type: 'error', message });
  }
}
