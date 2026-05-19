import { ModuleAnalysis } from '../../analyzer/types';
import { FeatureGraphData } from '../messages';

export function buildFeatureGraph(analysis: ModuleAnalysis): FeatureGraphData {
  const nodes = analysis.ai.dataFlow.map((f) => ({
    id: f.feature,
    label: f.feature,
    files: f.components
      .filter((c) => c.name)
      .map((c) => ({ path: c.name, usage: c.usage ?? '' })),
  }));
  const edges = analysis.ai.featureRelations.map((r) => ({
    from: r.from,
    to: r.to,
    label: r.label,
    source: r.source,
  }));
  return { nodes, edges };
}
