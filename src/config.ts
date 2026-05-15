import * as vscode from 'vscode';

export type AIProvider = 'auto' | 'claude' | 'codex';

export function getAIProvider(): AIProvider {
  return (
    vscode.workspace.getConfiguration('glimpse').get<AIProvider>('aiProvider') ?? 'auto'
  );
}

const DEFAULT_COMPANY_SCOPES = ['@scfe', '@spx', '@ssc', '@sc/', 'ssc-', 'sc-cli'];

export function getCompanyScopes(): string[] {
  return (
    vscode.workspace
      .getConfiguration('glimpse')
      .get<string[]>('companyScopes') ?? DEFAULT_COMPANY_SCOPES
  );
}
