import { AISkill } from './types';
import { ClaudeSkill } from './claude-skill';
import { CodexSkill } from './codex-skill';
import { AIProvider } from '../config';

export async function detectSkill(provider: AIProvider = 'auto'): Promise<AISkill | null> {
  let candidates: AISkill[];

  switch (provider) {
    case 'claude':
      candidates = [new ClaudeSkill()];
      break;
    case 'codex':
      candidates = [new CodexSkill()];
      break;
    default:
      candidates = [new ClaudeSkill(), new CodexSkill()];
  }

  for (const skill of candidates) {
    if (await skill.isAvailable()) return skill;
  }
  return null;
}
