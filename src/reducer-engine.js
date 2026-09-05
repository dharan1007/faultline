const clone = value => JSON.parse(JSON.stringify(value));
const MAX_REVISION_SNAPSHOTS = 32;
const MAX_REVISION_LEDGER = 64;

function trimSnapshots(snapshots,currentRevision) {
  while (snapshots.size > MAX_REVISION_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value;
    if (oldest === currentRevision) break;
    snapshots.delete(oldest);
  }
}

export function semanticUnits(axis, source) {
  source = String(source ?? '');
  const units = [];
  const push = (start, end, kind) => units.push({ id:`${axis}:${start}:${end}`, axis, start, end, kind, text:source.slice(start,end) });
  if (axis === 'html') {
    const paired = /<([a-zA-Z][\w:-]*)\b[^>]*>[^<>]*<\/\1\s*>/g;
    const voidish = /<(?:img|input|br|hr|meta|link|source|area|base|embed|param|track|wbr)\b[^>]*\/?\s*>/gi;
    let m; while ((m=paired.exec(source))) push(m.index,m.index+m[0].length,'element');
    while ((m=voidish.exec(source))) push(m.index,m.index+m[0].length,'element');
  } else if (axis === 'css') {
    const rule = /[^{}]+\{[^{}]*\}/g; let m; while ((m=rule.exec(source))) push(m.index,m.index+m[0].length,'rule');
  } else if (axis === 'js') {
    const line = /[^\n;{}]+(?:\([^\n{}]*\)\s*=>\s*\{[^{}]*\}|\{[^{}]*\})?\s*;?/g; let m;
    while ((m=line.exec(source))) if (m[0].trim()) push(m.index,m.index+m[0].length,'statement');
  } else throw new Error('INVALID_AXIS');
  return units.sort((a,b)=>a.start-b.start || a.end-b.end);
}

export function removeUnits(source, units) {
  const ranges = [...units].sort((a,b)=>b.start-a.start);
  let out = String(source ?? '');
  for (const unit of ranges) out = out.slice(0,unit.start)+out.slice(unit.end);
  return out;
}

export async function ddminReduce(items, evaluate, { protectedItems=[], maxTrials=100 }={}) {
  const protectedSet = new Set(protectedItems);
  const protectedOrdered = items.filter(x=>protectedSet.has(x));
  let removable = items.filter(x=>!protectedSet.has(x));
  let trials = [];
  let count = 0;
  const run = async candidateRemovable => {
    if (++count > maxTrials) return 'UNRESOLVED';
    const kept = items.filter(x=>protectedSet.has(x) || candidateRemovable.includes(x));
    const status = await evaluate(kept);
    trials.push({ keptCount:kept.length, status });
    return status;
  };
  if ((await run(removable)) !== 'FAIL') throw new Error('BASELINE_NOT_FAILING');
  let n = 2;
  while (removable.length >= 1) {
    if (!removable.length) break;
    const size = Math.ceil(removable.length/n);
    let changed = false;
    for (let i=0;i<removable.length;i+=size) {
      const chunk = removable.slice(i,i+size);
      const candidate = removable.filter(x=>!chunk.includes(x));
      if ((await run(candidate)) === 'FAIL') { removable=candidate; n=Math.max(2,n-1); changed=true; break; }
    }
    if (changed) continue;
    if (n >= removable.length) break;
    n = Math.min(removable.length,n*2);
  }
  const keptSet = new Set([...protectedOrdered,...removable]);
  return { items:items.filter(x=>keptSet.has(x)), trials, trialCount:count };
}

function normalizePersistedState(persistedState) {
  if (!persistedState || typeof persistedState !== 'object') return null;
  const revision = Number(persistedState.revision);
  if (!Number.isInteger(revision) || revision < 1 || persistedState.value === undefined) throw new Error('INVALID_PERSISTED_STATE');
  if (!Array.isArray(persistedState.snapshots) || !Array.isArray(persistedState.ledger)) throw new Error('INVALID_PERSISTED_STATE');
  const currentRevision = `r${revision}`;
  const snapshots = new Map();
  for (const entry of persistedState.snapshots) {
    if (!Array.isArray(entry) || entry.length !== 2 || !/^r[1-9]\d*$/.test(String(entry[0]))) throw new Error('INVALID_PERSISTED_STATE');
    snapshots.set(String(entry[0]), clone(entry[1]));
  }
  if (!snapshots.has(currentRevision)) snapshots.set(currentRevision, clone(persistedState.value));
  trimSnapshots(snapshots,currentRevision);
  return { revision, value:clone(persistedState.value), snapshots, ledger:clone(persistedState.ledger.slice(-MAX_REVISION_LEDGER)) };
}

export function createRevisionStore(initialValue, persistedState=null) {
  const hydrated = normalizePersistedState(persistedState);
  let revision = hydrated?.revision ?? 1;
  let value = hydrated?.value ?? clone(initialValue);
  const snapshots = hydrated?.snapshots ?? new Map([['r1', clone(value)]]);
  const ledger = hydrated?.ledger ?? [];
  const current = () => `r${revision}`;
  const assertRevision = expected => { if (expected !== current()) throw new Error(`STALE_REVISION expected=${expected} current=${current()}`); };
  const inspect = () => ({ revision:current(), value:clone(value), history:clone(ledger) });
  const commit = (nextValue,event={},expectedRevision=current()) => {
    assertRevision(expectedRevision);
    value=clone(nextValue);
    revision++;
    snapshots.set(current(),clone(value));
    trimSnapshots(snapshots,current());
    ledger.push({...event,revision:current(),at:new Date().toISOString()});
    if (ledger.length > MAX_REVISION_LEDGER) ledger.splice(0,ledger.length-MAX_REVISION_LEDGER);
    return inspect();
  };
  const restore = (targetRevision,expectedRevision=current()) => { assertRevision(expectedRevision); if(!snapshots.has(targetRevision)) throw new Error('REVISION_NOT_FOUND'); return commit(snapshots.get(targetRevision),{kind:'restore',from:targetRevision},expectedRevision); };
  const dump = () => ({ version:1, revision, value:clone(value), snapshots:[...snapshots.entries()].map(([rev,snapshot])=>[rev,clone(snapshot)]), ledger:clone(ledger) });
  return { inspect, commit, restore, assertRevision, snapshot:rev=>snapshots.has(rev)?clone(snapshots.get(rev)):undefined, dump };
}
