const STATIC = new Map([
  ['/projects','projects'],
  ['/connect','connect'],
  ['/runs','runs'],
  ['/evidence','evidence'],
  ['/integrations','integrations'],
  ['/settings','settings'],
  ['/minimal','minimal']
]);

function pathFromHash(hash){
  const raw=String(hash||'').replace(/^#/,'');
  if(!raw || raw==='/') return '/projects';
  return raw.startsWith('/')?raw:`/${raw}`;
}

export function parseRoute(hash){
  const path=pathFromHash(hash).split('?')[0];
  if(STATIC.has(path)) return {name:STATIC.get(path),params:{}};
  let match=/^\/project\/([^/]+)$/.exec(path);
  if(match) return {name:'project',params:{projectId:decodeURIComponent(match[1])}};
  match=/^\/investigation\/([^/]+)$/.exec(path);
  if(match) return {name:'investigation',params:{investigationId:decodeURIComponent(match[1])}};
  return {name:'not-found',params:{}};
}

export function hrefFor(name,params={}){
  const byName={projects:'/projects',connect:'/connect',runs:'/runs',evidence:'/evidence',integrations:'/integrations',settings:'/settings',minimal:'/minimal'};
  if(byName[name]) return `#${byName[name]}`;
  if(name==='project'&&params.projectId!=null) return `#/project/${encodeURIComponent(String(params.projectId))}`;
  if(name==='investigation'&&params.investigationId!=null) return `#/investigation/${encodeURIComponent(String(params.investigationId))}`;
  return '#/projects';
}
