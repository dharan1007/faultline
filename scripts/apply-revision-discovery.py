from pathlib import Path

runtime=Path('src/runtime.js')
text=runtime.read_text()
anchor="function history({limit=100}={}){ return clone(experimentLedger.slice(-Math.max(1,Math.min(200,Number(limit)||100)))); }\nfunction restore({expectedRevision=revision(),targetRevision})"
insert="""function history({limit=100}={}){ return clone(experimentLedger.slice(-Math.max(1,Math.min(200,Number(limit)||100)))); }
function listRevisions({limit=MAX_RUNTIME_REVISIONS}={}){
  const bounded=Math.max(1,Math.min(MAX_RUNTIME_REVISIONS,Number(limit)||MAX_RUNTIME_REVISIONS));
  const events=new Map((store.inspect().history||[]).map(event=>[event.revision,event]));
  const currentRevision=revision();
  const items=[...revisions.entries()].reverse().slice(0,bounded).map(([rev,snapshot])=>{
    const c=snapshot?.value||{};
    const event=events.get(rev);
    return {
      revision:rev,
      current:rev===currentRevision,
      event:event?clone(event):null,
      summary:{
        htmlChars:String(c.html??'').length,
        cssChars:String(c.css??'').length,
        jsChars:String(c.js??'').length,
        oracleKind:c.oracle?.kind||null,
        pinCount:Array.isArray(snapshot?.pins)?snapshot.pins.length:0
      }
    };
  });
  return {currentRevision,retentionLimit:MAX_RUNTIME_REVISIONS,revisions:items};
}
function restore({expectedRevision=revision(),targetRevision})"""
if anchor not in text:
  raise SystemExit('runtime history/restore anchor not found')
text=text.replace(anchor,insert,1)

anchor=" ['faultline_history','Read recent deterministic experiment evidence.',{limit:{type:'integer',minimum:1,maximum:200}},async input=>history(input),true,true],\n ['faultline_restore'"
insert=""" ['faultline_history','Read recent deterministic experiment evidence.',{limit:{type:'integer',minimum:1,maximum:200}},async input=>history(input),true,true],
 ['faultline_revisions','List bounded recoverable canonical revisions with mutation metadata for guarded restore.',{limit:{type:'integer',minimum:1,maximum:16}},async input=>listRevisions(input),true,false],
 ['faultline_restore'"""
if anchor not in text:
  raise SystemExit('runtime tool anchor not found')
text=text.replace(anchor,insert,1)

old="window.faultline={inspect,units,loadCase,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,restore,exportCase,autopilot,manifest:"
new="window.faultline={inspect,units,loadCase,resetCase,run,defineOracle,applySource,probe,reduce,pin,history,revisions:listRevisions,restore,exportCase,autopilot,manifest:"
if old not in text:
  raise SystemExit('runtime public API anchor not found')
text=text.replace(old,new,1)
runtime.write_text(text)

ui=Path('src/ui.js')
text=ui.read_text()
text=text.replace("const toolCountLabel=({13:'thirteen',14:'fourteen'})[toolCount]||String(toolCount);","const toolCountLabel=({13:'thirteen',14:'fourteen',15:'fifteen'})[toolCount]||String(toolCount);")
units_note="""  if(!integrationNote.textContent.includes('faultline_units')){
    const separator=document.createTextNode(' Discover actionable semantic IDs with ');
    const tool=document.createElement('code');
    tool.textContent='faultline_units';
    integrationNote.append(separator,tool,document.createTextNode(' before probe or pin operations.'));
  }
"""
revisions_note=units_note+"""  if(!integrationNote.textContent.includes('faultline_revisions')){
    const separator=document.createTextNode(' Discover bounded recovery points with ');
    const tool=document.createElement('code');
    tool.textContent='faultline_revisions';
    integrationNote.append(separator,tool,document.createTextNode(' before faultline_restore.'));
  }
"""
if units_note not in text:
  raise SystemExit('ui integration note anchor not found')
