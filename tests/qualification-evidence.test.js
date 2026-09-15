import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQualificationManifest, summarizeQualification, assertCapabilityStatusSupported } from '../src/qualification-evidence.js';

const externalCase=(id,overrides={})=>({
  id,
  repository:'https://github.com/example/project',
  commit:'1234567890abcdef1234567890abcdef12345678',
  reproduction:'npm test -- --runInBand',
  license:'MIT',
  provenance:'https://github.com/example/project/issues/42',
  expectedFailure:{oracle:{kind:'runtime_error',equals:'boom'}},
  ...overrides
});

const result=(id,overrides={})=>({id,classification:'SUPPORTED',baselineReproduced:true,accepted:true,sameCause:true,falseEquivalent:false,reduction:0.6,wallTimeMs:100,...overrides});

test('rejects zero-SHA and incomplete external corpus identities',()=>{
  assert.throws(()=>validateQualificationManifest({schema:'faultline.external-corpus.v1',cases:[externalCase('zero',{commit:'0'.repeat(40)})]}),/IMMUTABLE_COMMIT/);
  assert.throws(()=>validateQualificationManifest({schema:'faultline.external-corpus.v1',cases:[externalCase('no-repro',{reproduction:''})]}),/REPRODUCTION_REQUIRED/);
  assert.throws(()=>validateQualificationManifest({schema:'faultline.external-corpus.v1',cases:[externalCase('no-license',{license:''})]}),/LICENSE_REQUIRED/);
});

test('requires 30 cases, 10 accepted reductions, zero false equivalents, >=99% same cause and >=90% supported reproduction',()=>{
  const good=Array.from({length:30},(_,index)=>result(`case-${index}`,index>=10?{accepted:false,sameCause:false,reduction:0}:{}));
  const summary=summarizeQualification(good);
  assert.equal(summary.productionEligible,true);
  assert.equal(summary.acceptedReductions,10);
  assert.equal(summary.falseEquivalents,0);
  assert.equal(summary.reproductionRate,1);

  const falseEquivalent=[...good];falseEquivalent[0]=result('case-0',{falseEquivalent:true});
  assert.equal(summarizeQualification(falseEquivalent).productionEligible,false);

  const tooSmall=good.slice(0,29);
  assert.equal(summarizeQualification(tooSmall).productionEligible,false);
});

test('prevents capability matrix from claiming production without evidence',()=>{
  const summary=summarizeQualification([]);
  const matrix={capabilities:[{id:'reducer',status:'PRODUCTION'}]};
  assert.throws(()=>assertCapabilityStatusSupported({capabilityMatrix:matrix,summary}),/PRODUCTION_EVIDENCE_INSUFFICIENT/);
  assert.equal(assertCapabilityStatusSupported({capabilityMatrix:{capabilities:[{id:'reducer',status:'EXPERIMENTAL'}]},summary}),true);
});
