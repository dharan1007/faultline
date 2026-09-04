import { createWorkspaceStore, createIndexedDbAdapter, createMemoryAdapter } from './workspace-store.js';
import { createProject, createInvestigation, transitionInvestigation, INVESTIGATION_STAGES } from './platform-domain.js';
import { parseRoute, hrefFor } from './router.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const title=value=>String(value||'').replace(/(^|[-_\s])\w/g,m=>m.toUpperCase()).replaceAll('-',' ');
const adapter=typeof indexedDB!=='undefined'?createIndexedDbAdapter():createMemoryAdapter();
const workspace=createWorkspaceStore(adapter);
await workspace.load();

let sourceKind='url';
let route=parseRoute(location.hash);
let flash='';

window.faultlinePlatform={
  ready:false,
  inspect:()=>({route,workspace:workspace.snapshot()}),
  navigate:(name,params)=>{location.hash=hrefFor(name,params);},
  version:'0.9.0'
};

function setFlash(message){flash=message;}
function consumeFlash(){const value=flash;flash='';return value;}
function setContext(label,detail='Local workspace'){$('context-label').textContent=label;$('context-detail').textContent=detail;}
function setCurrentNav(name){document.querySelectorAll('[data-nav]').forEach(link=>{const active=link.dataset.nav===name||(name==='project'&&link.dataset.nav==='projects')||(name==='investigation'&&link.dataset.nav==='investigations');if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});}
function showView(name){document.querySelectorAll('[data-view]').forEach(view=>{view.hidden=view.dataset.view!==name;});}
function go(name,params){location.hash=hrefFor(name,params);}
function randomId(prefix){return `${prefix}_${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}`;}

function renderProjects(){
  showView('projects');setContext('Projects','Connected applications');
  const projects=workspace.listProjects(), body=$('projects-body');
  if(!projects.length){body.innerHTML=`<div class="empty"><p class="eyebrow">NO PROJECTS CONNECTED</p><h2>Start from the application you actually run</h2><p>Connect a live site, deployment or Git repository. Raw HTML/CSS/JS is available only when you deliberately choose a minimal reproducer.</p><div class="actions" style="justify-content:center"><a class="btn primary" href="#/connect">Connect project</a><a class="btn ghost" href="#/minimal">Open minimal reproducer</a></div><div class="quick-paths"><div class="quick-path"><strong>Live URL</strong><span>Investigate a staging or production route immediately.</span></div><div class="quick-path"><strong>Git repository</strong><span>Detect framework, package manager and runnable lifecycle.</span></div><div class="quick-path"><strong>Minimal reproducer</strong><span>Use the deterministic low-level reducer when you already have a small case.</span></div></div></div>`;return;}
  body.innerHTML=`<div class="grid-2">${projects.map(project=>`<a class="card interactive" href="${hrefFor('project',{projectId:project.id})}"><div class="label-row"><span class="badge ${esc(project.compatibility)}">${esc(project.compatibility)}</span><span class="small">${project.source.kind==='url'?'Live URL':project.source.kind==='git'?'Git repository':'Minimal'}</span></div><h2 style="margin-top:18px">${esc(project.name)}</h2><p>${esc(project.source.url||'Local reproducer')}</p></a>`).join('')}</div>`;
}

function renderInvestigations(){
  showView('investigations');setContext('Investigations','Reproduce → isolate → verify');
  const list=workspace.listInvestigations(), body=$('investigations-body');
  if(!list.length){body.innerHTML='<div class="empty"><h2>No investigations yet</h2><p>Start from a connected project so the failure stays tied to a real source and revision.</p><a class="btn primary" href="#/projects">Choose project</a></div>';return;}
  body.innerHTML=`<div class="list">${list.map(item=>`<a class="card interactive" href="${hrefFor('investigation',{investigationId:item.id})}"><div class="label-row"><div><strong>${esc(item.title)}</strong><div class="small">${esc(item.projectId)}</div></div><span class="badge ${esc(item.status)}">${esc(item.stage)} · ${esc(item.status)}</span></div></a>`).join('')}</div>`;
}

