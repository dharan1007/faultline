// Reduction dimensions — where FAULTLINE is allowed to remove units.
// HTML/CSS/JS structural reduction exists; repo/network/data levels are
// planned frontiers with explicit minimality boundaries. No global-minimum
// claims: each axis documents the exact candidate set tested.
export const REDUCTION_DIMENSIONS = Object.freeze([
  { level: 'repository', units: ['directories', 'modules', 'imports', 'assets', 'routes', 'components', 'testSetup', 'fixtures', 'testSteps', 'backendHandlers', 'featureFlags'], status: 'PLANNED', minimality: '1-minimal over listed unit kinds within trial budget' },
  { level: 'javascript', units: ['astDeclarations', 'branches', 'expressionsWhereSafe', 'objectFields', 'functionParameters', 'imports', 'classMembers', 'jsxSubtrees', 'reactBranches', 'stateReducers'], status: 'PARTIAL', minimality: 'statement/class-member frontiers via pinned Acorn; expression rewriting only where semantics proven safe' },
  { level: 'network', units: ['requests', 'responses', 'headers', 'payloadFields', 'timing', 'thirdPartyEndpoints'], status: 'PLANNED', minimality: '1-minimal over recorded request/response units while replaying causal behavior' },
  { level: 'data', units: ['dbRecords', 'localStorage', 'sessionStorage', 'cookies', 'reduxSnapshots', 'apiFixtures', 'featureFlags', 'permissions'], status: 'PLANNED', minimality: '1-minimal over seeded state units with deterministic replay' },
  { level: 'dom', units: ['balancedElementSubtrees', 'voidElements'], status: 'SHIPPED', minimality: '1-minimal over balanced-subtree frontier within budget' },
  { level: 'css', units: ['rules', 'declarations'], status: 'SHIPPED', minimality: '1-minimal over rule/declaration hierarchy within budget' },
  { level: 'js-lexical-fallback', units: ['lexicalStatements'], status: 'SHIPPED', minimality: 'flat ddmin fallback for intentionally invalid syntax; NOT AST-level minimality' },
]);

export function planReduction(scope = {}) {
  // scope: { levels?: string[] } — default order: repository → network → data → dom → css → javascript
  const order = ['repository', 'network', 'data', 'dom', 'css', 'javascript', 'js-lexical-fallback'];
  const wanted = scope.levels ? new Set(scope.levels) : null;
  return REDUCTION_DIMENSIONS.filter((d) => order.includes(d.level) && (!wanted || wanted.has(d.level)))
    .sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
}

export const MINIMALITY_DISCLAIMER =
  'FAULTLINE claims bounded 1-minimality over the tested semantic frontier and trial budget only — never a globally shortest program.';

// Final minimality verdict vocabulary (area: minimality verification).
// LOCALLY_MINIMAL: ddmin ran to fixpoint — no single remaining unit in the
//   supported local domain could be removed without losing SAME_CAUSE FAIL.
// BUDGET_LIMITED: trial budget exhausted before fixpoint; the engine throws
//   TRIAL_BUDGET_EXHAUSTED and commits nothing — a budget-limited result is
//   never reported as minimal.
// TIME_LIMITED / ORACLE_LIMITED / UNRESOLVED: reserved for the reduction
//   scheduler (time-boxed runs, oracle-scope limits, inconclusive runs).
export const MINIMALITY_STATUSES = Object.freeze([
  'LOCALLY_MINIMAL', 'BUDGET_LIMITED', 'TIME_LIMITED', 'ORACLE_LIMITED', 'UNRESOLVED',
]);

export function describeMinimality(status) {
  const meanings = {
    LOCALLY_MINIMAL: 'fixpoint reached: every remaining unit in the declared domain was tested and required for SAME_CAUSE FAIL',
    BUDGET_LIMITED: 'trial budget exhausted before fixpoint; nothing committed; never reported as minimal',
    TIME_LIMITED: 'wall-clock budget exhausted before fixpoint (scheduler runs)',
    ORACLE_LIMITED: 'oracle scope bounds what can be removed (e.g. pinned/protected units cover the domain)',
    UNRESOLVED: 'minimality could not be determined',
  };
  if (!meanings[status]) throw new Error(`UNKNOWN_MINIMALITY_STATUS:${status}`);
  return { status, meaning: meanings[status] };
}
