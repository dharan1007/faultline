import fs from 'node:fs';

function replaceOnce(path, from, to) {
  const source = fs.readFileSync(path, 'utf8');
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${path}: expected source fragment not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${path}: source fragment is not unique`);
  fs.writeFileSync(path, source.slice(0, first) + to + source.slice(first + from.length));
}

replaceOnce(
  'src/runtime.js',
  "const ORACLE_KINDS=['dom_property','computed_style','dom_exists','runtime_error'];",
  "const ORACLE_KINDS=['dom_property','dom_attribute','computed_style','dom_exists','runtime_error'];"
);

replaceOnce(
  'src/runtime.js',
  "  if(['dom_property','computed_style'].includes(oracle.kind)&&(typeof oracle.property!=='string'||!oracle.property.trim()))throw new Error('INVALID_ORACLE');\n  if(oracle.delayMs!==undefined&&(!Number.isFinite(oracle.delayMs)||oracle.delayMs<0||oracle.delayMs>2000))throw new Error('INVALID_ORACLE');",
  "  if(['dom_property','dom_attribute','computed_style'].includes(oracle.kind)&&(typeof oracle.property!=='string'||!oracle.property.trim()))throw new Error('INVALID_ORACLE');\n  if(oracle.kind==='dom_attribute'&&!(typeof oracle.equals==='string'||oracle.equals===null))throw new Error('INVALID_ORACLE');\n  if(oracle.delayMs!==undefined&&(!Number.isFinite(oracle.delayMs)||oracle.delayMs<0||oracle.delayMs>2000))throw new Error('INVALID_ORACLE');"
);

replaceOnce(
  'src/runtime.js',
  "   else {const el=querySelector(o.selector);if(o.kind==='dom_exists')actual=!!el;else if(o.kind==='computed_style')actual=el?readComputedStyle(el)[o.property]:undefined;else actual=el?el[o.property]:undefined}",
  "   else {const el=querySelector(o.selector);if(o.kind==='dom_exists')actual=!!el;else if(o.kind==='dom_attribute')actual=el?el.getAttribute(o.property):undefined;else if(o.kind==='computed_style')actual=el?readComputedStyle(el)[o.property]:undefined;else actual=el?el[o.property]:undefined}"
);

replaceOnce(
  'src/runtime.js',
  "$('lock').onclick=()=>{const actionKind=$('action-kind').value;let action;if(actionKind==='sequence'){try{action={kind:'sequence',steps:JSON.parse($('action-sequence').value)}}catch{renderHealth('ERROR');$('summary').textContent='INVALID_ACTION_SEQUENCE_JSON';return;}}else{action={kind:actionKind,selector:$('action-selector').value};if(actionKind==='set_value')action.value=$('action-value').value;if(actionKind==='set_checked')action.checked=$('action-checked').value==='true';}try{defineOracle({oracle:{kind:$('oracle-kind').value,selector:$('oracle-selector').value,property:$('oracle-property').value,equals:normalizeExpected($('oracle-equals').value),action,delayMs:0}})}catch(e){renderHealth('ERROR');$('summary').textContent=String(e?.message||e);}};",
  "$('lock').onclick=()=>{const actionKind=$('action-kind').value;let action;if(actionKind==='sequence'){try{action={kind:'sequence',steps:JSON.parse($('action-sequence').value)}}catch{renderHealth('ERROR');$('summary').textContent='INVALID_ACTION_SEQUENCE_JSON';return;}}else{action={kind:actionKind,selector:$('action-selector').value};if(actionKind==='set_value')action.value=$('action-value').value;if(actionKind==='set_checked')action.checked=$('action-checked').value==='true';}const oracleKind=$('oracle-kind').value,rawEquals=$('oracle-equals').value,equals=oracleKind==='dom_attribute'?(rawEquals==='null'?null:rawEquals):normalizeExpected(rawEquals);try{defineOracle({oracle:{kind:oracleKind,selector:$('oracle-selector').value,property:$('oracle-property').value,equals,action,delayMs:0}})}catch(e){renderHealth('ERROR');$('summary').textContent=String(e?.message||e);}};"
);

replaceOnce(
  'index.html',
  '<option value="dom_property">DOM property</option><option value="computed_style">Computed style</option>',
  '<option value="dom_property">DOM property</option><option value="dom_attribute">DOM attribute</option><option value="computed_style">Computed style</option>'
);

replaceOnce(
  'package.json',
  '&& node --check tests/oracle-set-checked-action.mjs",',
  '&& node --check tests/oracle-set-checked-action.mjs && node --check tests/oracle-dom-attribute.mjs",'
);
replaceOnce(
  'package.json',
  '&& node tests/oracle-set-checked-action.mjs"',
  '&& node tests/oracle-set-checked-action.mjs && node tests/oracle-dom-attribute.mjs"'
);

replaceOnce(
  'docs/WEBMCP.md',
  '## Deterministic pre-measurement actions\n',
  '## Deterministic oracle measurements\n\nFAULTLINE supports DOM property, DOM attribute, computed-style, DOM-existence, and runtime-error measurements. `dom_attribute` reads the named attribute with `Element.getAttribute()` after the configured action and delay. Its expected value must be a string or `null`: strings preserve exact serialized attribute values such as `aria-expanded="true"` or `data-state="open"`, while `null` distinguishes an absent attribute from an attribute whose value is the empty string. This makes ARIA and framework state-marker regressions directly reproducible without mapping attribute names onto unrelated JavaScript properties.\n\n## Deterministic pre-measurement actions\n'
);

console.log('Applied deterministic DOM attribute oracle implementation.');
