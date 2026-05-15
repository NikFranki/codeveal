import * as fs from 'fs';
import * as path from 'path';
import { ModuleAnalysis } from '../../analyzer/types';

/**
 * Converts a ModuleAnalysis into markmap-flavored markdown.
 * File-linked nodes use the `glimpse-file:` scheme so the webview
 * can intercept clicks and post openFile messages back to the extension.
 */
export function buildMarkmapMarkdown(analysis: ModuleAnalysis): string {
  const moduleName = path.basename(analysis.modulePath);
  const lines: string[] = [`# ${moduleName}`];

  // ── 模块职责 ──────────────────────────────────────────────
  lines.push('', '## 模块职责', '', `- ${analysis.ai.responsibility}`);

  // ── 对外暴露 ──────────────────────────────────────────────
  if (analysis.publicExports.length > 0) {
    lines.push('', '## 对外暴露');
    for (const e of analysis.publicExports) {
      const desc = analysis.exportDescriptions[e.name] ?? '';
      const encoded = encodeURIComponent(e.filePath);
      const label = desc ? `${e.name} — ${desc}` : e.name;
      lines.push(`- [${label} *(${e.kind})*](glimpse-file:${encoded})`);
    }
  }

  // ── 外部依赖 ──────────────────────────────────────────────
  if (analysis.externalDeps.length > 0) {
    lines.push('', '## 外部依赖');
    for (const dep of analysis.externalDeps) {
      lines.push(`- ${dep}`);
    }
  }

  // ── MF 跨 App 依赖 ────────────────────────────────────────
  if (analysis.mfDeps.length > 0) {
    lines.push('', '## MF 跨 App 依赖');
    for (const dep of analysis.mfDeps) {
      lines.push(`- ${dep.remote}${dep.exposedPath}`);
    }
  }

  // ── 数据流 ────────────────────────────────────────────────
  if (analysis.ai.dataFlow.length > 0) {
    lines.push('', '## 数据流');
    for (const flow of analysis.ai.dataFlow) {
      const from = linkifyPaths(flow.from, analysis.modulePath);
      const through = linkifyPaths(flow.through, analysis.modulePath);
      const to = linkifyPaths(flow.to, analysis.modulePath);
      lines.push(`- ${from} → ${through} → ${to}`);
    }
  }

  return lines.join('\n');
}

/**
 * Detect relative file path patterns (e.g. "list/index.tsx", "api.ts") in a
 * plain-text string and wrap any that actually exist on disk into a
 * glimpse-file: link so markmap renders them as clickable anchors.
 */
function linkifyPaths(text: string, modulePath: string): string {
  // Matches optional leading folder segments + filename with a known extension
  return text.replace(
    /\b((?:[\w-]+\/)*[\w-]+\.(?:tsx|ts|vue|js))\b/g,
    (match) => {
      const absPath = path.join(modulePath, match);
      try {
        fs.accessSync(absPath);
        return `[${match}](glimpse-file:${encodeURIComponent(absPath)})`;
      } catch {
        return match; // file not found — keep as plain text
      }
    }
  );
}
