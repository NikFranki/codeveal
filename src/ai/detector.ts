import { AISkill } from './types';
import { ClaudeSkill } from './claude-skill';
import { CodexSkill } from './codex-skill';
import { AIProvider } from '../config';

export async function detectSkill(
  provider: AIProvider = 'auto',
  claudeModel?: string
): Promise<AISkill | null> {
  const claude = claudeModel ? new ClaudeSkill(claudeModel) : new ClaudeSkill();
  let candidates: AISkill[];

  switch (provider) {
    case 'claude':
      candidates = [claude];
      break;
    case 'codex':
      candidates = [new CodexSkill()];
      break;
    default:
      candidates = [claude, new CodexSkill()];
  }

  for (const skill of candidates) {
    if (await skill.isAvailable()) return skill;
  }
  return null;
}
