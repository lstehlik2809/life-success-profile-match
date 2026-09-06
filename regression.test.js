import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OBSERVED_S7} from './data.js';
import {OBSERVED_CRITERIA} from './regression-data.js';
import {profileFromFields,profileFromPercentiles,similarity,inputScenarios,rankProfile,analyzeSensitivity} from './model.js';
import {
  solveCovariance,CRITERION_MODELS,RESEARCH_CLUSTERS,RESEARCH_FAMILIES,profileElevation,
  criterionContributions,modelContributions,rankForMode,sensitivityForMode,formatScore,
} from './regression.js';
const almost=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);

test('pinned source workbook, complete mapping, and known reversed correlations',()=>{
  const provenance=JSON.parse(readFileSync(new URL('./research/provenance.json',import.meta.url),'utf8'));
  const file=readFileSync(new URL('./research/b5_profiles_data.xlsx',import.meta.url));
  assert.equal(createHash('sha256').update(file).digest('hex'),provenance.workbookSHA256);
  assert.equal(Object.keys(OBSERVED_CRITERIA).length,148);
  assert.equal(CRITERION_MODELS.length,148);
  assert.deepEqual(OBSERVED_CRITERIA['Loneliness: Emotional'].r,[.36,.15,.17,.23,.11]);
  assert.equal(OBSERVED_CRITERIA['Employee voice: Promotive'].sourceName,'Voice: Promotive');
});

test('solver recovers a known regression and rejects invalid predictor matrices',()=>{
  const beta=[.3,-.05,.2,.1,-.1];
  const r=OBSERVED_S7.map(row=>dot(row,beta));
  solveCovariance(OBSERVED_S7,r).forEach((value,i)=>almost(value,beta[i]));
  assert.throws(()=>solveCovariance([[1,2],[2,1]],[.2,.1]),/positive definite/);
  assert.throws(()=>solveCovariance([[1,.2],[.3,1]],[.2,.1]),/symmetric/);
  assert.throws(()=>solveCovariance([[1,1],[1,1]],[.2,.1]),/positive definite/);
});

test('all ordinary regressions reproduce observed r and agree with published rounded profiles',()=>{
  for(const criterion of CRITERION_MODELS){
    OBSERVED_S7.map(row=>dot(row,criterion.beta)).forEach((value,i)=>almost(value,criterion.observedR[i]));
    criterion.regressionPattern.forEach((value,i)=>almost(value,criterion.pattern[i],.010));
    almost(criterion.reconstructedR,criterion.R,.0065);
  }
});

test('level plus pattern equals the full ordinary regression for every criterion',()=>{
  for(const z of [[0,0,0,0,0],[1,1,1,1,1],[-2,.3,1.2,-.4,2]]) for(const c of CRITERION_MODELS){
    const result=criterionContributions(z,c);
    almost(result.elevation+result.pattern,dot(z,c.beta));
    almost(result.combined,dot(z,c.beta));
  }
  const synthetic={beta:[.3,-.05,.2,.1,-.1],meanBeta:.09,regressionPattern:[.21,-.14,.11,.01,-.19]};
  const result=criterionContributions([1,0,-1,2,-2],synthetic);
  almost(result.elevation,0); almost(result.pattern,.5);almost(result.combined,.5);
});

test('uniform elevation shifts change only the elevation contribution; shape rescaling affects the linear model',()=>{
  const z=[.4,-.8,.2,0,1], shifted=z.map(v=>v+.5), scaled=z.map(v=>v*2);
  for(const model of RESEARCH_CLUSTERS){
    const base=modelContributions(z,model), shift=modelContributions(shifted,model), scale=modelContributions(scaled,model);
    almost(shift.pattern,base.pattern);
    almost(shift.elevation-base.elevation,2.5*model.rows.reduce((s,r)=>s+r.meanBeta,0)/model.rows.length);
    almost(scale.combined,2*base.combined);
    almost(similarity(z,model.pattern),similarity(scaled,model.pattern));
  }
});

