import * as vscode from 'vscode';

export type AIProvider = 'auto' | 'claude' | 'codex';

export function getAIProvider(): AIProvider {
  return (
    vscode.workspace.getConfiguration('codeveal').get<AIProvider>('aiProvider') ?? 'auto'
  );
}

const DEFAULT_COMPANY_SCOPES = ['@scfe', '@spx', '@ssc', '@sc/', 'ssc-', 'sc-cli', 'react-pro-components'];

export function getCompanyScopes(): string[] {
  return (
    vscode.workspace
      .getConfiguration('codeveal')
      .get<string[]>('companyScopes') ?? DEFAULT_COMPANY_SCOPES
  );
}

// Haiku by default: ~5-8x faster than Sonnet for structured JSON extraction.
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export function getClaudeModel(): string {
  return (
    vscode.workspace.getConfiguration('codeveal').get<string>('claudeModel') ?? DEFAULT_CLAUDE_MODEL
  );
}

const DEFAULT_AI_TIMEOUT_S = 360;

export function getAITimeoutMs(): number {
  const s = vscode.workspace.getConfiguration('codeveal').get<number>('aiTimeout') ?? DEFAULT_AI_TIMEOUT_S;
  return Math.max(30, s) * 1000;
}