text=text.replace(units_note,revisions_note,1)
init_anchor="""installCaseImport();
installCaseJsonExport();

function syncAxisTabStops"""
recovery="""function installRevisionRecovery(){
  const actionBar=document.querySelector('#case-workspace .action-bar');
  if(!actionBar||document.getElementById('revision-recovery'))return ()=>{};

  const details=document.createElement('details');
  details.id='revision-recovery';
  details.style.marginTop='12px';
  details.style.paddingTop='12px';
  details.style.borderTop='1px solid var(--line)';

  const summary=document.createElement('summary');
  summary.className='btn ghost';
  summary.textContent='Recoverable revisions';

  const help=document.createElement('p');
  help.className='small';
  help.textContent='Restore a retained canonical checkpoint as a new guarded revision. Current state is never rewritten in place.';

  const list=document.createElement('div');
  list.setAttribute('role','list');
  list.setAttribute('aria-label','Recoverable canonical revisions');
  list.style.display='grid';
  list.style.gap='7px';

  const refresh=()=>{
    const state=window.faultline.revisions({limit:8});
    list.replaceChildren();
    for(const item of state.revisions){
      const row=document.createElement('div');
      row.setAttribute('role','listitem');
      row.style.display='flex';
      row.style.alignItems='center';
      row.style.justifyContent='space-between';
      row.style.gap='10px';
      row.style.padding='9px 10px';
      row.style.border='1px solid var(--line)';
      row.style.borderRadius='9px';
      row.style.background='#08090c';

      const mutation=item.event?.kind?item.event.kind.replaceAll('_',' '):'initial state';
      const mutationAxis=item.event?.axis?` · ${item.event.axis.toUpperCase()}`:'';
      const meta=document.createElement('span');
      meta.className='small';
      meta.textContent=`${item.revision}${item.current?' · current':''} · ${mutation}${mutationAxis} · H${item.summary.htmlChars} C${item.summary.cssChars} J${item.summary.jsChars}`;
      row.append(meta);

      if(!item.current){
        const button=document.createElement('button');
        button.type='button';
        button.className='btn';
        button.dataset.revision=item.revision;
        button.textContent='Restore';
        button.setAttribute('aria-label',`Restore canonical revision ${item.revision}`);
        button.addEventListener('click',()=>{
          try{
            const current=window.faultline.inspect();
            window.faultline.restore({expectedRevision:current.revision,targetRevision:item.revision});
            refresh();
            const health=document.getElementById('health');
            if(health){health.textContent='READY';health.dataset.state='READY';}
          }catch(error){reportActionError(error);refresh();}
        });
        row.append(button);
      }
      list.append(row);
    }
  };

  details.addEventListener('toggle',()=>{if(details.open)refresh();});
  details.append(summary,help,list);
  actionBar.insertAdjacentElement('afterend',details);
  refresh();

  const revisionBadge=document.getElementById('revision');
  if(revisionBadge)new MutationObserver(refresh).observe(revisionBadge,{childList:true,subtree:true,characterData:true});
  return refresh;
}

installCaseImport();
installCaseJsonExport();
installRevisionRecovery();

function syncAxisTabStops"""
if init_anchor not in text:
  raise SystemExit('ui install anchor not found')
text=text.replace(init_anchor,recovery,1)
ui.write_text(text)

browser=Path('tests/browser-e2e.mjs')
text=browser.read_text()
text=text.replace('window.__webmcpTools?.length===14','window.__webmcpTools?.length===15')
text=text.replace("['applySource','autopilot','defineOracle','exportCase','history','inspect','loadCase','manifest','pin','probe','reduce','resetCase','restore','run','units']","['applySource','autopilot','defineOracle','exportCase','history','inspect','loadCase','manifest','pin','probe','reduce','resetCase','restore','revisions','run','units']")
text=text.replace("'WebMCP ready · 14 tools'","'WebMCP ready · 15 tools'")
text=text.replace('/fourteen WebMCP tools/i','/fifteen WebMCP tools/i')
text=text.replace('assert.match(connectionText,/faultline_units/);','assert.match(connectionText,/faultline_units/);\n  assert.match(connectionText,/faultline_revisions/);')
text=text.replace('assert.equal(toolContract.length,14);','assert.equal(toolContract.length,15);')
text=text.replace('registered 14 spec-valid WebMCP tools','registered 15 spec-valid WebMCP tools')
browser.write_text(text)
