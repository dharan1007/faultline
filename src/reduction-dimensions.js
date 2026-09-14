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