test('clusters and families average individual models, including unequal cluster sizes',()=>{
  const z=profileFromPercentiles([62,41,74,55,88]).z;
  for(const model of [...RESEARCH_CLUSTERS,...RESEARCH_FAMILIES]){
    const expected=model.rows.reduce((sum,c)=>sum+dot(c.beta,z),0)/model.rows.length;
    almost(modelContributions(z,model).combined,expected);
  }
  const family=RESEARCH_FAMILIES.find(r=>r.id==='contentment');
  const clusters=RESEARCH_CLUSTERS.filter(r=>r.meta===family.name);
  const wrong=clusters.reduce((sum,r)=>sum+modelContributions(z,r).combined,0)/clusters.length;
  assert.ok(Math.abs(modelContributions(z,family).combined-wrong)>.001);
});

test('flat profiles retain elevation, neutral profiles tie, and shape mode still pauses',()=>{
  const flat=profileFromPercentiles([80,80,80,80,80]);
  almost(profileElevation(flat),.8416212335729143,1e-8);
  assert.equal(rankForMode(flat,'shape').clusters.length,0);
  for(const mode of ['elevation','combined']){
    const results=rankForMode(flat,mode);
    assert.equal(results.clusters.length,10);
    assert.equal(results.families.length,3);
    for(const row of [...results.clusters,...results.families]){
      assert.ok(Number.isFinite(row.score));
      almost(row.pattern,0);almost(row.combined,row.elevation);
    }
  }
  const neutral=profileFromPercentiles([50,50,50,50,50]);
  for(const mode of ['elevation','combined']){
    const results=rankForMode(neutral,mode);
    assert.equal(results.clusters.length,10);
    assert.equal(results.families.length,3);
    for(const row of results.clusters){almost(row.score,0);assert.equal(row.rankStart,1);assert.equal(row.rankEnd,10);}
    for(const row of results.families){almost(row.score,0);assert.equal(row.rankStart,1);assert.equal(row.rankEnd,3);}
    assert.equal(sensitivityForMode(neutral,5,mode).omitted,0);
  }
});

test('all modes respect invalid inputs and neuroticism reversal',()=>{
  const es=profileFromFields(['62','41','74','55','88'],'ES');
  const n=profileFromFields(['38','41','74','55','88'],'N');
  for(const mode of ['shape','elevation','combined']){
    assert.deepEqual(rankForMode(es,mode),rankForMode(n,mode));
    for(const first of ['', '101','garbage']){
      const invalid=profileFromFields([first,'41','74','55','88']);
      assert.deepEqual(rankForMode(invalid,mode),{clusters:[],families:[]});
      assert.equal(sensitivityForMode(invalid,5,mode),null);
      assert.equal(profileElevation(invalid),null);
    }
  }
});

test('joint sensitivity recomputes the selected model and includes the baseline in every range',()=>{
  const profile=profileFromPercentiles([62,41,74,55,88]);
  for(const mode of ['shape','elevation','combined']){
    const analysis=sensitivityForMode(profile,5,mode);
    const rows=inputScenarios(profile.percentiles,5).map(profileFromPercentiles).map(p=>rankForMode(p,mode));
    assert.equal(analysis.total,243);
    for(const baseline of [...rankForMode(profile,mode).clusters,...rankForMode(profile,mode).families]){
      const values=rows.flatMap(r=>[...r.clusters,...r.families]).filter(r=>r.id===baseline.id);
      const range=analysis.results[baseline.id];
      almost(range.minScore,Math.min(...values.map(r=>r.score)));
      almost(range.maxScore,Math.max(...values.map(r=>r.score)));
      assert.equal(range.bestPosition,Math.min(...values.map(r=>r.rankStart)));
      assert.equal(range.worstPosition,Math.max(...values.map(r=>r.rankEnd)));
      assert.ok(range.minScore<=baseline.score && range.maxScore>=baseline.score);
    }
  }
  assert.equal(sensitivityForMode(profile,0,'combined').total,1);
  assert.equal(formatScore(-.00001,'combined'),'0.000');
  assert.equal(formatScore(1.2789,'combined'),'+1.279');
});

test('AS-01: the solver rejects an upper-triangle NaN instead of silently solving another matrix',()=>{
  assert.throws(()=>solveCovariance([[1,NaN],[.2,1]],[.2,.1]));
});

