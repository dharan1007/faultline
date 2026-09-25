import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runLiveTrial } from '../integrations/playwright-live/index.js';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:800,height:600}});
try{
  const hover=await runLiveTrial({
    page,
    reset:async()=>page.setContent(`<button id="target">Hover</button><script>target.addEventListener('mouseenter',()=>target.dataset.hit='1')</script>`),
    recipe:[{kind:'hover',selector:'#target'}],
    oracle:{kind:'dom_attribute',selector:'#target',property:'data-hit',equals:'1'},
    provenance:{resetId:'hover-fixture'}
  });
  assert.equal(hover.status,'FAIL');
  assert.ok(hover.fingerprint);

  const keyboard=await runLiveTrial({
    page,
    reset:async()=>page.setContent(`<input id="q"><script>q.addEventListener('keydown',e=>{if(e.key==='Enter')q.dataset.enter='1'})</script>`),
    recipe:[{kind:'focus',selector:'#q'},{kind:'key_press',key:'Enter'}],
    oracle:{kind:'dom_attribute',selector:'#q',property:'data-enter',equals:'1'},
    provenance:{resetId:'keyboard-fixture'}
  });
  assert.equal(keyboard.status,'FAIL');

  const scrolling=await runLiveTrial({
    page,
    reset:async()=>page.setContent(`<div id="panel" style="height:50px;overflow:auto"><div style="height:500px"></div></div>`),
    recipe:[{kind:'scroll',selector:'#panel',y:120}],
    oracle:{kind:'dom_property',selector:'#panel',property:'scrollTop',equals:120},
    provenance:{resetId:'scroll-fixture'}
  });
  assert.equal(scrolling.status,'FAIL');

  const select=await runLiveTrial({
    page,
    reset:async()=>page.setContent(`<select id="country"><option value="US">US</option><option value="IN">IN</option></select>`),
    recipe:[{kind:'select_option',selector:'#country',value:'IN'}],
    oracle:{kind:'dom_property',selector:'#country',property:'value',equals:'IN'},
    provenance:{resetId:'select-fixture'}
  });
  assert.equal(select.status,'FAIL');

  console.log(JSON.stringify({hover:hover.timingMs,keyboard:keyboard.timingMs,scroll:scrolling.timingMs,select:select.timingMs}));
}finally{await browser.close();}
