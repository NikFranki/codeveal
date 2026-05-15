import * as vscode from 'vscode';
import { GlimpseViewProvider } from '../webview/provider';
import { analyzeModule } from '../analyzer/index';
import { detectSkill } from '../ai/detector';
import { buildPrompt, parseAIOutput } from '../ai/prompt-builder';
import { getAIProvider } from '../config';
import { ModuleAnalysis } from '../analyzer/types';

export async function analyzeModuleCommand(
  provider: GlimpseViewProvider,
  uri: vscode.Uri
): Promise<void> {
  await provider.focusView();
  provider.postMessage({ type: 'loading', modulePath: uri.fsPath });

  try {
    const skeleton = await analyzeModule(uri.fsPath);
    const skill = await detectSkill(getAIProvider());

    let analysis: ModuleAnalysis;

    if (skill) {
      const prompt = buildPrompt(skeleton);
      const rawOutput = await skill.run(prompt);
      const aiOutput = parseAIOutput(rawOutput);

      analysis = {
        ...skeleton,
        ai: {
          responsibility: aiOutput.responsibility,
          dataFlow: aiOutput.dataFlow,
        },
        exportDescriptions: aiOutput.exportDescriptions,
      };
    } else {
      vscode.window.showWarningMessage(
        'Glimpse: 未检测到 claude 或 codex CLI，仅显示静态分析结果'
      );
      analysis = {
        ...skeleton,
        ai: { responsibility: '（未检测到 AI CLI，仅显示静态分析）', dataFlow: [] },
        exportDescriptions: {},
      };
    }

    provider.postMessage({ type: 'data', analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    provider.postMessage({ type: 'error', message });
  }
}