test('AS-01: the solver rejects an empty system',()=>{
  assert.throws(()=>solveCovariance([],[]));
});

test('AS-01: every covariance coordinate must be present, numeric and finite',()=>{
  const badValues=[NaN,Infinity,-Infinity,undefined,'0.2',null,true,false];
  for(let i=0;i<2;i++) for(let j=0;j<2;j++){
    for(const bad of badValues){
      const matrix=[[1,.2],[.2,1]];
      matrix[i][j]=bad;
      const before=matrix.map(row=>row.slice());
      assert.throws(()=>solveCovariance(matrix,[.2,.1]),`cell ${i},${j}: ${String(bad)}`);
      assert.deepEqual(matrix,before);
    }
    const matrix=[[1,.2],[.2,1]];
    delete matrix[i][j];
    assert.throws(()=>solveCovariance(matrix,[.2,.1]),`hole at ${i},${j}`);
  }
});

test('AS-01: sparse or missing rows, nonsquare matrices and mismatched targets are rejected',()=>{
  const fixtures=[
    ['all missing rows',Array(2)],
    ['short row',[[1],[.2,1]]],
    ['long row',[[1,.2,0],[.2,1]]],
    ['too few rows',[[1,.2]]],
    ['too many rows',[[1,.2],[.2,1],[0,0]]],
  ];
  for(let i=0;i<2;i++) for(const kind of ['sparse row','missing row','undefined row']){
    const matrix=[[1,.2],[.2,1]];
    if(kind==='sparse row') matrix[i]=Array(2);
    else if(kind==='missing row') delete matrix[i];
    else matrix[i]=undefined;
    fixtures.push([`${kind} ${i}`,matrix]);
  }
  for(const [label,matrix] of fixtures) assert.throws(()=>solveCovariance(matrix,[.2,.1]),label);
  for(const target of [[],[.2],[.2,.1,0]]) assert.throws(()=>solveCovariance([[1,.2],[.2,1]],target));
  assert.throws(()=>solveCovariance());
  assert.throws(()=>solveCovariance(undefined,[.2,.1]));
  assert.throws(()=>solveCovariance([[1,.2],[.2,1]]));
});

test('AS-01: every target coordinate must be present, numeric and finite',()=>{
  const fixtures=[['all holes',Array(2)]];
  for(let i=0;i<2;i++){
    const target=[.2,.1];
    delete target[i];
    fixtures.push([`hole at ${i}`,target]);
    for(const bad of [NaN,Infinity,-Infinity,undefined,'0.2',null,true,false]){
      const values=[.2,.1];
      values[i]=bad;
      fixtures.push([`position ${i}: ${String(bad)}`,values]);
    }
  }
  for(const [label,target] of fixtures){
    const before=target.slice();
    assert.throws(()=>solveCovariance([[1,.2],[.2,1]],target),label);
    assert.deepEqual(target,before);
  }
});

test('AS-02: literal small-system solutions preserve ordinary and typed inputs',()=>{
  for(const typed of [false,true]){
    const matrix=typed ? [new Float64Array([2,1]),new Float64Array([1,2])] : [[2,1],[1,2]];
    const target=typed ? new Float64Array([1,0]) : [1,0];
    const beforeMatrix=matrix.map(row=>row.slice()),beforeTarget=target.slice();
    const solution=solveCovariance(matrix,target);
    assert.equal(solution.length,2);
    almost(solution[0],2/3);almost(solution[1],-1/3);
    assert.deepEqual(matrix,beforeMatrix);
    assert.deepEqual(target,beforeTarget);
  }
  const single=solveCovariance([[4]],[2]);
  assert.equal(single.length,1);almost(single[0],.5);
});

