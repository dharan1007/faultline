import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/reducer-engine.js';
const { semanticUnits, removeUnits, ddminReduce, createRevisionStore } = engine;

test('semanticUnits finds removable HTML, CSS and JS units deterministically', () => {
  assert.deepEqual(semanticUnits('html','<main><p>A</p><aside>B</aside></main>').map(x=>x.text), ['<main><p>A</p><aside>B</aside></main>','<p>A</p>','<aside>B</aside>']);
  assert.equal(semanticUnits('css','a{color:red} b{display:none}').filter(x=>x.kind==='rule').length, 2);
  assert.equal(semanticUnits('js','const a=1;\nconst b=2;').length, 2);
});

test('semanticUnits exposes deterministic nested HTML hierarchy', () => {
  const source='<main><section><p>A</p></section><aside>B</aside></main>';
  const units=semanticUnits('html',source);
  const byText=new Map(units.map(unit=>[unit.text,unit]));
  const main=byText.get(source);
  const section=byText.get('<section><p>A</p></section>');
  const paragraph=byText.get('<p>A</p>');
  const aside=byText.get('<aside>B</aside>');
  assert.ok(main); assert.ok(section); assert.ok(paragraph); assert.ok(aside);
  assert.equal(main.depth,0); assert.equal(main.parentId,null);
  assert.equal(section.depth,1); assert.equal(section.parentId,main.id);
  assert.equal(paragraph.depth,2); assert.equal(paragraph.parentId,section.id);
  assert.equal(aside.depth,1); assert.equal(aside.parentId,main.id);
});

test('semanticUnits exposes CSS declaration children inside required rules', () => {
  const units=semanticUnits('css','.card{width:300px;color:red}');
  const rule=units.find(unit=>unit.kind==='rule');
  const declarations=units.filter(unit=>unit.kind==='declaration');
  assert.ok(rule);
  assert.deepEqual(declarations.map(unit=>unit.text),['width:300px;','color:red']);
  assert.ok(declarations.every(unit=>unit.depth===rule.depth+1));
  assert.ok(declarations.every(unit=>unit.parentId===rule.id));
});

test('structural scanners respect quoted delimiters and malformed boundaries conservatively', () => {
  const html='<main data-label="1 > 0"><p>A</p></main><section><b>open';
  const htmlUnits=semanticUnits('html',html);
  assert.ok(htmlUnits.some(unit=>unit.text==='<main data-label="1 > 0"><p>A</p></main>'));
  assert.ok(htmlUnits.some(unit=>unit.text==='<p>A</p>'));
  assert.equal(htmlUnits.some(unit=>unit.text.includes('<section><b>open')),false);
  const css='.card{content:"}";color:red/* { ignored } */;width:10px}';
  const cssUnits=semanticUnits('css',css);
  assert.equal(cssUnits.filter(unit=>unit.kind==='rule').length,1);
  assert.deepEqual(cssUnits.filter(unit=>unit.kind==='declaration').map(unit=>unit.text),['content:"}";','color:red/* { ignored } */;','width:10px']);
});

test('protectedHierarchyIds closes explicit pins over every ancestor', () => {
  assert.equal(typeof engine.protectedHierarchyIds,'function','production reducer must expose ancestor-closure helper');
  const units=semanticUnits('html','<main><section><p id="target">A</p><span>N</span></section></main>');
  const target=units.find(unit=>unit.text.startsWith('<p id="target"'));
  const section=units.find(unit=>unit.text.startsWith('<section>'));
  const main=units.find(unit=>unit.text.startsWith('<main>'));
  assert.ok(target); assert.ok(section); assert.ok(main);
  const protectedIds=engine.protectedHierarchyIds(units,[target.id]);
  assert.deepEqual(new Set([target.id,section.id,main.id]),protectedIds);
});

