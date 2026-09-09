import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticUnits, removeUnits, ddminReduce, ancestorClosure, hierarchyFrontier, createRevisionStore } from '../src/reducer-engine.js';

test('semanticUnits finds removable HTML, CSS and JS units deterministically', () => {
  assert.deepEqual(semanticUnits('html','<main><p>A</p><aside>B</aside></main>').map(x=>x.text), ['<main><p>A</p><aside>B</aside></main>','<p>A</p>','<aside>B</aside>']);
  assert.equal(semanticUnits('css','a{color:red} b{display:none}').filter(x=>x.kind==='rule').length, 2);
  assert.equal(semanticUnits('js','const a=1;\nconst b=2;').length, 2);
});

test('HTML units expose balanced hierarchy, void leaves, and ignore raw-text markup', () => {
  const source='<main><section><input id="name"><p>A</p></section><script>const x="<aside>fake</aside>";</script></main>';
  const units=semanticUnits('html',source);
  const main=units.find(x=>x.text===source);
  const section=units.find(x=>x.text.startsWith('<section>'));
  const input=units.find(x=>x.text==='<input id="name">');
  const paragraph=units.find(x=>x.text==='<p>A</p>');
  const script=units.find(x=>x.kind==='element'&&x.text.startsWith('<script>'));
  assert.ok(main&&section&&input&&paragraph&&script);
  assert.equal(main.depth,0);
  assert.equal(main.parentId,null);
  assert.equal(section.depth,1);
  assert.equal(section.parentId,main.id);
  assert.equal(input.depth,2);
  assert.equal(input.parentId,section.id);
  assert.equal(paragraph.depth,2);
  assert.equal(paragraph.parentId,section.id);
  assert.equal(script.depth,1);
  assert.equal(script.parentId,main.id);
  assert.equal(units.some(x=>x.text.trim().startsWith('<aside>')),false,'raw-text contents must not create fake HTML descendants');
});

test('CSS units expose rule/declaration hierarchy without splitting quoted/comment delimiters', () => {
  const source='/* { ignored } */ .card{content:"a;b}"; color:red; --x:";";} @media (min-width:1px){.inner{display:block;opacity:.8}}';
  const units=semanticUnits('css',source);
  const card=units.find(x=>x.kind==='rule'&&x.text.includes('.card{'));
  assert.ok(card);
  const cardDecls=units.filter(x=>x.kind==='declaration'&&x.parentId===card.id);
  assert.deepEqual(cardDecls.map(x=>x.text.trim()),['content:"a;b}";','color:red;','--x:";";']);
  assert.ok(cardDecls.every(x=>x.depth===card.depth+1));
  const media=units.find(x=>x.kind==='rule'&&x.text.trim().startsWith('@media'));
  const inner=units.find(x=>x.kind==='rule'&&x.text.trim().startsWith('.inner'));
  assert.ok(media&&inner);
  assert.equal(inner.parentId,media.id);
  assert.equal(inner.depth,media.depth+1);
});

test('ancestorClosure protects pinned descendants through every structural ancestor', () => {
  const units=semanticUnits('html','<main><section><form><input></form></section><aside>noise</aside></main>');
  const input=units.find(x=>x.text==='<input>');
  const form=units.find(x=>x.text.startsWith('<form>'));
  const section=units.find(x=>x.text.startsWith('<section>'));
  const main=units.find(x=>x.text.startsWith('<main>'));
  const closure=ancestorClosure(units,[input.id]);
  assert.deepEqual(new Set([input.id,form.id,section.id,main.id]),closure);
});

test('hierarchyFrontier is deterministic and never mixes ancestors with descendants', () => {
  const units=semanticUnits('html','<main><section><p>A</p><p>B</p></section><aside>C</aside></main>');
  const roots=hierarchyFrontier(units,new Set(),0);
  assert.deepEqual(roots.map(x=>x.text),['<main><section><p>A</p><p>B</p></section><aside>C</aside></main>']);
  const depth1=hierarchyFrontier(units,new Set(),1);
  assert.deepEqual(depth1.map(x=>x.text),['<section><p>A</p><p>B</p></section>','<aside>C</aside>']);
  for(const a of depth1)for(const b of depth1)if(a!==b)assert.ok(a.end<=b.start||b.end<=a.start,'frontier units must not overlap');
});

test('removeUnits removes only selected non-overlapping ranges', () => {
  const source = '<main><p>A</p><aside>B</aside></main>';
  const units = semanticUnits('html', source);
  const aside=units.find(x=>x.text==='<aside>B</aside>');
  assert.equal(removeUnits(source,[aside]), '<main><p>A</p></main>');
});

test('ddminReduce preserves protected units and the failing predicate', async () => {
  const units = ['required','noise-a','noise-b'];
  const result = await ddminReduce(units, async kept => kept.includes('required') ? 'FAIL' : 'PASS', { protectedItems:['required'], maxTrials:30 });
  assert.deepEqual(result.items, ['required']);
  assert.ok(result.trials.length > 0);
});

test('ddminReduce can remove the final one-element frontier when empty still fails', async () => {
  const result=await ddminReduce(['noise'],async()=> 'FAIL',{maxTrials:10});
  assert.deepEqual(result.items,[]);
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
