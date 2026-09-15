import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQualificationManifest, summarizeQualification, assertCapabilityStatusSupported } from '../src/qualification-evidence.js';

const externalCase=(id,overrides={})=>({
  id,
  repository:'https://github.com/example/project',
  commit:`${String(id).padStart(40,'1').slice(-40).replace(/[^0-9a-f]/gi,'a')}`,
  reproduction:`npm test -- --case ${id}`,
  license:'MIT',
  provenance:`https://github.com/example/project/issues/${encodeURIComponent(id)}`,
  expectedFailure:{oracle:{kind:'runtime_error',equals:'boom'}},
  ...overrides
});

const result=(id,overrides={})=>({id,mode:'portable',classification:'SUPPORTED',baselineReproduced:true,accepted:true,sameCause:true,falseEquivalent:false,reduction:0.6,wallTimeMs:100,...overrides});

test('rejects zero-SHA and incomplete external corpus identities',()=>{
  assert.throws(()=>validateQualificationManifest({schema:'faultline.external-corpus.v1',cases:[externalCase('zero',{commit:'0'.repeat(40)})]}),/IMMUTABLE_COMMIT/);
  assert.throws(()=>validateQualificationManifest({schema:'faultline.external-corpus.v1',cases:[externalCase('no-repro',{reproduction:''})]}),/REPRODUCTION_REQUIRED/);
  assert.throws(()=>validateQualificationManifest({schema:'faultline.external-corpus.v1',cases:[externalCase('no-license',{license:''})]}),/LICENSE_REQUIRED/);
});

test('rejects duplicated upstream case identity even when local ids differ',()=>{
  const shared={repository:'https://github.com/example/project',commit:'1234567890abcdef1234567890abcdef12345678',reproduction:'npm test -- same'};
  assert.throws(()=>validateQualificationManifest({schema:'faultline.external-corpus.v1',cases:[externalCase('a',shared),externalCase('b',shared)]}),/DUPLICATE_UPSTREAM_CASE/);
});

test('requires 30 independent cases, 10 accepted reductions, zero false equivalents, >=99% same cause and >=90% supported reproduction',()=>{
  const good=Array.from({length:30},(_,index)=>result(`case-${index}`,index>=10?{accepted:false,sameCause:false,reduction:0}:{}));
  const summary=summarizeQualification(good);
  assert.equal(summary.productionEligible,true);
  assert.equal(summary.acceptedReductions,10);
  assert.equal(summary.falseEquivalents,0);
  assert.equal(summary.reproductionRate,1);

  const falseEquivalent=[...good];falseEquivalent[0]=result('case-0',{falseEquivalent:true});
  assert.equal(summarizeQualification(falseEquivalent).productionEligible,false);
  assert.equal(summarizeQualification(good.slice(0,29)).productionEligible,false);
});

test('requires useful measured reduction: portable median >=60% or live median >=30%',()=>{
  const lowPortable=Array.from({length:30},(_,index)=>result(`portable-${index}`,index<10?{reduction:0.59}:{accepted:false,sameCause:false,reduction:0}));
  const lowSummary=summarizeQualification(lowPortable);
  assert.equal(lowSummary.medianPortableReduction,0.59);
  assert.equal(lowSummary.productionEligible,false);

  const live=Array.from({length:30},(_,index)=>result(`live-${index}`,index<10?{mode:'live',reduction:0.30}:{mode:'live',accepted:false,sameCause:false,reduction:0}));
  const liveSummary=summarizeQualification(live);
  assert.equal(liveSummary.medianLiveReduction,0.30);
  assert.equal(liveSummary.productionEligible,true);
});

test('unsupported and unresolved cases can never be accepted reductions',()=>{
  assert.throws(()=>summarizeQualification([result('bad',{classification:'UNSUPPORTED',accepted:true})]),/INVALID_ACCEPTED_RESULT/);
  assert.throws(()=>summarizeQualification([result('bad',{classification:'UNRESOLVED',accepted:true})]),/INVALID_ACCEPTED_RESULT/);
});

test('prevents capability matrix from claiming production without evidence',()=>{
  const summary=summarizeQualification([]);
  const matrix={capabilities:[{id:'reducer',status:'PRODUCTION'}]};
  assert.throws(()=>assertCapabilityStatusSupported({capabilityMatrix:matrix,summary}),/PRODUCTION_EVIDENCE_INSUFFICIENT/);
  assert.equal(assertCapabilityStatusSupported({capabilityMatrix:{capabilities:[{id:'reducer',status:'EXPERIMENTAL'}]},summary),true);
});
