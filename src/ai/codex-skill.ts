import { execFile } from 'child_process';
import { promisify } from 'util';
import { AISkill } from './types';
import { spawnAndCollect } from './claude-skill';

const execFileAsync = promisify(execFile);

// P1: Codex CLI adapter. Shape mirrors ClaudeSkill; wire up args when Codex ships stable non-interactive mode.
export class CodexSkill implements AISkill {
  readonly name = 'codex';

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('which', ['codex']);
      return true;
    } catch {
      return false;
    }
  }

  run(prompt: string): Promise<string> {
    // codex "prompt" runs in auto-approve / quiet mode
    return spawnAndCollect('codex', [prompt]);
  }
}
