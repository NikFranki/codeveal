import { ModuleSkeleton } from '../analyzer/types';
import { AIRawOutput } from './types';

const MAX_FILES = 30;
const MAX_EXPORTS_PER_FILE = 8;

export function buildPrompt(skeleton: ModuleSkeleton): string {
  const lines: string[] = [
    '根据以下前端模块骨架，仅返回 JSON（不要 markdown 代码块，不要额外文字）：',
    '',
    '{',
    '  "responsibility": "一句话描述模块的核心职责",',
    '  "dataFlow": [{ "from": "数据来源", "through": "处理环节", "to": "最终去向" }],',
    '  "exportDescriptions": { "<导出名>": "一句话描述该导出的功能" }',
    '}',
    '',
    '--- 模块骨架 ---',
    `路径: ${skeleton.modulePath}`,
    `文件数: ${skeleton.files.length}`,
    '',
  ];

  if (skeleton.publicExports.length > 0) {
    lines.push('对外导出:');
    for (const e of skeleton.publicExports) {
      lines.push(`- ${e.name} (${e.kind})`);
    }
    lines.push('');
  }

  if (skeleton.companyDeps.length > 0) {
    lines.push(`公司共享库: ${skeleton.companyDeps.join(', ')}`, '');
  }

  if (skeleton.externalDeps.length > 0) {
    lines.push(`npm 包: ${skeleton.externalDeps.join(', ')}`, '');
  }

  if (skeleton.mfDeps.length > 0) {
    lines.push('MF 跨 App 依赖:');
    for (const dep of skeleton.mfDeps) {
      lines.push(`- ${dep.remote}${dep.exposedPath}`);
    }
    lines.push('');
  }

  const displayFiles = skeleton.files.slice(0, MAX_FILES);
  if (displayFiles.length > 0) {
    lines.push('文件清单:');
    for (const f of displayFiles) {
      const exportsStr =
        f.exports.length > 0
          ? `导出 [${f.exports.slice(0, MAX_EXPORTS_PER_FILE).join(', ')}]`
          : '';
      const nonLocal = [
        ...new Set(
          f.imports
            .filter((i) => i.kind !== 'local')
            .map((i) =>
              i.source.startsWith('@')
                ? i.source.split('/').slice(0, 2).join('/')
                : i.source.split('/')[0]
            )
        ),
      ];
      const importsStr = nonLocal.length > 0 ? `引用 [${nonLocal.join(', ')}]` : '';
      const detail = [exportsStr, importsStr].filter(Boolean).join(', ');
      lines.push(`- ${f.relativePath}${detail ? ': ' + detail : ''}`);
    }
    if (skeleton.files.length > MAX_FILES) {
      lines.push(`  ... 及其他 ${skeleton.files.length - MAX_FILES} 个文件`);
    }
  }

  return lines.join('\n');
}

export function parseAIOutput(raw: string): AIRawOutput {
  // 1. Try whole string
  const direct = tryParse(raw);
  if (direct) return validate(direct);

  // 2. Fenced code block
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const fromFence = tryParse(fenced[1]);
    if (fromFence) return validate(fromFence);
  }

  // 3. First { ... } span
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const fromSpan = tryParse(raw.slice(start, end + 1));
    if (fromSpan) return validate(fromSpan);
  }

  throw new Error(`AI 返回了无法解析的 JSON：${raw.slice(0, 200)}`);
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validate(data: unknown): AIRawOutput {
  if (typeof data !== 'object' || data === null) {
    throw new Error('AI 输出不是对象');
  }
  const obj = data as Record<string, unknown>;

  const dataFlow = Array.isArray(obj['dataFlow'])
    ? (obj['dataFlow'] as Array<Record<string, unknown>>).map((item) => ({
        from: String(item['from'] ?? ''),
        through: String(item['through'] ?? ''),
        to: String(item['to'] ?? ''),
      }))
    : [];

  const exportDescriptions: Record<string, string> =
    typeof obj['exportDescriptions'] === 'object' && obj['exportDescriptions'] !== null
      ? Object.fromEntries(
          Object.entries(obj['exportDescriptions'] as Record<string, unknown>).map(([k, v]) => [
            k,
            String(v),
          ])
        )
      : {};

  return {
    responsibility:
      typeof obj['responsibility'] === 'string' ? obj['responsibility'] : '（未能解析）',
    dataFlow,
    exportDescriptions,
  };
}
