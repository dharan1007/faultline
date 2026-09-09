import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticUnits, removeUnits, ddminReduce, createRevisionStore } from '../src/reducer-engine.js';

test('semanticUnits exposes balanced HTML hierarchy deterministically', () => {
  const units = semanticUnits('html','<main><p>A</p><aside>B</aside></main>');
  assert.deepEqual(units.map(x=>x.text), [
    '<main><p>A</p><aside>B</aside></main>',
    '<p>A</p>',
    '<aside>B</aside>'
  ]);
  const [main,p,aside]=units;
  assert.equal(main.parentId,null);
  assert.equal(main.depth,0);
  assert.equal(p.parentId,main.id);
  assert.equal(p.depth,1);
  assert.equal(aside.parentId,main.id);
  assert.equal(aside.depth,1);
});

test('semanticUnits exposes CSS rules and direct declarations as a hierarchy', () => {
  const units=semanticUnits('css','a{color:red;display:block} b{display:none}');
  const rules=units.filter(unit=>unit.kind==='rule');
  const declarations=units.filter(unit=>unit.kind==='declaration');
  assert.equal(rules.length,2);
  assert.deepEqual(declarations.map(unit=>unit.text.trim()),['color:red;','display:block','display:none']);
  assert.equal(declarations[0].parentId,rules[0].id);
  assert.equal(declarations[0].depth,1);
  assert.equal(declarations[1].parentId,rules[0].id);
  assert.equal(declarations[2].parentId,rules[1].id);
});

test('semanticUnits keeps JavaScript statement discovery flat and compatible', () => {
  const units=semanticUnits('js','const a=1;\nconst b=2;');
  assert.equal(units.length,2);
  assert.ok(units.every(unit=>unit.parentId===null&&unit.depth===0));
});

test('removeUnits collapses selected descendants already covered by an ancestor', () => {
  const source='<main><p>A</p><aside>B</aside></main><footer>C</footer>';
  const units=semanticUnits('html',source);
  const main=units.find(unit=>unit.text.startsWith('<main>'));
  const paragraph=units.find(unit=>unit.text==='<p>A</p>');
  assert.equal(removeUnits(source,[main,paragraph]),'<footer>C</footer>');
});

test('removeUnits rejects partially overlapping ranges instead of corrupting source', () => {
  assert.throws(
    ()=>removeUnits('abcdefghij',[{start:1,end:6},{start:4,end:8}]),
    /OVERLAPPING_UNIT_RANGES/
  );
});

test('ddminReduce preserves protected units and the failing predicate', async () => {
  const units = ['required','noise-a','noise-b'];
  const result = await ddminReduce(units, async kept => kept.includes('required') ? 'FAIL' : 'PASS', { protectedItems:['required'], maxTrials:30 });
  assert.deepEqual(result.items, ['required']);
  assert.ok(result.trials.length > 0);
});

test('ddminReduce rejects when the trial budget cannot complete the search', async () => {
  const units = ['required','noise-a','noise-b'];
  await assert.rejects(
    ddminReduce(units, async kept => kept.includes('required') ? 'FAIL' : 'PASS', { maxTrials:1 }),
    /TRIAL_BUDGET_EXHAUSTED/
  );
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

test('revision store rejects persisted snapshots from revisions newer than the canonical revision', () => {
  const tampered = {
    version:1,
    revision:2,
    value:{html:'B',css:'',js:''},
    snapshots:[
      ['r1',{html:'A',css:'',js:''}],
      ['r2',{html:'B',css:'',js:''}],
      ['r99',{html:'future',css:'',js:''}]
    ],
    ledger:[]
  };
  assert.throws(
    () => createRevisionStore({html:'ignored',css:'',js:''}, tampered),
    /INVALID_PERSISTED_STATE/,
    'recovery history must never contain a future revision that canonical history has not reached'
  );
});
