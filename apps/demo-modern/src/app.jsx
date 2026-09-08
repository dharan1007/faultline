import React,{useEffect,useMemo,useState} from 'react';
import {canonicalJourney,candidateHints} from './demo-contract.js';
import {emitAnalytics,pollActivity,saveConfiguration} from './mock-api.js';

const deployments=[
  {id:'edge-api',name:'edge-api',region:'iad1',status:'Degraded',version:'v2.18.4',latency:'184 ms',requests:'14.2M'},
  {id:'auth-gateway',name:'auth-gateway',region:'bom1',status:'Healthy',version:'v5.4.1',latency:'42 ms',requests:'21.8M'},
  {id:'billing-worker',name:'billing-worker',region:'fra1',status:'Healthy',version:'v3.9.7',latency:'67 ms',requests:'4.6M'},
  {id:'search-index',name:'search-index',region:'sin1',status:'Investigating',version:'v7.1.2',latency:'312 ms',requests:'8.3M'},
  {id:'media-transform',name:'media-transform',region:'sfo1',status:'Healthy',version:'v4.6.0',latency:'89 ms',requests:'11.7M'},
  {id:'events-stream',name:'events-stream',region:'iad1',status:'Healthy',version:'v6.2.3',latency:'31 ms',requests:'29.4M'}
];

const activities=[
  ['edge-api','Latency threshold exceeded','2m'],['auth-gateway','Canary promoted to 100%','9m'],['search-index','Replica recovery started','16m'],['billing-worker','Queue depth normalized','31m'],['media-transform','New image runtime deployed','48m']
];

function Sparkline(){
  return <svg data-surface="usage-chart" viewBox="0 0 760 180" role="img" aria-label="Requests and latency over time">
    <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff5b9d" stopOpacity=".34"/><stop offset="1" stopColor="#ff5b9d" stopOpacity="0"/></linearGradient></defs>
    <g className="grid-lines"><path d="M0 35H760M0 80H760M0 125H760"/></g>
    <path className="area" d="M0 142 C55 132 72 70 126 92 S214 132 264 88 S355 38 405 76 S492 136 542 96 S635 46 690 73 S738 54 760 48 L760 180 L0 180Z"/>
    <path className="trend" d="M0 142 C55 132 72 70 126 92 S214 132 264 88 S355 38 405 76 S492 136 542 96 S635 46 690 73 S738 54 760 48"/>
  </svg>;
}

function Sidebar(){
  return <aside className="sidebar" data-surface="sidebar">
    <div className="brand"><span className="brand-mark">F</span><div><strong>Faultline Ops</strong><small>Demo workspace</small></div></div>
    <nav aria-label="Operations navigation">
      {['Overview','Deployments','Incidents','Runtime','Traces','Settings'].map((item,index)=><button key={item} className={index===0?'active':''}><span>{['⌂','◫','△','⌁','⌘','⚙'][index]}</span>{item}{item==='Incidents'&&<b>3</b>}</button>)}
    </nav>
    <div className="sidebar-foot"><span className="presence"/><div><strong>Production</strong><small>6 services connected</small></div></div>
  </aside>;
}

function Header({onReset,onCreate}){
  return <header className="topbar">
    <div className="command" data-surface="command-search"><span>⌕</span><input aria-label="Search deployments" placeholder="Search deployments, traces, incidents…"/><kbd>⌘ K</kbd></div>
    <div className="top-actions"><span className="live"><i/> Live</span><button className="secondary" onClick={onReset}>Reset scenario</button><button className="primary" onClick={onCreate}>Create deployment</button></div>
  </header>;
}

function HealthCards(){
  const cards=[['Availability','99.982%','+0.014%','good'],['P95 latency','184 ms','+31 ms','warn'],['Error rate','0.42%','+0.18%','warn'],['Requests','89.6M','+12.4%','good']];
  return <section className="health-grid" data-surface="health-cards" aria-label="Runtime health">
    {cards.map(([label,value,delta,tone])=><article data-health-card key={label}><div><span>{label}</span><i className={`status-dot ${tone}`}/></div><strong>{value}</strong><small className={tone}>{delta} this hour</small></article>)}
  </section>;
}

