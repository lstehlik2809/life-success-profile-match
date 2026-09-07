import test from 'node:test';
import assert from 'node:assert/strict';
import { VARS } from './data.js';
import { CLUSTER_MODELS, VARIABLES, profileFromPercentiles } from './model.js';
import { rankForMode } from './regression.js';
import { FIGURE_6_EXEMPLARS, PATTERN_VIEWS, PATTERN_SCALE, getResearchPattern, formatPatternWeight, describeResearchPattern } from './research-patterns.js';

const almost = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} vs ${expected}`);
const vector = pattern => pattern.points.map(point => point.value);

// Independent transcription oracles: Table 9 p. 797; Table 10 pp. 798–799;
// Table 11 p. 800. These ten variables are the Figure 6 examples (p. 801).
const EXEMPLARS = [
  [1, 'Subjective well-being: Life satisfaction', [.16, -.07, 0, .08, -.17]],
  [2, 'Intimate partner satisfaction', [.13, .03, -.01, -.07, -.07]],
  [3, 'Safety performance', [.01, .11, .12, -.19, -.05]],
  [4, 'Salary', [.06, -.18, .07, .07, -.02]],
  [5, 'Training and job performance', [-.04, -.04, .10, .02, -.05]],
  [6, 'Academic performance: Postsecondary', [-.07, -.04, .17, -.10, .05]],
  [7, 'Organizational citizenship behavior: Change', [-.01, -.11, .03, .03, .05]],
  [8, 'Assessment center exercise: Leaderless group discussion', [.02, -.08, -.02, .07, .02]],
  [9, 'Organizational commitment: Affective', [0, .06, 0, .06, -.12]],
  [10, 'Conflict resolution style: Integrating', [-.14, .03, .01, .02, .08]],
];

test('R1: every numeric cluster selects its exact Figure 6 source label and literal coefficients', () => {
  assert.deepEqual(FIGURE_6_EXEMPLARS, Object.fromEntries(EXEMPLARS.map(([id, name]) => [id, name])));
  for (const [id, sourceName, raw] of EXEMPLARS) {
    const pattern = getResearchPattern(id, 'exemplar');
    assert.equal(pattern.sourceName, sourceName);
    assert.equal(pattern.clusterId, id);
    assert.equal(pattern.variableCount, 1);
    const residue = raw.reduce((sum, value) => sum + value, 0) / 5;
    vector(pattern).forEach((value, i) => almost(value, raw[i] - residue));
    almost(vector(pattern).reduce((a, b) => a + b, 0), 0);
  }
});

test('R1: Ingenuity and Balance remove published rounding residue, with independent centered oracles', () => {
  vector(getResearchPattern(7, 'exemplar')).forEach((value, i) => almost(value, [-.008, -.108, .032, .032, .052][i]));
  vector(getResearchPattern(2, 'exemplar')).forEach((value, i) => almost(value, [.128, .028, -.012, -.072, -.072][i]));
  // Equal-weight averages over all 21 Ingenuity rows, not its exemplar.
  vector(getResearchPattern(7)).forEach((value, i) => almost(value, [-.02733333333333333, -.084, .01885714285714286, .015523809523809525, .07695238095238097][i]));
});

test('R1/R2: the default is a centered equal-weight cluster mean, distinct from every exemplar', () => {
  const counts = [14, 15, 4, 14, 22, 11, 21, 15, 20, 12];
  for (let id = 1; id <= 10; id++) {
    const pattern = getResearchPattern(id);
    assert.equal(pattern.view, 'average');
    assert.equal(pattern.sourceName, null);
    assert.equal(pattern.variableCount, counts[id - 1]);
    const rawRows = VARS.filter(row => row[0] === id).map(row => row.slice(5));
    const expected = [0, 1, 2, 3, 4].map(i => rawRows.reduce((sum, row) => sum + row[i], 0) / counts[id - 1]);
    const residue = expected.reduce((a, b) => a + b, 0) / 5;
    vector(pattern).forEach((value, i) => almost(value, expected[i] - residue));
    almost(vector(pattern).reduce((a, b) => a + b, 0), 0);
    assert.notDeepEqual(vector(pattern), vector(getResearchPattern(id, 'exemplar')));
  }
});

test('R2: all twenty patterns fit the same fixed symmetric scale and exact trait order', () => {
  assert.deepEqual(PATTERN_SCALE, { min: -.25, max: .25 });
  assert.deepEqual(PATTERN_VIEWS, { average: 'Cluster average', exemplar: 'Paper’s exemplar' });
  for (let id = 1; id <= 10; id++) for (const view of ['average', 'exemplar']) {
    const pattern = getResearchPattern(id, view);
    assert.deepEqual(pattern.points.map(point => point.trait), ['ES', 'AG', 'CO', 'EX', 'OP']);
    assert.deepEqual(pattern.points.map(point => point.name), ['Emotional stability', 'Agreeableness', 'Conscientiousness', 'Extraversion', 'Openness']);
    for (const point of pattern.points) assert.ok(Number.isFinite(point.value) && point.value >= -.25 && point.value <= .25);
  }
});

test('R1/R4: pattern selection and edits to returned points never mutate research sources or other views', () => {
  const before = structuredClone({ VARS, VARIABLES, CLUSTER_MODELS });
  for (let id = 1; id <= 10; id++) for (const view of ['average', 'exemplar']) {
    const initial = getResearchPattern(id, view);
    const returned = getResearchPattern(id, view);
    returned.points.reverse();
    returned.points[0].value = 99;
    returned.points[1].name = 'Changed';
    assert.deepEqual(getResearchPattern(id, view), initial);
  }
  assert.deepEqual({ VARS, VARIABLES, CLUSTER_MODELS }, before);
  assert.throws(() => { FIGURE_6_EXEMPLARS[7] = 'Creativity'; }, TypeError);
  assert.throws(() => { PATTERN_SCALE.max = 1; }, TypeError);
});

test('R1/R2: patterns are independent of personal profiles and all three scoring modes', () => {
  const patterns = Array.from({ length: 10 }, (_, i) => ['average', 'exemplar'].map(view => getResearchPattern(i + 1, view)));
  for (const values of [[62, 41, 74, 55, 88], [10, 90, 30, 70, 20], [80, 80, 80, 80, 80]]) {
    const profile = profileFromPercentiles(values);
    const before = structuredClone(profile);
    for (const mode of ['shape', 'elevation', 'combined']) {
      const ranking = rankForMode(profile, mode);
      for (const row of ranking.clusters) for (const [i, view] of ['average', 'exemplar'].entries()) {
        assert.deepEqual(getResearchPattern(row.numericId, view), patterns[row.numericId - 1][i]);
      }
      assert.deepEqual(rankForMode(profile, mode), ranking);
    }
    assert.deepEqual(profile, before);
  }
});

test('R1: unknown identifiers and views are rejected, not coerced to a different dataset', () => {
  for (const id of [0, 11, -1, 1.5, '7', 'cluster-7', null, NaN, { numericId: 7 }]) assert.throws(() => getResearchPattern(id), RangeError);
  for (const view of ['', 'combined', 'toString', null]) assert.throws(() => getResearchPattern(7, view), RangeError);
});

test('R3: interpretations preserve exact ties and do not invent distinctions at zero', () => {
  assert.equal(describeResearchPattern(getResearchPattern(9, 'exemplar').points), 'Most above the mean: Agreeableness and Extraversion (tied at +0.060). Most below the mean: Openness (−0.120).');
  assert.equal(describeResearchPattern(getResearchPattern(2, 'exemplar').points), 'Most above the mean: Emotional stability (+0.128). Most below the mean: Extraversion and Openness (tied at −0.072).');
  assert.equal(describeResearchPattern(getResearchPattern(7, 'exemplar').points), 'Most above the mean: Openness (+0.052). Most below the mean: Agreeableness (−0.108).');
  assert.equal(describeResearchPattern(getResearchPattern(1).points.map(point => ({ ...point, value: 0 }))), 'All five traits have equal relative regression weights.');
});

test('R2/R3: display weights use three decimals, explicit nonzero signs, and no negative zero', () => {
  assert.equal(formatPatternWeight(.052), '+0.052');
  assert.equal(formatPatternWeight(-.108), '−0.108');
  assert.equal(formatPatternWeight(.07695238095238097), '+0.077');
  for (const value of [0, -0, -1e-16, 1e-16]) assert.equal(formatPatternWeight(value), '0.000');
  assert.equal(formatPatternWeight(NaN), 'Unavailable');
});
