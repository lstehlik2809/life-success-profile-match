import { VARS, CLUSTERS, REVERSE_LABELS } from './data.js';

export const TRAITS = ['ES', 'AG', 'CO', 'EX', 'OP'];
export const TRAIT_NAMES = ['Emotional stability', 'Agreeableness', 'Conscientiousness', 'Extraversion', 'Openness'];
export const FAMILIES = [
  { id: 'contentment', name: 'Contentment', gloss: 'Satisfaction and adjustment to present circumstances', color: 'contentment' },
  { id: 'agency', name: 'Agentic engagement', gloss: 'Achievement, contribution and influence', color: 'agency' },
  { id: 'transcendence', name: 'Self-transcendence', gloss: 'Support for others and collective welfare', color: 'transcendence' },
];

// Transparent numerical/display conventions; neither is an instrument norm.
export const TAIL_LIMIT = 0.5;
export const MIN_DISPLAY_SPAN = 1; // Percentile points, after harmonizing the N/ES direction.
const EPSILON = 1e-10;
const mean = (a) => a.reduce((sum, value) => sum + value, 0) / a.length;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export const center = (a) => { const m = mean(a); return a.map(value => value - m); };
export const clipPercentile = (p) => Math.max(TAIL_LIMIT, Math.min(100 - TAIL_LIMIT, p));

export function parsePercentile(text) {
  const value = String(text ?? '').trim();
  if (!value) return { value: null, error: 'Enter a percentile.', empty: true };
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return { value: null, error: 'Use a number from 0 to 100.', empty: false };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) return { value: null, error: 'Use a number from 0 to 100.', empty: false };
  return { value: number, error: null, empty: false };
}

