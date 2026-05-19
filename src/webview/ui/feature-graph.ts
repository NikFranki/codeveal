import * as path from 'path';
import { ModuleAnalysis } from '../../analyzer/types';
import { FeatureGraphData, FeatureGraphNode } from '../messages';

const EXTENSIONS = ['.ts', '.tsx', '.vue', '.js'];

interface AIAnnotation {
  usage: string;
  state: string[];
  behaviors: string[];
  methods: string[];
  jsx?: string;
  featureGroup: string;
}

export function buildFeatureGraph(analysis: ModuleAnalysis): FeatureGraphData {
  const files = analysis.files.filter((f) => !f.relativePath.endsWith('.d.ts'));
  const fileIds = files.map((f) => norm(f.relativePath));
  const fileSet = new Set(fileIds);

  // Build AI annotation map: normalized path → annotation
  const aiMap = buildAIMap(analysis, fileSet);

  // Collect edges from local imports (deduplicated)
  const edgeKeys = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];

  for (const file of files) {
    const fromId = norm(file.relativePath);
    for (const imp of file.imports) {
      if (imp.kind !== 'local') continue;
      const toId = resolveLocalImport(file.relativePath, imp.source, fileSet);
      if (!toId || toId === fromId) continue;
      const key = fromId + '\0' + toId;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ from: fromId, to: toId });
      }
    }
  }

  // Compute DAG depth per file via Kahn's algorithm
  const depths = computeDepths(fileIds, edges);

  const nodes: FeatureGraphNode[] = files.map((f) => {
    const id = norm(f.relativePath);
    const ai = aiMap.get(id);
    return {
      id,
      label: shortLabel(f.relativePath),
      path: f.relativePath,
      depth: depths.get(id) ?? 0,
      usage: ai?.usage ?? '',
      state: ai?.state ?? [],
      behaviors: ai?.behaviors ?? [],
      methods: ai?.methods ?? [],
      jsx: ai?.jsx,
      featureGroup: ai?.featureGroup,
    };
  });

  return { nodes, edges };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildAIMap(analysis: ModuleAnalysis, fileSet: Set<string>): Map<string, AIAnnotation> {
  const map = new Map<string, AIAnnotation>();
  for (const feature of analysis.ai.dataFlow) {
    for (const comp of feature.components) {
      if (!comp.name) continue;
      const n = norm(comp.name);
      let key: string | null = null;
      if (fileSet.has(n)) {
        key = n;
      } else {
        for (const ext of EXTENSIONS) {
          const c = n.endsWith(ext) ? n : n + ext;
          if (fileSet.has(c)) { key = c; break; }
        }
      }
      if (key && !map.has(key)) {
        map.set(key, {
          usage: comp.usage ?? '',
          state: comp.state ?? [],
          behaviors: comp.behaviors ?? [],
          methods: comp.methods ?? [],
          jsx: comp.jsx,
          featureGroup: feature.feature,
        });
      }
    }
  }
  return map;
}

function computeDepths(ids: string[], edges: Array<{ from: string; to: string }>): Map<string, number> {
  const children = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const id of ids) { children.set(id, []); inDeg.set(id, 0); }
  for (const e of edges) {
    if (!children.has(e.from) || !children.has(e.to)) continue;
    children.get(e.from)!.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }

  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of ids) {
    if ((inDeg.get(id) ?? 0) === 0) { depth.set(id, 0); queue.push(id); }
  }

  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    const d = depth.get(u) ?? 0;
    for (const v of children.get(u) ?? []) {
      const nd = d + 1;
      if (nd > (depth.get(v) ?? 0)) depth.set(v, nd);
      const newIn = (inDeg.get(v) ?? 1) - 1;
      inDeg.set(v, newIn);
      if (newIn === 0) queue.push(v);
    }
  }

  // Cycle fallback: unvisited nodes get depth 0
  for (const id of ids) {
    if (!depth.has(id)) depth.set(id, 0);
  }
  return depth;
}

function resolveLocalImport(fileRelPath: string, source: string, fileSet: Set<string>): string | null {
  if (!source.startsWith('./') && !source.startsWith('../')) return null;
  const fileDir = norm(path.dirname(fileRelPath));
  const joined = path.posix
    .normalize(path.posix.join(fileDir === '.' ? '' : fileDir, source))
    .replace(/^\.\//, '');
  if (fileSet.has(joined)) return joined;
  for (const ext of EXTENSIONS) {
    if (fileSet.has(joined + ext)) return joined + ext;
  }
  for (const ext of EXTENSIONS) {
    const idx = joined + '/index' + ext;
    if (fileSet.has(idx)) return idx;
  }
  return null;
}

function shortLabel(relPath: string): string {
  const p = relPath.replace(/\\/g, '/');
  const base = (p.split('/').pop() ?? p);
  const noExt = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  // "index" alone is uninformative — use parent directory name instead
  if (noExt === 'index') {
    const parts = p.split('/');
    return parts.length >= 2 ? parts[parts.length - 2] : noExt;
  }
  return noExt;
}

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
