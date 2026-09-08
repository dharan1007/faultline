import test from 'node:test';
import assert from 'node:assert/strict';

import {suggestOracles} from '../src/oracle-suggestions.js';

test('suggestOracles derives runtime, network, route, and element symptoms from captured evidence',()=>{
  const observations=[
    {kind:'capture.runtime',data:{type:'pageerror',name:'TypeError',message:'Cannot read properties of undefined'}},
    {kind:'capture.network',data:{phase:'response',status:503,url:'https://app.example/api/save'}},
    {kind:'capture.navigation',data:{type:'navigation_final',url:'https://app.example/settings?token=[REDACTED]'}}
  ];
  const suggestions=suggestOracles(observations,{kind:'element',selector:{role:'button',name:'Save configuration'},visible:true,clickable:false,text:'Save configuration'});
  const types=suggestions.map(item=>item.type);
  assert.ok(types.includes('runtime_error'));
  assert.ok(types.includes('network_status'));
  assert.ok(types.includes('route'));
  assert.ok(types.includes('clickability'));
  assert.ok(types.includes('content'));
  assert.ok(suggestions.every(item=>Object.isFrozen(item)));
});

test('suggestOracles never echoes sensitive captured query/header values',()=>{
  const observations=[
    {kind:'capture.network',data:{phase:'request',url:'https://app.example/api?token=super-secret',headers:{authorization:'Bearer super-secret'}}},
    {kind:'capture.navigation',data:{type:'navigation_final',url:'https://app.example/dashboard?session=super-secret'}}
  ];
  const serialized=JSON.stringify(suggestOracles(observations));
  assert.equal(serialized.includes('super-secret'),false);
});

test('suggestOracles returns deterministic ids and ordering for identical evidence',()=>{
  const observations=[{kind:'capture.network',data:{phase:'response',status:500,url:'https://app.example/api/save'}}];
  assert.deepEqual(suggestOracles(observations),suggestOracles(observations));
});