function DeploymentTable({selected,onOpen}){
  return <section className="panel deployments" data-surface="deployments-table">
    <div className="panel-head"><div><span className="eyebrow">Runtime inventory</span><h2>Deployments</h2></div><div className="filters"><button>All environments</button><button>All regions</button></div></div>
    <div className="table-wrap"><table><thead><tr><th>Service</th><th>Status</th><th>Region</th><th>Version</th><th>Latency</th><th>Requests</th><th/></tr></thead><tbody>
      {deployments.map(dep=><tr key={dep.id} data-deployment-row data-selected={selected?.id===dep.id?'true':'false'}><td><span className="service-icon">{dep.name.slice(0,2).toUpperCase()}</span><strong>{dep.name}</strong></td><td><span className={`status-chip ${dep.status.toLowerCase()}`}>{dep.status}</span></td><td><code>{dep.region}</code></td><td>{dep.version}</td><td>{dep.latency}</td><td>{dep.requests}</td><td><button className="row-action" aria-label={`Open ${dep.name} deployment`} onClick={()=>onOpen(dep)}>→</button></td></tr>)}
    </tbody></table></div>
  </section>;
}

function DetailPanel({deployment,onConfigure,onClose}){
  if(!deployment)return null;
  return <aside className="detail-panel" aria-label={`${deployment.name} details`}>
    <div className="detail-head"><div><span className="service-icon large">EA</span><div><span className="eyebrow">Selected deployment</span><h2>{deployment.name}</h2></div></div><button aria-label="Close deployment details" onClick={onClose}>×</button></div>
    <div className="detail-metrics"><div><span>Region</span><strong>{deployment.region}</strong></div><div><span>Version</span><strong>{deployment.version}</strong></div><div><span>Latency</span><strong>{deployment.latency}</strong></div></div>
    <div className="incident-note"><span>△</span><div><strong>Elevated tail latency</strong><p>Retries increased after the latest edge policy rollout. Configuration changes remain available.</p></div></div>
    <button className="primary wide" onClick={onConfigure}>Configure deployment</button>
  </aside>;
}

function ActivityFeed({tick}){
  return <section className="panel activity" data-surface="activity-feed"><div className="panel-head"><div><span className="eyebrow">Event stream</span><h2>Activity</h2></div><span className="updated">updated {tick?'now':'just now'}</span></div><ul>{activities.map(([name,event,time])=><li key={name+event}><span className="event-dot"/><div><strong>{event}</strong><small>{name}</small></div><time>{time}</time></li>)}</ul></section>;
}

function ConfigDrawer({open,onSave,onClose,saving}){
  const [environment,setEnvironment]=useState('production');
  const [advanced,setAdvanced]=useState(false);
  useEffect(()=>{if(open){setEnvironment('production');setAdvanced(false)}},[open]);
  if(!open)return null;
  return <aside className="config-drawer" role="dialog" aria-modal="true" aria-label="Deployment configuration">
    <div className="drawer-head"><div><span className="eyebrow">edge-api · iad1</span><h2>Configuration</h2></div><button aria-label="Close configuration" onClick={onClose}>×</button></div>
    <div className="drawer-section"><label htmlFor="demo-environment">Environment</label><select id="demo-environment" value={environment} onChange={e=>setEnvironment(e.target.value)}><option value="production">Production</option><option value="staging">Staging</option><option value="preview">Preview</option></select></div>
    <div className="drawer-section"><div className="field-copy"><strong>Delivery behavior</strong><p>Controls retry and edge-delivery policy for this deployment.</p></div><label className="toggle"><input type="checkbox" checked={advanced} onChange={e=>setAdvanced(e.target.checked)} aria-label="Enable advanced delivery"/><span/><b>Advanced delivery</b></label></div>
    <div className="drawer-section"><label>Retry budget</label><div className="segmented"><button className="active">Adaptive</button><button>Conservative</button><button>Off</button></div></div>
    <div className="drawer-section code-preview"><span>Runtime diff</span><pre>{`environment = "${environment}"\nadvanced_delivery = ${advanced}\nretry_policy = "adaptive"`}</pre></div>
    <div className="drawer-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving} onClick={()=>onSave({environment,advanced})}>{saving?'Saving…':'Save configuration'}</button></div>
  </aside>;
}

