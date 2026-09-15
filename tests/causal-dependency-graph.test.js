import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDependencyGraph, summarizeGraph, DEPENDENCY_GRAPH_VERSION } from '../src/causal-dependency-graph.js';

const oracle = { kind: 'dom_attribute', selector: '#save', property: 'aria-disabled', equals: 'true' };

test('missing oracle is rejected, not guessed', () => {
  assert.throws(() => buildDependencyGraph({}), /GRAPH_MISSING_ORACLE/);
});

test('units produce containment edges to parents and candidate links to oracle', () => {
  const graph = buildDependencyGraph({
    oracle,
    unitsByAxis: {
      html: [
        { id: 'html:0:50', kind: 'element', parentId: null, depth: 0 },
        { id: 'html:5:40', kind: 'element', parentId: 'html:0:50', depth: 1 },
      ],
      css: [{ id: 'css:0:20', kind: 'rule', parentId: null, depth: 0 }],
      js: [],
    },
  });
  assert.equal(graph.version, DEPENDENCY_GRAPH_VERSION);
  assert.ok(graph.nodes.some((n) => n.id === 'oracle'));
  assert.ok(graph.edges.some((e) => e.relation === 'contained-by' && e.from === 'unit:html:html:5:40'));
  assert.ok(graph.edges.some((e) => e.relation === 'candidate' && e.to === 'oracle'));
  const summary = summarizeGraph(graph);
  assert.equal(summary.units, 3);
  assert.equal(summary.containment, 1);
});

test('event and network order is preserved as before-chains', () => {
  const graph = buildDependencyGraph({
    oracle,
    networkSequence: [{ method: 'POST', status: 200, url: 'https://pay.test/charge' }, { method: 'GET', status: 200, url: 'https://pay.test/status' }],
    eventOrdering: ['click', 'charge'],
  });
  assert.ok(graph.edges.some((e) => e.from === 'network:0' && e.to === 'network:1' && e.relation === 'before'));
  assert.ok(graph.edges.some((e) => e.from === 'event:0' && e.to === 'event:1' && e.relation === 'before'));
  const summary = summarizeGraph(graph);
  assert.equal(summary.networks, 2);
  assert.equal(summary.events, 2);
});
