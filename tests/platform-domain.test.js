import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  createInvestigation,
  transitionInvestigation,
  projectCompatibility,
  RUN_STATES,
  TERMINAL_RUN_STATES
} from '../src/platform-domain.js';

test('createProject normalizes a URL project and excludes secret-bearing fields', () => {
  const project = createProject({
    id: 'proj_alpha',
    name: 'Checkout',
    source: { kind: 'url', url: 'https://example.com/checkout', token: 'do-not-store' },
    credentials: { password: 'secret' }
  });
  assert.equal(project.id, 'proj_alpha');
  assert.equal(project.source.kind, 'url');
  assert.equal(project.source.url, 'https://example.com/checkout');
  assert.equal('token' in project.source, false);
  assert.equal('credentials' in project, false);
  assert.equal(project.compatibility, 'ready');
});

test('createProject rejects unsafe or unsupported source URLs', () => {
  assert.throws(() => createProject({ id:'x', name:'x', source:{kind:'url',url:'javascript:alert(1)'} }), /INVALID_SOURCE_URL/);
  assert.throws(() => createProject({ id:'x', name:'x', source:{kind:'git',url:'file:\/\/\/tmp\/repo'} }), /INVALID_SOURCE_URL/);
});

test('investigation stages move forward deterministically and reject accidental backwards transitions', () => {
  const investigation = createInvestigation('proj_alpha', {
    id:'inv_1',
    title:'Cart total becomes zero',
    report:{description:'Cart total becomes zero after deleting second item',route:'/checkout'}
  });
  assert.equal(investigation.stage, 'reproduce');
  const observed = transitionInvestigation(investigation, 'observe', 'reproduced');
  assert.equal(observed.stage, 'observe');
  const isolated = transitionInvestigation(observed, 'isolate', 'investigating');
  assert.equal(isolated.stage, 'isolate');
  assert.throws(() => transitionInvestigation(isolated, 'reproduce', 'draft'), /INVALID_STAGE_TRANSITION/);
});

test('projectCompatibility returns explicit readiness rather than optimistic compatibility', () => {
  assert.equal(projectCompatibility({source:{kind:'url',url:'https://example.com'}}).status, 'ready');
  assert.equal(projectCompatibility({source:{kind:'git',url:'https://github.com/acme/app.git'},detected:{framework:'next',commands:{}}}).status, 'configuration_required');
  assert.equal(projectCompatibility({source:{kind:'git',url:'https://github.com/acme/app.git'},detected:{framework:'next',commands:{start:['npm','run','dev']}}}).status, 'ready');
  assert.equal(projectCompatibility({source:{kind:'git',url:'https://github.com/acme/app.git'},detected:{framework:'unsupported'}}).status, 'unsupported');
});

test('run state vocabulary contains ordered work states and explicit terminal failures', () => {
  assert.deepEqual(RUN_STATES.slice(0,4), ['queued','provisioning','cloning','installing']);
  assert.ok(RUN_STATES.includes('verifying'));
  assert.ok(TERMINAL_RUN_STATES.includes('completed'));
  assert.ok(TERMINAL_RUN_STATES.includes('build_failed'));
  assert.ok(TERMINAL_RUN_STATES.includes('browser_failed'));
});