export default function App(){
  const [selected,setSelected]=useState(null);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [staleBackdrop,setStaleBackdrop]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveSucceeded,setSaveSucceeded]=useState(false);
  const [toast,setToast]=useState('');
  const [activityTick,setActivityTick]=useState(0);
  const [chartTick,setChartTick]=useState(0);

  const blocked=staleBackdrop&&!drawerOpen;
  const selectedName=selected?.name||null;

  useEffect(()=>{
    pollActivity().then(()=>setActivityTick(value=>value+1));
    const timer=setInterval(()=>setChartTick(value=>(value+1)%9),1400);
    return()=>clearInterval(timer);
  },[]);

  useEffect(()=>{
    const api=Object.freeze({
      version:'1.0.0',
      canonicalJourney,
      candidateHints:()=>candidateHints.map(item=>({...item})),
      bugState:()=>{
        const backdrop=document.querySelector('[data-stale-backdrop]');
        return {selectedDeployment:selectedName,drawerVisible:drawerOpen,saveSucceeded,blocked,backdropPointerEvents:backdrop?getComputedStyle(backdrop).pointerEvents:'none'};
      }
    });
    Object.defineProperty(window,'__FAULTLINE_DEMO__',{value:api,writable:false,configurable:true});
  },[selectedName,drawerOpen,saveSucceeded,blocked]);

  function selectDeployment(dep){
    setSelected(dep);setToast('');emitAnalytics('deployment_open',{deployment:dep.id});
    history.replaceState({},'',`?deployment=${encodeURIComponent(dep.id)}#runtime`);
  }

  function reset(){
    setSelected(null);setDrawerOpen(false);setStaleBackdrop(false);setSaving(false);setSaveSucceeded(false);setToast('');
    history.replaceState({},'',location.pathname);
  }

  async function save(settings){
    setSaving(true);setSaveSucceeded(false);
    const response=await saveConfiguration({deployment:'edge-api',...settings});
    if(response.ok){
      setSaveSucceeded(true);
      setToast('Configuration saved');
      setDrawerOpen(false);
      // Intentional canonical bug: the visual drawer exits, but its portal backdrop
      // remains mounted and pointer-active because cleanup is incorrectly tied to
      // a lifecycle signal that never fires after the successful async transition.
      setStaleBackdrop(true);
      emitAnalytics('config_saved',{environment:settings.environment});
    }
    setSaving(false);
  }

  const chartLabel=useMemo(()=>`${89.6+chartTick/10}M requests`,[chartTick]);

  return <div className="app" data-demo="modern-ops">
    <Sidebar/>
    <div className="workspace">
      <Header onReset={reset} onCreate={()=>setToast('New deployment draft opened')}/>
      <main className="content">
        <section className="page-title"><div><span className="eyebrow">Production · global edge</span><h1>Operations control</h1><p>Live deployment health, runtime changes, and incident signals across the fleet.</p></div><div className="title-meta"><span>Last deploy <strong>8m ago</strong></span><span>Commit <code>8f4ac21</code></span></div></section>
        <HealthCards/>
        <section className="main-grid">
          <section className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">Traffic telemetry</span><h2>Request volume</h2></div><div className="chart-value"><strong>{chartLabel}</strong><small>rolling 24h</small></div></div><Sparkline/><div className="chart-legend"><span><i className="pink"/>Requests</span><span><i/>P95 latency</span><button>24 hours⌄</button></div></section>
          <ActivityFeed tick={activityTick}/>
        </section>
        <DeploymentTable selected={selected} onOpen={selectDeployment}/>
      </main>
      <nav className="mobile-nav" data-mobile-nav aria-label="Mobile operations navigation"><button>⌂<span>Home</span></button><button>◫<span>Deploy</span></button><button>△<span>Incidents</span></button><button>⚙<span>Settings</span></button></nav>
    </div>
    <DetailPanel deployment={selected} onConfigure={()=>{setDrawerOpen(true);setStaleBackdrop(false);emitAnalytics('config_open')}} onClose={()=>setSelected(null)}/>
    {(drawerOpen||staleBackdrop)&&<div className={`drawer-backdrop ${staleBackdrop&&!drawerOpen?'stale':''}`} data-stale-backdrop aria-hidden="true" onClick={drawerOpen?()=>setDrawerOpen(false):undefined}/>} 
    <ConfigDrawer open={drawerOpen} onSave={save} onClose={()=>setDrawerOpen(false)} saving={saving}/>
    {toast&&<div className="toast" role="status"><span>✓</span>{toast}</div>}
  </div>;
}