test('remapUnitAfterRemoval shifts a surviving pin by exact removed ranges, even with duplicate text', () => {
  assert.equal(typeof engine.remapUnitAfterRemoval,'function','production reducer must expose exact offset pin remapping');
  const before='<aside>noise</aside><main><button>Keep</button><button>Keep</button></main>';
  const beforeUnits=semanticUnits('html',before);
  const pinned=beforeUnits.filter(unit=>unit.text==='<button>Keep</button>')[1];
  const aside=beforeUnits.find(unit=>unit.text==='<aside>noise</aside>');
  const after=removeUnits(before,[aside]);
  const afterUnits=semanticUnits('html',after);
  const remapped=engine.remapUnitAfterRemoval(pinned,[aside],afterUnits);
  assert.ok(remapped);
  assert.equal(remapped.text,pinned.text);
  assert.equal(remapped.start,pinned.start-(aside.end-aside.start));
  assert.notEqual(remapped.id,pinned.id,'offset-changing reduction must produce a new canonical pin id');
});

test('hierarchicalReduce removes coarse parents before descending and keeps protected ancestry', async () => {
  assert.equal(typeof engine.hierarchicalReduce,'function','production reducer must expose hierarchy-aware ddmin');
  const source='<aside><div><p>noise</p></div></aside><main><section><span>child-noise</span><button id="target">Keep</button></section></main>';
  const units=semanticUnits('html',source);
  const target=units.find(unit=>unit.text.startsWith('<button id="target"'));
  assert.ok(target);
  const result=await engine.hierarchicalReduce(units,async removedIds=>{
    const removed=units.filter(unit=>removedIds.has(unit.id));
    const candidate=removeUnits(source,removed);
    return candidate.includes('id="target"')?'FAIL':'PASS';
  },{protectedItems:[target.id],maxTrials:80});
  const removed=units.filter(unit=>result.removedIds.has(unit.id));
  const reduced=removeUnits(source,removed);
  assert.equal(reduced.includes('<aside>'),false,'irrelevant parent subtree should be removed as a coarse unit');
  assert.equal(reduced.includes('child-noise'),false,'reducer should descend into surviving protected ancestry');
  assert.equal(reduced.includes('id="target"'),true);
  assert.ok(result.frontiers.length>=2);
  assert.ok(result.trialCount<=80);
});

test('hierarchicalReduce uses one explicit global trial budget', async () => {
  assert.equal(typeof engine.hierarchicalReduce,'function');
  const units=semanticUnits('html','<aside>A</aside><main><p>B</p><button id="target">K</button></main>');
  const target=units.find(unit=>unit.text.startsWith('<button id="target"'));
  assert.ok(target);
  await assert.rejects(engine.hierarchicalReduce(units,async()=> 'FAIL',{protectedItems:[target.id],maxTrials:1}),/TRIAL_BUDGET_EXHAUSTED/);
});

test('removeUnits removes only selected ranges', () => {
  const source = '<main><p>A</p><aside>B</aside></main>';
  const units = semanticUnits('html', source);
  const aside=units.find(unit=>unit.text==='<aside>B</aside>');
  assert.ok(aside);
  assert.equal(removeUnits(source,[aside]), '<main><p>A</p></main>');
});

test('ddminReduce preserves protected units and the failing predicate', async () => {
  const units = ['required','noise-a','noise-b'];
  const result = await ddminReduce(units, async kept => kept.includes('required') ? 'FAIL' : 'PASS', { protectedItems:['required'], maxTrials:30 });
  assert.deepEqual(result.items, ['required']);
  assert.ok(result.trials.length > 0);
});

test('ddminReduce rejects when the trial budget cannot complete the search', async () => {
  const units = ['required','noise-a','noise-b'];
  await assert.rejects(ddminReduce(units, async kept => kept.includes('required') ? 'FAIL' : 'PASS', { maxTrials:1 }),/TRIAL_BUDGET_EXHAUSTED/);
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
  const tampered = {version:1,revision:2,value:{html:'B',css:'',js:''},snapshots:[['r1',{html:'A',css:'',js:''}],['r2',{html:'B',css:'',js:''}],['r99',{html:'future',css:'',js:''}]],ledger:[]};
  assert.throws(() => createRevisionStore({html:'ignored',css:'',js:''}, tampered),/INVALID_PERSISTED_STATE/);
});