function renderConnect(){
  showView('connect');setContext('Connect project','Source → inspect → verify');
  document.querySelectorAll('[data-source-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.sourceKind===sourceKind)));
  $('url-fields').hidden=sourceKind!=='url';$('git-fields').hidden=sourceKind!=='git';$('minimal-fields').hidden=sourceKind!=='minimal';
}

function renderProject(projectId){
  const project=workspace.getProject(projectId);showView('project');
  if(!project){setContext('Project unavailable');$('project-content').innerHTML='<div class="empty"><h2>Project not found</h2><a class="btn" href="#/projects">Back to projects</a></div>';return;}
  setContext(project.name,project.source.url||'Minimal reproducer');
  const type=project.source.kind==='url'?'Live URL':project.source.kind==='git'?'Git repository':'Minimal reproducer';
  $('project-content').innerHTML=`<div class="page-head"><div><p class="eyebrow">PROJECT</p><h1>${esc(project.name)}</h1><p>${esc(project.source.url||'Browser-local deterministic case')}</p></div><div class="actions"><button class="btn primary" id="start-investigation">Start investigation</button></div></div><div class="grid-3"><div class="card"><p class="eyebrow">SOURCE</p><div class="metric" style="font-size:18px">${type}</div><p>${esc(project.source.branch||project.source.revision||'Current target')}</p></div><div class="card"><p class="eyebrow">COMPATIBILITY</p><div style="margin:8px 0"><span class="badge ${esc(project.compatibility)}">${esc(project.compatibility).toUpperCase()}</span></div><p>${project.compatibility==='ready'?'Ready for the selected investigation mode.':'Runtime configuration is required before remote execution.'}</p></div><div class="card"><p class="eyebrow">INTEGRATION</p><div class="metric" style="font-size:18px">MCP + REST</div><p>Use the same investigation surface from coding agents and CI.</p></div></div><div class="card" style="margin-top:14px"><div class="label-row"><div><p class="eyebrow">DETECTED RUNTIME</p><h2>${esc(title(project.detected?.framework||project.source.kind==='url'?'Browser target':'Pending inspection'))}</h2></div><a class="btn ghost" href="#/integrations">Connect coding agent</a></div><div class="list"><div class="list-row"><span>Package manager</span><span class="muted">${esc(project.detected?.packageManager||'Not required')}</span></div><div class="list-row"><span>Workspace</span><span class="muted">${esc(project.detected?.workspace||'Not required')}</span></div><div class="list-row"><span>Execution</span><span class="muted">${project.source.kind==='url'?'Remote browser target':'Isolated runner'}</span></div></div></div>`;
  $('start-investigation').onclick=async()=>{const inv=createInvestigation(project.id,{id:randomId('inv'),title:`${project.name} investigation`,report:{}});await workspace.putInvestigation(inv);go('investigation',{investigationId:inv.id});};
}

function stageMarkup(investigation){
  const current=INVESTIGATION_STAGES.indexOf(investigation.stage);
  return `<div class="timeline" aria-label="Investigation progress">${INVESTIGATION_STAGES.map((stage,index)=>`<div class="stage ${index<current?'done':''} ${index===current?'current':''}"><span class="n">${index+1}</span><span>${title(stage)}</span></div>`).join('')}</div>`;
}

function reproduceMarkup(inv){
  return `<div class="two-column"><section class="card"><p class="eyebrow">1 · REPRODUCE</p><h2>Define the failure in product language</h2><p>Tell FAULTLINE what breaks. Technical selectors and source units remain optional.</p><div class="field"><label for="failure-description">What is failing?</label><textarea id="failure-description" placeholder="Example: Cart total becomes zero after removing the second item">${esc(inv.report?.description||'')}</textarea></div><div class="field"><label for="failure-route">Route</label><input class="input" id="failure-route" value="${esc(inv.report?.route||'')}" placeholder="/checkout"></div><div class="grid-2"><div class="field"><label for="failure-expected">Expected behavior</label><textarea id="failure-expected">${esc(inv.report?.expected||'')}</textarea></div><div class="field"><label for="failure-observed">Observed behavior</label><textarea id="failure-observed">${esc(inv.report?.observed||'')}</textarea></div></div><div id="reproduction-save-status" class="notice success" ${inv.status==='reproduced'?'':'hidden'}>Reproduction definition saved</div><div class="actions" style="margin-top:14px"><button class="btn primary" id="save-reproduction">Save reproduction</button><button class="btn" id="continue-observe" ${inv.status==='reproduced'?'':'disabled'}>Continue to observe</button></div></section><aside class="card"><p class="eyebrow">DETERMINISTIC CONTRACT</p><h2>Oracle will be derived and reviewable</h2><p>FAULTLINE records expected and observed state first. When an executable assertion is available, the exact selector/property/error condition is shown here for review.</p><div class="code" style="margin-top:14px">status: ${inv.status==='reproduced'?'reproduction_saved':'awaiting_definition'}\nroute: ${esc(inv.report?.route||'(not set)')}\nsource revision: ${esc(inv.sourceRevision)}</div><details style="margin-top:14px"><summary>Advanced oracle details</summary><p class="small">Low-level oracle controls remain available in the Minimal Reproducer workspace.</p></details></aside></div>`;
}
function observeMarkup(inv){return `<div class="two-column"><section class="card"><p class="eyebrow">2 · OBSERVE</p><h2>Observation workspace</h2><p>Runtime errors, console output, route state, browser state and network summaries appear here before FAULTLINE makes any causal claim.</p><div class="notice warn" style="margin-top:16px">No remote run has been executed yet. Start a run after the connected runtime is verified.</div><div class="actions" style="margin-top:14px"><button class="btn primary" id="continue-isolate">Continue to isolate</button></div></section><aside class="card"><p class="eyebrow">REPORT</p><div class="list"><div class="list-row"><span>Route</span><span class="muted">${esc(inv.report?.route||'—')}</span></div><div class="list-row"><span>Expected</span><span class="muted">${esc(inv.report?.expected||'—')}</span></div><div class="list-row"><span>Observed</span><span class="muted">${esc(inv.report?.observed||'—')}</span></div></div></aside></div>`;}
function isolateMarkup(){return `<div class="card"><p class="eyebrow">3 · ISOLATE</p><h2>Causal isolation</h2><p>Executed interventions will separate necessary components from removable noise. Advanced semantic-unit controls live in the Minimal Reproducer workspace.</p><div class="actions" style="margin-top:14px"><a class="btn" href="#/minimal">Open advanced reducer</a></div></div>`;}
function verifyMarkup(){return `<div class="card"><p class="eyebrow">4 · VERIFY</p><h2>Verification</h2><p>Re-run the minimized scenario against the same environment fingerprint before a result is marked verified.</p></div>`;}
function handoffMarkup(){return `<div class="card"><p class="eyebrow">5 · HANDOFF</p><h2>Developer handoff</h2><p>Export the evidence receipt, minimal reproducer and machine-readable context or hand it directly to a connected coding agent.</p><div class="actions" style="margin-top:14px"><a class="btn primary" href="#/integrations">Connect coding agent</a></div></div>`;}

function renderInvestigation(id){
  const inv=workspace.getInvestigation(id);showView('investigation');
  if(!inv){setContext('Investigation unavailable');$('investigation-content').innerHTML='<div class="empty"><h2>Investigation not found</h2><a class="btn" href="#/investigations">Back to investigations</a></div>';return;}
  const project=workspace.getProject(inv.projectId);setContext(inv.title,project?.name||inv.projectId);
  const stageContent={reproduce:reproduceMarkup(inv),observe:observeMarkup(inv),isolate:isolateMarkup(inv),verify:verifyMarkup(inv),handoff:handoffMarkup(inv)}[inv.stage];
  $('investigation-content').innerHTML=`<div class="page-head"><div><p class="eyebrow">INVESTIGATION</p><h1>${esc(inv.title)}</h1><p>${esc(project?.name||inv.projectId)} · ${esc(inv.status)}</p></div><div class="actions"><a class="btn ghost" href="#/evidence">View evidence</a></div></div>${stageMarkup(inv)}${stageContent}`;
  if(inv.stage==='reproduce'){
    $('save-reproduction').onclick=async()=>{const next={...inv,status:'reproduced',report:{description:$('failure-description').value.trim(),route:$('failure-route').value.trim(),expected:$('failure-expected').value.trim(),observed:$('failure-observed').value.trim()},updatedAt:new Date().toISOString()};await workspace.putInvestigation(next);setFlash('Reproduction definition saved');renderInvestigation(id);};
    $('continue-observe').onclick=async()=>{const current=workspace.getInvestigation(id);if(current.status!=='reproduced')return;await workspace.putInvestigation(transitionInvestigation(current,'observe','reproduced'));renderInvestigation(id);};
    const message=consumeFlash();if(message){$('reproduction-save-status').hidden=false;$('reproduction-save-status').textContent=message;}
  }
  if(inv.stage==='observe') $('continue-isolate').onclick=async()=>{await workspace.putInvestigation(transitionInvestigation(inv,'isolate','investigating'));renderInvestigation(id);};
}

function renderRuns(){showView('runs');setContext('Runs','Execution history');const runs=workspace.listRuns();$('runs-body').innerHTML=runs.length?`<div class="list">${runs.map(run=>`<div class="card"><div class="label-row"><strong>${esc(run.id)}</strong><span class="badge ${esc(run.status)}">${esc(run.status)}</span></div></div>`).join('')}</div>`:'<div class="empty"><h2>No remote runs yet</h2><p>Runs appear after a repository or live target is verified and an investigation executes.</p><a class="btn primary" href="#/projects">Choose project</a></div>';}
function renderEvidence(){showView('evidence');setContext('Evidence','Executed counterfactuals');const items=workspace.listEvidence();$('evidence-body').innerHTML=items.length?`<div class="list">${items.map(item=>`<div class="card"><strong>${esc(item.kind)}</strong><p>${esc(item.status)}</p></div>`).join('')}</div>`:'<div class="empty"><h2>No causal evidence yet</h2><p>Observations are not called causes. Evidence appears only after executed interventions or verification runs.</p></div>';}
function renderIntegrations(){showView('integrations');setContext('Integrations','Agent and API surfaces');}
function renderSettings(){showView('settings');setContext('Settings','Runtime and local data');}
function renderMinimal(){showView('minimal');setContext('Minimal reproducer','Advanced deterministic engine');}
function renderNotFound(){showView('not-found');setContext('Not found');}

function renderRoute(){
  route=parseRoute(location.hash);setCurrentNav(route.name);document.body.classList.remove('nav-open');
  if(route.name==='projects')renderProjects();else if(route.name==='investigations')renderInvestigations();else if(route.name==='connect')renderConnect();else if(route.name==='project')renderProject(route.params.projectId);else if(route.name==='investigation')renderInvestigation(route.params.investigationId);else if(route.name==='runs')renderRuns();else if(route.name==='evidence')renderEvidence();else if(route.name==='integrations')renderIntegrations();else if(route.name==='settings')renderSettings();else if(route.name==='minimal')renderMinimal();else renderNotFound();
}

document.querySelectorAll('[data-source-kind]').forEach(button=>button.addEventListener('click',()=>{sourceKind=button.dataset.sourceKind;renderConnect();}));
$('connect-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const name=$('connect-project-name').value.trim()||'Untitled project';
  if(sourceKind==='minimal'){go('minimal');return;}
  const input=sourceKind==='url'?$('connect-live-url'):$('connect-git-url');
  if(!input.value.trim()){input.focus();return;}
  try{
    const project=createProject({id:randomId('proj'),name,source:{kind:sourceKind,url:input.value.trim(),branch:sourceKind==='git'?$('connect-git-branch').value.trim()||'main':undefined},detected:sourceKind==='git'?{framework:'pending',commands:{}}:{framework:'browser-target',commands:{start:['remote-browser']}}});
    await workspace.putProject(project);go('project',{projectId:project.id});
  }catch(error){$('connect-status').hidden=false;$('connect-status').className='notice';$('connect-status').textContent=String(error.message||error);}
});

$('new-investigation').onclick=()=>{const projects=workspace.listProjects();if(projects.length===1)go('project',{projectId:projects[0].id});else go(projects.length?'projects':'connect');};
$('mobile-nav-toggle').onclick=()=>document.body.classList.toggle('nav-open');
window.addEventListener('hashchange',renderRoute);
if(!location.hash)location.hash='#/projects';else renderRoute();
window.faultlinePlatform.ready=true;
