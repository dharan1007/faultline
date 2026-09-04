import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticUnits, removeUnits, ddminReduce, createRevisionStore } from '../src/reducer-engine.js';

test('semanticUnits finds removable HTML, CSS and JS units deterministically', () => {
  assert.deepEqual(semanticUnits('html','<main><p>A</p><aside>B</aside></main>').map(x=>x.text), ['<p>A</p>','<aside>B</aside>']);
  assert.equal(semanticUnits('css','a{color:red} b{display:none}').length, 2);
  assert.equal(semanticUnits('js','const a=1;\nconst b=2;').length, 2);
});

test('removeUnits removes only selected ranges', () => {
  const source = '<main><p>A</p><aside>B</aside></main>';
  const units = semanticUnits('html', source);
  assert.equal(removeUnits(source,[units[1]]), '<main><p>A</p></main>');
});

test('ddminReduce preserves protected units and the failing predicate', async () => {
  const units = ['required','noise-a','noise-b'];
  const result = await ddminReduce(units, async kept => kept.includes('required') ? 'FAIL' : 'PASS', { protectedItems:['required'], maxTrials:30 });
  assert.deepEqual(result.items, ['required']);
  assert.ok(result.trials.length > 0);
});

test('revision store rejects stale mutations and can restore snapshots', () => {
  const store = createRevisionStore({html:'A',css:'',js:''});
  const r1 = store.inspect().revision;
  const r2 = store.commit({...store.inspect().value,html:'B'}, {kind:'edit'}, r1).revision;
  assert.throws(() => store.commit({html:'C',css:'',js:''},{kind:'edit'},r1), /STALE_REVISION/);
  const restored = store.restore(r1, r2);
  assert.equal(restored.value.html, 'A');
  assert.equal(restored.revision, 'r3');
});

test('revision store dump and hydrate preserve canonical revision, snapshots and history', () => {
  const original = createRevisionStore({html:'A',css:'',js:''});
  const r1 = original.inspect().revision;
  const r2 = original.commit({html:'B',css:'',js:''},{kind:'edit'},r1).revision;
  const persisted = original.dump();

  const hydrated = createRevisionStore({html:'ignored',css:'',js:''}, persisted);
  assert.equal(hydrated.inspect().revision, r2);
  assert.equal(hydrated.inspect().value.html, 'B');
  assert.equal(hydrated.inspect().history.length, 1);
  assert.equal(hydrated.snapshot(r1).html, 'A');

  const restored = hydrated.restore(r1, r2);
  assert.equal(restored.revision, 'r3');
  assert.equal(restored.value.html, 'A');
});
