import * as vscode from 'vscode';

export type AIProvider = 'auto' | 'claude' | 'codex';

export function getAIProvider(): AIProvider {
  return (
    vscode.workspace.getConfiguration('glimpse').get<AIProvider>('aiProvider') ?? 'auto'
  );
}
