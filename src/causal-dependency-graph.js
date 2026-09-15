// Causal dependency graph v1 — structural scaffold for failure causality.
// Browser + Node safe: no imports.
// v1 builds containment (unit hierarchy), order (events, network) and an
// oracle anchor from reduction inputs. It does NOT claim dynamic data-flow
// tracing: unit→oracle influence edges are added only by reduction evidence
// (a unit whose removal flips SAME_CAUSE FAIL→PASS is causally implicated).
// Dynamic tracing is planned work; see docs/CAUSAL_EQUIVALENCE.md.

export const DEPENDENCY_GRAPH_VERSION = 'faultline.dependency-graph.v1';

const unitNodeId = (axis, id) => `unit:${axis}:${id}`;

export function buildDependencyGraph({ oracle, unitsByAxis = {}, networkSequence = null, eventOrdering = null } = {}) {
  if (!oracle || typeof oracle !== 'object') throw new Error('GRAPH_MISSING_ORACLE');
  const nodes = [{ id: 'oracle', kind: 'oracle', label: `${oracle.kind}${oracle.selector ? ` ${oracle.selector}` : ''}${oracle.property ? `:${oracle.property}` : ''}` }];
  const edges = [];
  for (const axis of ['html', 'css', 'js']) {
    const units = Array.isArray(unitsByAxis[axis]) ? unitsByAxis[axis] : [];
    for (const unit of units) {
      if (!unit?.id) continue;
      nodes.push({ id: unitNodeId(axis, unit.id), kind: 'unit', axis, unitKind: unit.kind ?? null, depth: unit.depth ?? 0 });
      if (unit.parentId) edges.push({ from: unitNodeId(axis, unit.id), to: unitNodeId(axis, unit.parentId), relation: 'contained-by' });
      else edges.push({ from: unitNodeId(axis, unit.id), to: 'oracle', relation: 'candidate' });
    }
  }
  const net = Array.isArray(networkSequence) ? networkSequence : (networkSequence ? [networkSequence] : []);
  net.forEach((entry, i) => {
    const id = `network:${i}`;
    nodes.push({ id, kind: 'network', label: `${entry.method || 'GET'} ${entry.status || '?'} ${String(entry.url || '').slice(0, 80)}` });
    if (i > 0) edges.push({ from: `network:${i - 1}`, to: id, relation: 'before' });
  });
  const events = Array.isArray(eventOrdering) ? eventOrdering : [];
  events.forEach((event, i) => {
    const id = `event:${i}`;
    nodes.push({ id, kind: 'event', label: String(event).slice(0, 80) });
    if (i > 0) edges.push({ from: `event:${i - 1}`, to: id, relation: 'before' });
  });
  return { version: DEPENDENCY_GRAPH_VERSION, nodes, edges };
}

export function summarizeGraph(graph) {
  const units = graph.nodes.filter((n) => n.kind === 'unit').length;
  const containment = graph.edges.filter((e) => e.relation === 'contained-by').length;
  return {
    nodes: graph.nodes.length, edges: graph.edges.length, units, containment,
    networks: graph.nodes.filter((n) => n.kind === 'network').length,
    events: graph.nodes.filter((n) => n.kind === 'event').length,
  };
}
