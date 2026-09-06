import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { VARS, REVERSE_LABELS, OBSERVED_S7 } from './data.js';
import {
  parsePercentile, profileFromFields, profileFromPercentiles, reverseField,
  normInv, similarity, VARIABLES, CLUSTER_MODELS, FAMILY_MODELS, rankProfile,
  rankModels, analyzeSensitivity, inputScenarios,
} from './model.js';

const almost = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

test('all 148 rows retain the audited app1 source values; app1 is untouched', () => {
  const source = readFileSync(new URL('../app1/life-success-profile-match.jsx', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex').toUpperCase(), '7DACF62EA2069334A4A2E66B50AC68B0807A31CB6202E1B741C0E85A2204A7DC');
  const sandbox = {};
  vm.runInNewContext(source.slice(source.indexOf('const VARS'), source.indexOf('const CLUSTERS')) + '\nthis.rows = VARS;', sandbox);
  assert.deepEqual(VARS, JSON.parse(JSON.stringify(sandbox.rows)));
  assert.equal(VARS.length, 148);
  assert.deepEqual(CLUSTER_MODELS.map(row => row.rows.length), [14,15,4,14,22,11,21,15,20,12]);
  assert.deepEqual(FAMILY_MODELS.map(row => row.rows.length), [33,83,32]);
});

test('Ingenuity clarifies its research theme and exemplar without changing membership', () => {
  const ingenuity = CLUSTER_MODELS.find(row => row.numericId === 7);
  assert.equal(ingenuity.name, 'Ingenuity');
  assert.match(ingenuity.desc, /^Research theme:/);
  assert.equal(ingenuity.exemplar, 'Organizational citizenship behavior: Change');
  assert.equal(ingenuity.exemplarGloss, 'Change-oriented contributions at work');
  assert.match(ingenuity.interpretationNote, /not all direct measures of ingenuity or innovation/);
  assert.equal(ingenuity.rows.length, 21);
  for (const sourceName of [ingenuity.exemplar, 'Interpersonal sensitivity', 'Walking speed', 'Creativity']) {
    assert.ok(ingenuity.rows.some(row => row.sourceName === sourceName), sourceName);
  }
  const citizenship = CLUSTER_MODELS.find(row => row.numericId === 6);
  assert.equal(citizenship.name, 'Citizenship');
  assert.ok(!citizenship.rows.some(row => row.sourceName === ingenuity.exemplar));
});

test('all 21 source reverse-keyed variables are explicitly relabeled without reversing twice', () => {
  assert.equal(Object.keys(REVERSE_LABELS).length, 21);
  assert.equal(VARIABLES.filter(row => row.reverseKeyed).length, 21);
  const emotionalLoneliness = VARIABLES.find(row => row.sourceName === 'Loneliness: Emotional');
  assert.equal(emotionalLoneliness.name, 'Lower emotional loneliness');
  assert.deepEqual(emotionalLoneliness.rawPattern, [.19,-.07,-.06,.03,-.08]);
  assert.ok(similarity(profileFromPercentiles([90,50,50,50,10]).z, emotionalLoneliness.pattern) > .8);
  assert.equal(VARIABLES.find(row => row.sourceName === 'Risk of mortality: Stroke').name, 'Lower risk of mortality from stroke');
  assert.equal(VARIABLES.find(row => row.sourceName === 'Workplace incivility').reverseKeyed, true);
  assert.equal(VARIABLES.find(row => row.sourceName === 'Organizational commitment: Normative').reverseKeyed, false);
});

test('blank, invalid, or out-of-range input never becomes an extreme trait or stale ranking', () => {
  for (const text of ['', ' ', 'abc', '-1', '101', 'Infinity', '1e2']) assert.ok(parsePercentile(text).error, text);
  const empty = profileFromFields(['', '41','74','55','88']);
  assert.equal(empty.status, 'incomplete');
  assert.deepEqual(rankProfile(empty), { clusters: [], families: [] });
  assert.equal(analyzeSensitivity(empty, 5), null);
  assert.equal(profileFromFields(['101','41','74','55','88']).status, 'invalid');
  assert.equal(parsePercentile('62.25').value, 62.25);
});

test('N and ES inputs agree and switching direction preserves the profile', () => {
  const es = profileFromFields(['62','41','74','55','88'], 'ES');
  const n = profileFromFields(['38','41','74','55','88'], 'N');
  assert.deepEqual(es.z, n.z);
  assert.deepEqual(rankProfile(es), rankProfile(n));
  assert.equal(reverseField('62.25'), '37.75');
  assert.equal(reverseField(reverseField('62.25')), '62.25');
  assert.equal(reverseField(''), '');
  assert.equal(reverseField('invalid'), 'invalid');
  assert.equal(reverseField('0'), '100');
});

test('tails remain visible and use a symmetric, monotonic, explicitly flagged calculation limit', () => {
  const p = profileFromFields(['0','100','50','30','70']);
  assert.deepEqual(p.percentiles, [0,100,50,30,70]);
  assert.deepEqual(p.effective, [.5,99.5,50,30,70]);
  assert.deepEqual(p.clipped, [0,1]);
  assert.ok(p.z.every(Number.isFinite));
  almost(p.z[0], -p.z[1]);
  const values = [0,.1,.5,1,50,99,99.5,99.9,100].map(x => profileFromPercentiles([x,20,40,60,80]).z[0]);
  for(let i=1;i<values.length;i++) assert.ok(values[i] >= values[i-1]);
});

test('normal conversion matches reference quantiles and rejects unhandled infinite endpoints', () => {
  almost(normInv(.5), 0);
  almost(normInv(.975), 1.959963984540054, 3e-9);
  almost(normInv(.005), -2.5758293035489, 4e-9);
  assert.throws(() => normInv(0), RangeError);
  assert.throws(() => normInv(1), RangeError);
});

test('shape similarity is invariant to elevation and positive amplitude changes', () => {
  const z = [.4,-.8,.2,0,1];
  for(const model of [...CLUSTER_MODELS, ...FAMILY_MODELS]) {
    const base = similarity(z, model.pattern);
    almost(similarity(z.map(value => value*2), model.pattern), base);
    almost(similarity(z.map(value => value+3), model.pattern), base);
    almost(similarity(z.map(value => -value), model.pattern), -base);
  }
  almost(similarity(z, z), 1);
  almost(similarity(z, z.map(value => -value)), -1);
});

test('flat and nearly flat profiles produce no ranking or chosen family', () => {
  for(const values of [[50,50,50,50,50],[80,80,80,80,80],[50,50,50,50,51],[0,0,.1,.2,.3]]) {
    const profile = profileFromPercentiles(values);
    assert.ok(['flat','near-flat'].includes(profile.status));
    assert.deepEqual(rankProfile(profile), {clusters:[],families:[]});
    assert.equal(analyzeSensitivity(profile, 5), null);
  }
  assert.equal(similarity([0,0,0,0,0], CLUSTER_MODELS[0].pattern), null);
});

test('families average all member variables and all profiles sum to zero after rounding correction', () => {
  for(const model of [...CLUSTER_MODELS, ...FAMILY_MODELS]) almost(model.pattern.reduce((sum, value) => sum+value,0), 0);
  const family = FAMILY_MODELS.find(row => row.name === 'Contentment');
  const meanES = family.rows.reduce((sum,row) => sum+row.rawPattern[0],0)/33;
  const allMean = family.rows.reduce((sum,row) => sum+row.rawPattern.reduce((a,b)=>a+b,0),0)/(33*5);
  almost(family.pattern[0], meanES-allMean);
});

test('display ties share positions rather than receiving a winner through array order', () => {
  const pattern = [.1,-.1,0,0,0];
  const rows = rankModels([1,-1,0,0,0], [{id:'b',name:'B',pattern},{id:'a',name:'A',pattern}]);
  assert.deepEqual(rows.map(row => [row.name,row.rankStart,row.rankEnd]), [['A',1,2],['B',1,2]]);
});

test('sensitivity uses joint input scenarios and reports every score independently', () => {
  // A reproduction that made app1's contiguous confidence cutoff contradict its own rule.
  const profile = profileFromPercentiles([10,10,10,30,70]);
  const analysis = analyzeSensitivity(profile, 5);
  assert.equal(analysis.total, 243);
  assert.equal(analysis.evaluated + analysis.omitted, analysis.total);
  const independentlyComputed = inputScenarios(profile.percentiles, 5).map(profileFromPercentiles)
    .filter(p => p.status === 'ready').map(rankProfile);
  for(const id of Object.keys(analysis.results)) {
    const rows = independentlyComputed.flatMap(r => [...r.clusters,...r.families].filter(row => row.id === id));
    almost(analysis.results[id].minSimilarity, Math.min(...rows.map(row => row.similarity)));
    almost(analysis.results[id].maxSimilarity, Math.max(...rows.map(row => row.similarity)));
    assert.equal(analysis.results[id].bestPosition, Math.min(...rows.map(row => row.rankStart)));
    assert.equal(analysis.results[id].worstPosition, Math.max(...rows.map(row => row.rankEnd)));
  }
});

test('scenario ranges include the entered score; duplicates and unscorable profiles are explicit', () => {
  const profile = profileFromPercentiles([62,41,74,55,88]);
  const analysis = analyzeSensitivity(profile, 5);
  for(const row of [...rankProfile(profile).clusters,...rankProfile(profile).families]) {
    assert.ok(analysis.results[row.id].minSimilarity <= row.similarity + 1e-10);
    assert.ok(analysis.results[row.id].maxSimilarity >= row.similarity - 1e-10);
  }
  assert.equal(inputScenarios([0,0,0,0,100], 5).length, 32);
  assert.ok(analyzeSensitivity(profileFromPercentiles([50,50,50,50,55]),5).omitted > 0);
  assert.equal(analyzeSensitivity(profile,0).total, 1);
  assert.throws(() => inputScenarios([50,50,50,50,50], -1), RangeError);
});

test('reference S7 values are observed, fixed, and independent of shape scoring', () => {
  assert.deepEqual(OBSERVED_S7, [[1,.22,.25,.21,.09],[.22,1,.27,.16,.14],[.25,.27,1,.14,.09],[.21,.16,.14,1,.26],[.09,.14,.09,.26,1]]);
  assert.throws(() => { OBSERVED_S7[0][1] = -.9; }, TypeError);
  const profile = profileFromPercentiles([62,41,74,55,88]);
  assert.equal(rankProfile(profile).clusters[0].name, 'Ingenuity');
});

test('AS-03: sparse percentile positions are rejected by construction and scenario generation', () => {
  const base = [62,41,74,55,88];
  const fixtures = [['all holes', Array(5)]];
  for (let i = 0; i < 5; i++) {
    const values = [...base];
    delete values[i];
    fixtures.push([`hole at ${i}`, values]);
  }
  for (const [label, values] of fixtures) {
    const before = values.slice();
    assert.throws(() => profileFromPercentiles(values), RangeError, label);
    assert.throws(() => inputScenarios(values, 5), RangeError, label);
    assert.deepEqual(values, before, `${label}: input unchanged`);
  }
});

test('AS-03: every percentile position requires a finite numeric value in range', () => {
  const badValues = [undefined, NaN, Infinity, -Infinity, '62', null, true, false, -1, 101];
  for (let i = 0; i < 5; i++) for (const bad of badValues) {
    const values = [62,41,74,55,88];
    values[i] = bad;
    const label = `position ${i}: ${String(bad)}`;
    assert.throws(() => profileFromPercentiles(values), RangeError, label);
    assert.throws(() => inputScenarios(values, 5), RangeError, label);
  }
  for (const values of [[], [62,41,74,55], [62,41,74,55,88,50]]) {
    assert.throws(() => profileFromPercentiles(values), RangeError);
    assert.throws(() => inputScenarios(values, 5), RangeError);
  }
});

test('AS-04: fully sparse text fields produce five actual missing-field errors and no scores', () => {
  for (const polarity of ['ES', 'N']) {
    const fields = Array(5);
    const profile = profileFromFields(fields, polarity);
    assert.deepEqual(profile, {
      status: 'incomplete',
      errors: ['Enter a percentile.', 'Enter a percentile.', 'Enter a percentile.', 'Enter a percentile.', 'Enter a percentile.'],
    });
    assert.deepEqual(Object.keys(profile.errors), ['0','1','2','3','4']);
    assert.equal(Object.hasOwn(profile, 'z'), false);
    assert.deepEqual(fields, Array(5));
  }
});

test('AS-04: each missing ES or N field retains its error position and never becomes numeric', () => {
  for (const polarity of ['ES', 'N']) for (let i = 0; i < 5; i++) for (const missing of ['hole', 'undefined']) {
    const fields = [polarity === 'N' ? '38' : '62', '41','74','55','88'];
    if (missing === 'hole') delete fields[i];
    else fields[i] = undefined;
    const before = fields.slice();
    const errors = [null,null,null,null,null];
    errors[i] = 'Enter a percentile.';
    const profile = profileFromFields(fields, polarity);
    assert.deepEqual(profile, {status: 'incomplete', errors}, `${polarity} ${missing} at ${i}`);
    assert.deepEqual(Object.keys(profile.errors), ['0','1','2','3','4']);
    assert.equal(Object.hasOwn(profile, 'z'), false);
    assert.deepEqual(fields, before);
  }
});

test('AS-04: malformed present fields take precedence over missing fields; configuration stays strict', () => {
  for (const polarity of ['ES', 'N']) for (let i = 0; i < 5; i++) for (const bad of ['bad', '101']) {
    const fields = [polarity === 'N' ? '38' : '62', '41','74','55','88'];
    delete fields[i];
    fields[(i + 1) % 5] = bad;
    const errors = [null,null,null,null,null];
    errors[i] = 'Enter a percentile.';
    errors[(i + 1) % 5] = 'Use a number from 0 to 100.';
    const profile = profileFromFields(fields, polarity);
    assert.deepEqual(profile, {status: 'invalid', errors});
    assert.deepEqual(Object.keys(profile.errors), ['0','1','2','3','4']);
    assert.equal(Object.hasOwn(profile, 'z'), false);
  }
  for (const fields of [[], ['62','41','74','55'], ['62','41','74','55','88','50']]) {
    assert.throws(() => profileFromFields(fields), RangeError);
  }
  assert.throws(() => profileFromFields(['62','41','74','55','88'], 'unknown'), RangeError);
  assert.throws(() => profileFromFields('12345'));
});

test('AS-07: valid dense inputs keep their values and remain unchanged during conversion', () => {
  const values = [62,41,74,55,88];
  const profile = profileFromPercentiles(values);
  assert.equal(profile.status, 'ready');
  assert.deepEqual(profile.percentiles, [62,41,74,55,88]);
  assert.deepEqual(values, [62,41,74,55,88]);
  for (const polarity of ['ES', 'N']) {
    const fields = [polarity === 'N' ? '38' : '62', '41','74','55','88'];
    const before = [...fields];
    assert.deepEqual(profileFromFields(fields, polarity).z, profile.z);
    assert.deepEqual(fields, before);
  }
});
