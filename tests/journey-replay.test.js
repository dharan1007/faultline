import test from 'node:test';
import assert from 'node:assert/strict';

import {createJourneyStep,rankSelectorStrategies,validateJourney} from '../src/journey.js';

test('rankSelectorStrategies prefers accessible semantics before implementation selectors',()=>{
  const strategies=rankSelectorStrategies({
    role:'button',accessibleName:'Save configuration',testId:'save-config',text:'Save configuration',css:'#drawer > button.primary'
  });
  assert.deepEqual(strategies.map(item=>item.kind),['role','test_id','text','css']);
  assert.deepEqual(strategies[0],{kind:'role',role:'button',name:'Save configuration'});
  assert.deepEqual(strategies[1],{kind:'test_id',value:'save-config'});
});

test('createJourneyStep returns immutable canonical steps and redacts sensitive input values',()=>{
  const step=createJourneyStep({
    id:'type-password',kind:'type',target:{role:'textbox',accessibleName:'Password'},value:'super-secret',sensitive:true,timeoutMs:2500
  });
  assert.equal(step.value,'[REDACTED]');
  assert.equal(step.sensitive,true);
  assert.equal(step.timeoutMs,2500);
  assert.ok(Object.isFrozen(step));
  assert.ok(Object.isFrozen(step.target));
  assert.throws(()=>{step.value='changed';},TypeError);
});

test('validateJourney rejects duplicate ids and unsupported step kinds',()=>{
  assert.throws(()=>validateJourney([
    {id:'same',kind:'click',target:{role:'button',accessibleName:'Open'}},
    {id:'same',kind:'click',target:{role:'button',accessibleName:'Save'}}
  ]),/DUPLICATE_JOURNEY_STEP_ID/);
  assert.throws(()=>createJourneyStep({id:'bad',kind:'eval',target:{css:'body'}}),/UNSUPPORTED_JOURNEY_STEP_KIND/);
});
