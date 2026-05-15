import * as fs from 'fs';
import * as path from 'path';

export interface MFConfig {
  appName: string;
  remoteNames: string[];
  exposes: Record<string, string>;
  remotes: Record<string, string>;
}

export function findMFConfig(startPath: string): MFConfig | null {
  const configPath = locateWebpackConfig(startPath);
  if (!configPath) return null;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return parseMFPlugin(content);
  } catch {
    return null;
  }
}

function locateWebpackConfig(startPath: string): string | null {
  let dir = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);

  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, 'webpack.config.js');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function parseMFPlugin(content: string): MFConfig | null {
  // Only process if ModuleFederationPlugin is mentioned
  if (!content.includes('ModuleFederationPlugin')) return null;

  const appName = extractStringField(content, 'name') ?? '';
  const remotesBlock = extractBlock(content, 'remotes');
  const exposesBlock = extractBlock(content, 'exposes');

  const remotes = parseKVBlock(remotesBlock);
  const exposes = parseKVBlock(exposesBlock);

  if (!appName && !Object.keys(remotes).length && !Object.keys(exposes).length) {
    return null;
  }

  return { appName, remoteNames: Object.keys(remotes), exposes, remotes };
}

/** Extract the string value of a simple key in a JS object literal. */
function extractStringField(content: string, key: string): string | null {
  const re = new RegExp(`\\b${key}\\s*:\\s*['"]([^'"]+)['"]`);
  return content.match(re)?.[1] ?? null;
}

/**
 * Extract the text inside the braces of a key whose value is an object literal.
 * Handles nested braces by counting depth.
 */
function extractBlock(content: string, key: string): string {
  const re = new RegExp(`\\b${key}\\s*:\\s*\\{`);
  const match = re.exec(content);
  if (!match) return '';

  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;

  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }

  return content.slice(start, i - 1);
}

/** Parse a block of `'key': 'value'` pairs (one level, simple strings). */
function parseKVBlock(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /['"]?(\w[\w-]*)['"]?\s*:\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}
