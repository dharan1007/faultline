export const canonicalJourney=Object.freeze([
  {id:'journey-open-edge-api',kind:'click',label:'Open edge-api deployment'},
  {id:'journey-open-config',kind:'click',label:'Configure deployment'},
  {id:'journey-switch-env',kind:'select',label:'Environment',value:'staging'},
  {id:'journey-enable-advanced',kind:'change',label:'Enable advanced delivery',value:true},
  {id:'journey-save',kind:'click',label:'Save configuration'},
  {id:'journey-observe-block',kind:'assertion',label:'Dashboard remains pointer blocked after success'}
]);

export const candidateHints=Object.freeze([
  {id:'journey:open-deployment',axis:'journey',description:'Open deployment details'},
  {id:'journey:configure',axis:'journey',description:'Open configuration drawer'},
  {id:'journey:switch-environment',axis:'journey',description:'Switch runtime environment'},
  {id:'journey:advanced-delivery',axis:'journey',description:'Enable advanced delivery'},
  {id:'journey:save',axis:'journey',description:'Save configuration'},
  {id:'dom:settings-drawer',axis:'dom',description:'Configuration drawer portal'},
  {id:'dom:drawer-backdrop',axis:'dom',description:'Drawer backdrop portal'},
  {id:'style:backdrop-pointer-events',axis:'style',description:'Exiting backdrop pointer interception'},
  {id:'style:drawer-exit-transition',axis:'style',description:'Drawer exit transition'},
  {id:'network:config-save',axis:'network',description:'Configuration save request'},
  {id:'network:analytics-noise',axis:'network',description:'Unrelated analytics request'},
  {id:'resource:activity-poller',axis:'resource',description:'Background activity poller'},
  {id:'state:drawer-lifecycle',axis:'browser-state',description:'Drawer lifecycle state'},
  {id:'route:deployment-query',axis:'route',description:'Selected deployment URL state'}
]);
