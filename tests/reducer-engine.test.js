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

test('semanticUnits exposes parser-backed JavaScript statement hierarchy', () => {
  const source=`function fail(){
  const required = true;
  console.debug('noise');
  if(required){
    document.querySelector('#app').dataset.failed='yes';
    console.log('inner noise');
  }
}
fail();
console.info('root noise');`;
  const units=semanticUnits('js',source);
  const fn=units.find(unit=>unit.text.startsWith('function fail()'));
  const ifStatement=units.find(unit=>unit.text.trim().startsWith('if(required)'));
  const assignment=units.find(unit=>unit.text.trim().startsWith("document.querySelector('#app').dataset.failed='yes'"));
  const rootNoise=units.find(unit=>unit.text.trim().startsWith("console.info('root noise')"));
  assert.ok(fn&&ifStatement&&assignment&&rootNoise,'parser-backed discovery must expose nested and root statements');
  assert.equal(fn.parentId,null);
  assert.equal(fn.depth,0);
  assert.equal(ifStatement.parentId,fn.id,'nested control flow must identify the enclosing function as its semantic parent');
  assert.equal(ifStatement.depth,1);
  assert.equal(assignment.parentId,ifStatement.id,'statements inside a control-flow block must identify that statement as their semantic parent');
  assert.equal(assignment.depth,2);
  assert.equal(rootNoise.parentId,null);
});

test('semanticUnits parses ES module declarations without falling back to flat regex discovery', () => {
  const source=`import value from './dep.js';
export function run(){
  const answer=value+1;
  return answer;
}`;
  const units=semanticUnits('js',source);
  const exported=units.find(unit=>unit.text.startsWith('export function run()'));
  const declaration=units.find(unit=>unit.text.trim().startsWith('const answer=value+1'));
  const returned=units.find(unit=>unit.text.trim().startsWith('return answer'));
  assert.ok(exported&&declaration&&returned,'module syntax must remain structurally reducible');
  assert.equal(exported.parentId,null);
  assert.equal(declaration.parentId,exported.id);
  assert.equal(returned.parentId,exported.id);
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
