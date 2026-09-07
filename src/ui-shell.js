import './runtime.js';

const api = () => {
  if (!window.faultline) throw new Error('FAULTLINE_RUNTIME_UNAVAILABLE');
  return window.faultline;
};

export function faultlineState(){
  return api().inspect();
}

export function reportUiError(error,target=document.querySelector('[data-ui-error]')){
  const message=String(error?.message||error||'UNKNOWN_ERROR');
  if(target){
    target.hidden=false;
    target.textContent=message;
    target.setAttribute('role','alert');
  }
  const status=document.querySelector('[data-shell-health]');
  if(status){
    status.textContent='ERROR';
    status.dataset.state='ERROR';
  }
  return message;
}

export function clearUiError(target=document.querySelector('[data-ui-error]')){
  if(!target)return;
  target.hidden=true;
  target.textContent='';
}

export async function copyText(text){
  const value=String(text);
  if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(value);
    return true;
  }
  const textarea=document.createElement('textarea');
  textarea.value=value;
  textarea.setAttribute('readonly','');
  textarea.style.position='fixed';
  textarea.style.opacity='0';
  document.body.append(textarea);
  textarea.select();
  const copied=document.execCommand('copy');
  textarea.remove();
  if(!copied)throw new Error('COPY_UNAVAILABLE');
  return true;
}

export function downloadText(filename,text,type='text/plain'){
  const blob=new Blob([String(text)],{type});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  link.hidden=true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}

export function caseSourceSize(caseValue){
  return String(caseValue?.html??'').length+String(caseValue?.css??'').length+String(caseValue?.js??'').length;
}

export function formatOracle(oracle){
  if(!oracle)return 'No oracle';
  if(oracle.kind==='runtime_error')return oracle.equals===undefined?'Any runtime error':`Runtime error · ${String(oracle.equals)}`;
  if(oracle.kind==='dom_exists')return `DOM existence · ${oracle.selector}`;
  if(oracle.kind==='computed_style')return `Computed style · ${oracle.selector} · ${oracle.property}`;
  return `DOM property · ${oracle.selector} · ${oracle.property}`;
}

function activeRoute(){
  const name=location.pathname.split('/').pop()||'index.html';
  return name===''?'index.html':name;
}

export function syncShell({health}={}){
  const state=faultlineState();
  const manifest=api().manifest();
  const active=activeRoute();
  for(const link of document.querySelectorAll('nav[aria-label="Product navigation"] a')){
    const href=(link.getAttribute('href')||'').split('/').pop();
    if(href===active)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  for(const node of document.querySelectorAll('[data-shell-revision]'))node.textContent=state.revision;
  for(const node of document.querySelectorAll('[data-shell-tool-count]'))node.textContent=`${manifest.length} tools`;
  for(const node of document.querySelectorAll('[data-shell-webmcp]')){
    const available=Boolean(document.modelContext?.registerTool);
    node.textContent=available?'WebMCP ready':'WebMCP unavailable';
    node.dataset.state=available?'ready':'UNRESOLVED';
  }
  for(const node of document.querySelectorAll('[data-shell-health]')){
    const next=health||state.latest?.status||'READY';
    node.textContent=next;
    node.dataset.state=next;
  }
  return state;
}

export function productHeader(){
  return `
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="product-header">
      <div class="header-inner">
        <a class="brand" href="./index.html" aria-label="FAULTLINE home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span><span class="brand-word">FAULTLINE</span><span class="brand-sub">Causal browser failure reduction</span></span>
        </a>
        <nav class="product-nav" aria-label="Product navigation">
          <a href="./index.html">Start</a>
          <a href="./workbench.html">Workbench</a>
          <a href="./evidence.html">Evidence</a>
          <a href="./connect.html">Connect</a>
        </nav>
        <div class="shell-status" aria-label="FAULTLINE runtime status">
          <span class="status-pill" data-shell-health data-state="READY" aria-live="polite">READY</span>
          <span class="status-pill" data-shell-webmcp>WebMCP checking</span>
          <span class="status-pill" data-shell-revision>r1</span>
        </div>
      </div>
    </header>`;
}

export function mountProductHeader(){
  const host=document.querySelector('[data-product-header]');
  if(host)host.outerHTML=productHeader();
  return syncShell();
}
