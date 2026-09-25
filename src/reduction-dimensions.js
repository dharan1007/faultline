// Reduction dimensions and their evidence boundary.
//
// SHIPPED means an end-to-end canonical production path exists.
// PARTIAL means a reusable reducer/adapter exists but automatic end-to-end
// extraction/replay for arbitrary applications is not yet proven.
// No dimension may be promoted solely because a generic reducer can represent
// its units.

export const REDUCTION_DIMENSIONS = Object.freeze([
  {
    level: 'repository',
    units: ['directories', 'modules', 'imports', 'assets', 'routes', 'components', 'testSetup', 'fixtures', 'testSteps', 'backendHandlers', 'featureFlags'],
    status: 'PARTIAL',
    evidence: 'collection-reducer can minimize a caller-supplied repository manifest under a caller-owned causal evaluator; automatic repository rewriting and build-graph reconstruction remain unqualified',
    minimality: '1-minimal over the supplied manifest frontier within trial budget'
  },
  {
    level: 'javascript',
    units: ['astDeclarations', 'branches', 'expressionsWhereSafe', 'objectFields', 'functionParameters', 'imports', 'classMembers', 'jsxSubtrees', 'reactBranches', 'stateReducers'],
    status: 'PARTIAL',
    evidence: 'canonical runtime ships parser-backed statement/class-member reduction plus conservative lexical fallback; expression/JSX/framework transformations are not generally shipped',
    minimality: 'statement/class-member frontiers via pinned Acorn; expression rewriting only where semantics are proven safe'
  },
  {
    level: 'network',
    units: ['requests', 'responses', 'headers', 'payloadFields', 'timing', 'thirdPartyEndpoints'],
    status: 'PARTIAL',
    evidence: 'collection-reducer ships deterministic fixture-set minimization; arbitrary application traffic capture/replay requires the Playwright environment adapter and explicit caller authorization',
    minimality: '1-minimal over supplied replayable network-fixture units'
  },
  {
    level: 'data',
    units: ['dbRecords', 'localStorage', 'sessionStorage', 'cookies', 'reduxSnapshots', 'apiFixtures', 'featureFlags', 'permissions'],
    status: 'PARTIAL',
    evidence: 'collection-reducer ships deterministic state-entry minimization; database/framework-specific extraction remains adapter-scoped',
    minimality: '1-minimal over supplied replayable state units'
  },
  {
    level: 'dom',
    units: ['balancedElementSubtrees', 'voidElements'],
    status: 'SHIPPED',
    evidence: 'canonical browser runtime performs SAME_CAUSE hierarchical reduction with pin/ancestor protection',
    minimality: '1-minimal over balanced-subtree frontier within budget'
  },
  {
    level: 'css',
    units: ['rules', 'declarations'],
    status: 'SHIPPED',
    evidence: 'canonical browser runtime performs SAME_CAUSE rule/declaration reduction',
    minimality: '1-minimal over rule/declaration hierarchy within budget'
  },
  {
    level: 'js-lexical-fallback',
    units: ['lexicalStatements'],
    status: 'SHIPPED',
    evidence: 'canonical runtime retains a conservative fallback for intentionally invalid JavaScript',
    minimality: 'flat ddmin fallback for intentionally invalid syntax; NOT AST-level minimality'
  }
]);

export function planReduction(scope = {}) {
  const order = ['repository', 'network', 'data', 'dom', 'css', 'javascript', 'js-lexical-fallback'];
  const wanted = scope.levels ? new Set(scope.levels) : null;
  return REDUCTION_DIMENSIONS
    .filter(dimension => order.includes(dimension.level) && (!wanted || wanted.has(dimension.level)))
    .sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
}

export const MINIMALITY_DISCLAIMER =
  'FAULTLINE claims bounded 1-minimality over the tested semantic frontier and trial budget only — never a globally shortest program.';

export const MINIMALITY_STATUSES = Object.freeze([
  'LOCALLY_MINIMAL',
  'BUDGET_LIMITED',
  'TIME_LIMITED',
  'ORACLE_LIMITED',
  'UNRESOLVED'
]);

export function describeMinimality(status) {
  const meanings = {
    LOCALLY_MINIMAL: 'fixpoint reached: every remaining unit in the declared domain was tested and required for SAME_CAUSE FAIL',
    BUDGET_LIMITED: 'trial budget exhausted before fixpoint; nothing committed; never reported as minimal',
    TIME_LIMITED: 'wall-clock budget exhausted before fixpoint',
    ORACLE_LIMITED: 'oracle or protected-unit scope limits the candidate frontier',
    UNRESOLVED: 'minimality could not be determined'
  };
  if (!meanings[status]) throw new Error(`UNKNOWN_MINIMALITY_STATUS:${status}`);
  return { status, meaning: meanings[status] };
}
