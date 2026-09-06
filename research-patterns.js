import { CLUSTER_MODELS, TRAITS, TRAIT_NAMES } from './model.js';

// Figure 6 (p. 801), with coefficients from the exemplar-marked rows in
// Tables 9–11. Match exact source names, never a personalized row order.
export const FIGURE_6_EXEMPLARS = Object.freeze({
  1: 'Subjective well-being: Life satisfaction',
  2: 'Intimate partner satisfaction',
  3: 'Safety performance',
  4: 'Salary',
  5: 'Training and job performance',
  6: 'Academic performance: Postsecondary',
  7: 'Organizational citizenship behavior: Change',
  8: 'Assessment center exercise: Leaderless group discussion',
  9: 'Organizational commitment: Affective',
  10: 'Conflict resolution style: Integrating',
});

export const PATTERN_VIEWS = Object.freeze({
  average: 'Cluster average',
  exemplar: 'Paper’s exemplar',
});

// Shared by every cluster and both views, regardless of the entered profile.
export const PATTERN_SCALE = Object.freeze({ min: -0.25, max: 0.25 });

export function getResearchPattern(clusterId, view = 'average') {
  const cluster = CLUSTER_MODELS.find(model => model.numericId === clusterId);
  if (!cluster || !Object.hasOwn(PATTERN_VIEWS, view)) throw new RangeError('Unknown research cluster or pattern view.');
  const sourceName = FIGURE_6_EXEMPLARS[clusterId];
  const exemplar = cluster.rows.find(row => row.sourceName === sourceName);
  if (!exemplar) throw new Error(`Missing Figure 6 exemplar: ${sourceName}`);
  // model.js already removes the small mean left by two-decimal source rounding.
  const values = view === 'average' ? cluster.pattern : exemplar.pattern;
  return {
    clusterId, clusterName: cluster.name, view, label: PATTERN_VIEWS[view],
    sourceName: view === 'exemplar' ? sourceName : null,
    variableCount: view === 'average' ? cluster.rows.length : 1,
    points: TRAITS.map((trait, i) => ({ trait, name: TRAIT_NAMES[i], value: values[i] })),
  };
}

export function formatPatternWeight(value) {
  if (!Number.isFinite(value)) return 'Unavailable';
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(3)}`;
}

export function describeResearchPattern(points) {
  const max = Math.max(...points.map(point => point.value));
  const min = Math.min(...points.map(point => point.value));
  if (max - min < 1e-10) return 'All five traits have equal relative predictive emphasis.';
  const describe = value => {
    const names = points.filter(point => Math.abs(point.value - value) < 1e-10).map(point => point.name);
    const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    return `${joined} (${names.length > 1 ? 'tied at ' : ''}${formatPatternWeight(value)})`;
  };
  return `Most above the mean: ${describe(max)}. Most below the mean: ${describe(min)}.`;
}