test('AS-02: solver thresholds, error categories and recovery remain unchanged',()=>{
  assert.throws(()=>solveCovariance([[1,.2],[.3,1]],[.2,.1]),/symmetric/);
  assert.throws(()=>solveCovariance([[1,1],[1,1]],[.2,.1]),/positive definite/);
  assert.throws(()=>solveCovariance([[1,2],[2,1]],[.2,.1]),/positive definite/);
  assert.throws(()=>solveCovariance([[1e-12]],[1e-12]),/positive definite/);
  almost(solveCovariance([[2e-12]],[2e-12])[0],1);
  const close=solveCovariance([[1,5e-13],[0,1]],[1,0]);
  almost(close[0],1);almost(close[1],0);
  assert.throws(()=>solveCovariance([[1,2e-12],[0,1]],[1,0]),/symmetric/);
  const recovered=solveCovariance([[2,1],[1,2]],[1,0]);
  almost(recovered[0],2/3);almost(recovered[1],-1/3);
});

test('AS-05: missing-field profiles suppress all derived results and completing fields restores them',()=>{
  for(const polarity of ['ES','N']){
    const valid=[polarity==='N' ? '38' : '62','41','74','55','88'];
    const fixtures=[Array(5)];
    for(let i=0;i<5;i++){
      const partial=[...valid];
      delete partial[i];
      fixtures.push(partial);
      for(const bad of ['bad','101']){
        const mixed=partial.slice();
        mixed[(i+1)%5]=bad;
        fixtures.push(mixed);
      }
    }
    for(const fields of fixtures){
      const profile=profileFromFields(fields,polarity);
      assert.deepEqual(rankProfile(profile),{clusters:[],families:[]});
      assert.equal(analyzeSensitivity(profile,5),null);
      assert.equal(profileElevation(profile),null);
      for(const mode of ['shape','elevation','combined']){
        assert.deepEqual(rankForMode(profile,mode),{clusters:[],families:[]});
        assert.equal(sensitivityForMode(profile,5,mode),null);
      }
      for(let i=0;i<5;i++) fields[i]=valid[i];
      const restored=profileFromFields(fields,polarity);
      assert.equal(restored.status,'ready');
      assert.ok(Number.isFinite(profileElevation(restored)));
      assert.equal(rankProfile(restored).clusters.length,10);
      assert.equal(rankProfile(restored).families.length,3);
      assert.equal(analyzeSensitivity(restored,0).evaluated,1);
      for(const mode of ['shape','elevation','combined']){
        const ranks=rankForMode(restored,mode);
        assert.equal(ranks.clusters.length,10);
        assert.equal(ranks.families.length,3);
        assert.ok([...ranks.clusters,...ranks.families].every(row=>Number.isFinite(row.score)));
        assert.equal(sensitivityForMode(restored,0,mode).evaluated,1);
      }
    }
  }
});

const syntheticCriterion={meanBeta:.2,regressionPattern:[.8,-1.2,-.2,.3,.3],beta:[1,-1,0,.5,.5]};

test('AS-06: sparse normal-score vectors cannot produce criterion contributions',()=>{
  const fixtures=[Array(5)];
  for(let i=0;i<5;i++){
    const z=[2,-1,3,0,1];
    delete z[i];
    fixtures.push(z);
  }
  for(const z of fixtures) assert.throws(()=>criterionContributions(z,syntheticCriterion));
});

test('AS-06: criterion contributions require five finite numeric coordinates',()=>{
  for(let i=0;i<5;i++) for(const bad of [undefined,NaN,Infinity,-Infinity,'2',null,true,false]){
    const z=[2,-1,3,0,1];
    z[i]=bad;
    assert.throws(()=>criterionContributions(z,syntheticCriterion),`position ${i}: ${String(bad)}`);
  }
  for(const z of [[],[2,-1,3,0],[2,-1,3,0,1,0]]) assert.throws(()=>criterionContributions(z,syntheticCriterion));
});

test('AS-06: criterion decomposition agrees with literal nonflat, neutral and flat oracles',()=>{
  for(const [z,expected] of [
    [[2,-1,3,0,1],{elevation:1,pattern:2.5,combined:3.5}],
    [[0,0,0,0,0],{elevation:0,pattern:0,combined:0}],
    [[2,2,2,2,2],{elevation:2,pattern:0,combined:2}],
  ]){
    const before=[...z];
    const actual=criterionContributions(z,syntheticCriterion);
    almost(actual.elevation,expected.elevation);
    almost(actual.pattern,expected.pattern);
    almost(actual.combined,expected.combined);
    assert.deepEqual(z,before);
  }
});
