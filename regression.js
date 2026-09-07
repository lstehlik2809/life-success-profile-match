import { OBSERVED_S7 } from './data.js';
import { OBSERVED_CRITERIA } from './regression-data.js';
import { VARIABLES, CLUSTER_MODELS, FAMILY_MODELS, center, rankProfile, inputScenarios, profileFromPercentiles } from './model.js';

const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

// Cholesky solve: fail explicitly for an invalid matrix instead of masking its variance.
export function solveCovariance(matrix, target) {
  const n = target?.length;
  if (!Number.isInteger(n) || n < 1 || matrix?.length !== n) throw new Error('Invalid covariance dimensions or values.');
  for (let i = 0; i < n; i++) {
    if (matrix[i]?.length !== n || !Number.isFinite(target[i])) throw new Error('Invalid covariance dimensions or values.');
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(matrix[i][j])) throw new Error('Covariance matrix must be finite and symmetric.');
    }
  }
  const L = Array.from({length:n}, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    if (Math.abs(matrix[i][j] - matrix[j][i]) > 1e-12) throw new Error('Covariance matrix must be finite and symmetric.');
    let value = matrix[i][j];
    for (let k = 0; k < j; k++) value -= L[i][k] * L[j][k];
    if (i === j) {
      if (value <= 1e-12) throw new Error('Covariance matrix must be positive definite.');
      L[i][j] = Math.sqrt(value);
    } else L[i][j] = value / L[j][j];
  }
  const y = Array(n).fill(0), x = Array(n).fill(0);
  for (let i = 0; i < n; i++) y[i] = (target[i] - dot(L[i].slice(0,i), y.slice(0,i))) / L[i][i];
  for (let i = n-1; i >= 0; i--) {
    let value = y[i];
    for (let j = i+1; j < n; j++) value -= L[j][i] * x[j];
    x[i] = value / L[i][i];
  }
  return x;
}

export const CRITERION_MODELS = VARIABLES.map(variable => {
  const source = OBSERVED_CRITERIA[variable.sourceName];
  if (!source || source.r.length !== 5) throw new Error(`Missing observed correlations: ${variable.sourceName}`);
  const beta = solveCovariance(OBSERVED_S7, source.r);
  const R2 = dot(beta, source.r);
  if (R2 < 0 || R2 > 1) throw new Error(`Invalid criterion model: ${variable.sourceName}`);
  return {...variable, observedR: source.r, beta, meanBeta: mean(beta), regressionPattern: center(beta), reconstructedR: Math.sqrt(R2)};
});
const criterionByName = new Map(CRITERION_MODELS.map(row => [row.sourceName, row]));
const attachCriteria = model => ({...model, rows: model.rows.map(row => criterionByName.get(row.sourceName))});
export const RESEARCH_CLUSTERS = CLUSTER_MODELS.map(attachCriteria);
export const RESEARCH_FAMILIES = FAMILY_MODELS.map(attachCriteria);

export const MODES = {
  shape: {name:'Shape similarity', precision:2, unit:'Correlation · −1 to +1', column:'Shape similarity'},
  elevation: {name:'Elevation component', precision:3, unit:'Mean criterion SD units', column:'Elevation component'},
  combined: {name:'Combined model', precision:3, unit:'Mean criterion SD units', column:'Combined index'},
};
export function profileElevation(profile) { return profile.z ? mean(profile.z) : null; }
export function criterionContributions(z, criterion) {
  if (z.length !== 5 || [...z].some(x => !Number.isFinite(x))) throw new Error('Five finite normal scores required.');
  const elevation = criterion.meanBeta * z.reduce((a,b) => a+b,0);
  const pattern = dot(criterion.regressionPattern,z);
  return {elevation, pattern, combined: elevation + pattern};
}
export function modelContributions(z, model) {
  const rows = model.rows.map(criterion => criterionContributions(z,criterion));
  const elevation = mean(rows.map(row => row.elevation));
  const pattern = mean(rows.map(row => row.pattern));
  return {elevation, pattern, combined:elevation+pattern};
}
export function formatScore(score, mode = 'shape') {
  if (!Number.isFinite(score)) return 'Unavailable';
  const precision = MODES[mode].precision;
  const rounded = Math.round(score * 10**precision) / 10**precision;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(precision)}`;
}
export function scoreKey(score, mode) { return Math.round(score * 10**MODES[mode].precision); }
export function rankScores(rows, mode) {
  const sorted = [...rows].sort((a,b) => scoreKey(b.score,mode)-scoreKey(a.score,mode) || a.name.localeCompare(b.name,'en'));
  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end+1 < sorted.length && scoreKey(sorted[end+1].score,mode) === scoreKey(sorted[start].score,mode)) end++;
    for (let i=start; i<=end; i++) sorted[i] = {...sorted[i], rankStart:start+1, rankEnd:end+1};
    start = end+1;
  }
  return sorted;
}
export function rankForMode(profile, mode) {
  if (!MODES[mode]) throw new Error('Unknown scoring mode.');
  if (!profile.z) return {clusters:[],families:[]};
  if (mode === 'shape') {
    const ranked = rankProfile(profile);
    return Object.fromEntries(Object.entries(ranked).map(([key, rows]) => [key,rows.map(row => ({...row,score:row.similarity}))]));
  }
  const score = models => rankScores(models.map(model => {
    const contributions = modelContributions(profile.z,model);
    return {...model,...contributions,score:contributions[mode]};
  }),mode);
  return {clusters:score(RESEARCH_CLUSTERS), families:score(RESEARCH_FAMILIES)};
}

// All valid profiles, including flat ones, have a defined linear model score.
// Only shape mode omits flat/near-flat scenarios.
export function sensitivityForMode(profile, delta, mode) {
  if (!rankForMode(profile,mode).clusters.length) return null;
  const scenarios = inputScenarios(profile.percentiles,delta);
  const results = Object.fromEntries([...CLUSTER_MODELS,...FAMILY_MODELS].map(model => [model.id,{
    minScore:Infinity,maxScore:-Infinity,bestPosition:Infinity,worstPosition:-Infinity,
  }]));
  let omitted = 0;
  for (const values of scenarios) {
    const changed = profileFromPercentiles(values);
    const ranked = rankForMode(changed,mode);
    if (!ranked.clusters.length) { omitted++;continue; }
    for (const row of [...ranked.clusters,...ranked.families]) {
      const result = results[row.id];
      result.minScore = Math.min(result.minScore,row.score);
      result.maxScore = Math.max(result.maxScore,row.score);
      result.bestPosition = Math.min(result.bestPosition,row.rankStart);
      result.worstPosition = Math.max(result.worstPosition,row.rankEnd);
    }
  }
  return {delta,total:scenarios.length,evaluated:scenarios.length-omitted,omitted,results};
}