// Acklam inverse-normal approximation. Domain is strict; callers handle endpoint conventions.
export function normInv(p) {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) throw new RangeError('Normal quantiles require 0 < p < 1.');
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let q;
  if (p < 0.02425) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p > 1 - 0.02425) {
    q = Math.sqrt(-2 * Math.log(1-p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  q = p - 0.5;
  const r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

export function profileFromPercentiles(percentiles) {
  if (percentiles.length !== 5 || [...percentiles].some(p => !Number.isFinite(p) || p < 0 || p > 100)) throw new RangeError('Five percentiles from 0 to 100 are required.');
  const effective = percentiles.map(clipPercentile);
  const z = effective.map(p => normInv(p / 100));
  const centered = center(z);
  const norm = Math.sqrt(dot(centered, centered));
  const span = Math.max(...effective) - Math.min(...effective);
  const status = norm < EPSILON ? 'flat' : span <= MIN_DISPLAY_SPAN + EPSILON ? 'near-flat' : 'ready';
  return { status, percentiles: [...percentiles], effective, z, centered, span, norm,
    clipped: percentiles.map((p, i) => p !== effective[i] ? i : -1).filter(i => i >= 0) };
}

export function profileFromFields(fields, polarity = 'ES') {
  if (!Array.isArray(fields) || fields.length !== 5 || !['ES', 'N'].includes(polarity)) throw new RangeError('Invalid profile input configuration.');
  const parsed = Array.from(fields, parsePercentile);
  if (parsed.some(p => p.error)) return { status: parsed.some(p => p.error && !p.empty) ? 'invalid' : 'incomplete', errors: parsed.map(p => p.error) };
  const p = parsed.map(p => p.value);
  if (polarity === 'N') p[0] = 100 - p[0];
  return { ...profileFromPercentiles(p), errors: Array(5).fill(null) };
}

export function reverseField(text) {
  const parsed = parsePercentile(text);
  return parsed.error ? text : String(Number((100 - parsed.value).toFixed(10)));
}

export function similarity(a, b) {
  if (a.length !== 5 || b.length !== 5 || [...a, ...b].some(x => !Number.isFinite(x))) return null;
  const x = center(a), y = center(b);
  const nx = Math.sqrt(dot(x, x)), ny = Math.sqrt(dot(y, y));
  if (nx < EPSILON || ny < EPSILON) return null;
  return Math.max(-1, Math.min(1, dot(x, y) / (nx * ny)));
}

export const VARIABLES = VARS.map(row => ({
  clusterId: row[0], sourceName: row[1], name: REVERSE_LABELS[row[1]] ?? row[1],
  reverseKeyed: Object.hasOwn(REVERSE_LABELS, row[1]), R: row[2],
  betaLevel: row[3], betaPattern: row[4], rawPattern: row.slice(5), pattern: center(row.slice(5)),
  table: row[0] <= 3 ? 9 : row[0] <= 8 ? 10 : 11,
}));

function centroid(rows) {
  return center(TRAITS.map((_, i) => mean(rows.map(row => row.rawPattern[i]))));
}

export const CLUSTER_MODELS = CLUSTERS.map(cluster => {
  const rows = VARIABLES.filter(row => row.clusterId === cluster.id);
  const family = FAMILIES.find(f => f.name === cluster.meta);
  return { ...cluster, id: `cluster-${cluster.id}`, numericId: cluster.id, rows, pattern: centroid(rows), color: family.color,
    meanR: mean(rows.map(row => row.R)) };
});

export const FAMILY_MODELS = FAMILIES.map(family => {
  const ids = CLUSTERS.filter(cluster => cluster.meta === family.name).map(cluster => cluster.id);
  const rows = VARIABLES.filter(row => ids.includes(row.clusterId));
  return { ...family, rows, pattern: centroid(rows) };
});

export function displayKey(value) { return Math.round(value * 100); }
export function formatSimilarity(value) {
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  const rounded = displayKey(value) / 100;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(2)}`;
}

// Ties mean equal displayed scores (two decimals), not statistical indistinguishability.
export function rankModels(z, models) {
  const rows = models.map(model => ({ ...model, similarity: similarity(z, model.pattern) }));
  if (rows.some(row => row.similarity === null)) return [];
  rows.sort((a, b) => displayKey(b.similarity) - displayKey(a.similarity) || a.name.localeCompare(b.name, 'en'));
  for (let start = 0; start < rows.length;) {
    let end = start;
    while (end + 1 < rows.length && displayKey(rows[end + 1].similarity) === displayKey(rows[start].similarity)) end++;
    for (let i = start; i <= end; i++) Object.assign(rows[i], { rankStart: start + 1, rankEnd: end + 1 });
    start = end + 1;
  }
  return rows;
}

export function rankProfile(profile) {
  if (profile.status !== 'ready') return { clusters: [], families: [] };
  return { clusters: rankModels(profile.z, CLUSTER_MODELS), families: rankModels(profile.z, FAMILY_MODELS) };
}

export function inputScenarios(percentiles, delta) {
  if (!Number.isFinite(delta) || delta < 0 || delta > 100) throw new RangeError('Invalid sensitivity adjustment.');
  profileFromPercentiles(percentiles); // Also validates dimensions and bounds.
  const choices = percentiles.map(p => [...new Set([p-delta, p, p+delta].map(clipPercentile))]);
  return choices.reduce((sets, values) => sets.flatMap(set => values.map(value => [...set, value])), [[]]);
}

// Exhaustive finite what-if grid; no probabilities, reliability assumptions, or confidence intervals.
export function analyzeSensitivity(profile, delta) {
  if (profile.status !== 'ready') return null;
  const scenarios = inputScenarios(profile.percentiles, delta);
  const results = Object.fromEntries([...CLUSTER_MODELS, ...FAMILY_MODELS].map(model => [model.id, {
    minSimilarity: Infinity, maxSimilarity: -Infinity, bestPosition: Infinity, worstPosition: -Infinity,
  }]));
  let omitted = 0;
  for (const values of scenarios) {
    const changed = profileFromPercentiles(values);
    if (changed.status !== 'ready') { omitted++; continue; }
    const ranked = rankProfile(changed);
    for (const row of [...ranked.clusters, ...ranked.families]) {
      const result = results[row.id];
      result.minSimilarity = Math.min(result.minSimilarity, row.similarity);
      result.maxSimilarity = Math.max(result.maxSimilarity, row.similarity);
      result.bestPosition = Math.min(result.bestPosition, row.rankStart);
      result.worstPosition = Math.max(result.worstPosition, row.rankEnd);
    }
  }
  return { delta, total: scenarios.length, evaluated: scenarios.length - omitted, omitted, results };
}
