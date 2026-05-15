import * as vscode from 'vscode';
import { GlimpseViewProvider } from '../webview/provider';
import { analyzeModule } from '../analyzer/index';

export async function analyzeModuleCommand(
  provider: GlimpseViewProvider,
  uri: vscode.Uri
): Promise<void> {
  await provider.focusView();
  provider.postMessage({ type: 'loading', modulePath: uri.fsPath });

  try {
    const skeleton = await analyzeModule(uri.fsPath);
    // Phase 3: AI call will enrich skeleton → ModuleAnalysis
    // Phase 4: webview will render the mindmap
    provider.postMessage({ type: 'data', analysis: skeleton });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    provider.postMessage({ type: 'error', message });
  }
}
