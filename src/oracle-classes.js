// Explicit oracle classes — one schema per failure kind.
// Binary PASS/FAIL/UNRESOLVED preserved; causal signals feed the fingerprint.
export const ORACLE_CLASSES = Object.freeze([
  'assertion_failure',
  'uncaught_exception',
  'console_event',
  'network_status',
  'network_body',
  'network_sequence',
  'dom_state',
  'navigation_failure',
  'rendering_region',
  'race_timing',
  'performance_threshold',
  'custom_probe',
  'flaky_statistical',
]);

const base = { status: ['PASS', 'FAIL', 'UNRESOLVED'] };

export const ORACLE_SCHEMAS = Object.freeze({
  assertion_failure: { ...base, required: ['assertionId', 'expected', 'actual'] },
  uncaught_exception: { ...base, required: ['exceptionClass'] },
  console_event: { ...base, required: ['pattern'] },
  network_status: { ...base, required: ['url', 'status'] },
  network_body: { ...base, required: ['url', 'bodyPattern'] },
  network_sequence: { ...base, required: ['sequence'] },
  dom_state: { ...base, required: ['selector', 'predicate'] },
  navigation_failure: { ...base, required: ['url', 'error'] },
  rendering_region: { ...base, required: ['region', 'predicate'] },
  race_timing: { ...base, required: ['relation'] },
  performance_threshold: { ...base, required: ['metric', 'budgetMs'] },
  custom_probe: { ...base, required: ['probeId', 'expected'] },
  flaky_statistical: { ...base, required: ['trials', 'minFailRate'] },
});

export function validateOracleClass(oracle) {
  if (!oracle || typeof oracle !== 'object') throw new Error('INVALID_ORACLE');
  if (!ORACLE_CLASSES.includes(oracle.class)) throw new Error(`UNKNOWN_ORACLE_CLASS:${oracle.class}`);
  const schema = ORACLE_SCHEMAS[oracle.class];
  for (const key of schema.required) {
    if (oracle[key] === undefined) throw new Error(`ORACLE_MISSING_FIELD:${key}`);
  }
  return true;
}

export function describeOracleClass(cls) {
  if (!ORACLE_SCHEMAS[cls]) throw new Error(`UNKNOWN_ORACLE_CLASS:${cls}`);
  return { class: cls, ...ORACLE_SCHEMAS[cls] };
}

// Per-class engineering contract: identity, normalization, signals,
// repeat/timeout and equivalence policy. Data-only: the browser runtime
// maps its 5 executable oracle kinds onto these classes (see
// RUNTIME_ORACLE_CLASS), while the remaining classes describe supported
// extension points with explicit REQUIRED status gaps.
export const ORACLE_CLASS_METADATA = Object.freeze({
  assertion_failure: { id: 'oracle.assertion_failure', failureType: 'assertion', signature: 'assertionId + normalized operands', normalization: 'operand JSON with key order canonicalized; floats compared with Object.is', allowedNondeterminism: [], requiredSignals: ['assertionId', 'actual', 'expected'], fingerprintInputs: ['assertionIdentity', 'domInvariant'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'assertionIdentity must match; operands must match after normalization' },
  uncaught_exception: { id: 'oracle.uncaught_exception', failureType: 'exception', signature: 'exceptionClass + normalized stack (12 frames, lines stripped)', normalization: 'strip line/column numbers, addresses, query strings', allowedNondeterminism: ['error message text beyond class'], requiredSignals: ['errorName', 'errorStack'], fingerprintInputs: ['exceptionClass', 'stackSignature'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'exceptionClass and stackSignature must match' },
  console_event: { id: 'oracle.console_event', failureType: 'console', signature: 'pattern + normalized console text', normalization: 'truncate to 2000 chars; strip timestamps', allowedNondeterminism: ['timestamps', 'object identity hashes'], requiredSignals: ['console'], fingerprintInputs: ['consoleSignature'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'consoleSignature must match' },
  network_status: { id: 'oracle.network_status', failureType: 'network', signature: 'method + status + path (query stripped)', normalization: 'strip query strings; keep method/status/path', allowedNondeterminism: ['timing', 'response bodies'], requiredSignals: ['networkSequence'], fingerprintInputs: ['networkSequence'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'networkSequence must match' },
  network_body: { id: 'oracle.network_body', failureType: 'network', signature: 'url + body pattern', normalization: 'pattern match on canonicalized body', allowedNondeterminism: ['timing', 'unrelated fields'], requiredSignals: ['requestResponse'], fingerprintInputs: ['requestResponse'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'requestResponse must match' },
  network_sequence: { id: 'oracle.network_sequence', failureType: 'network', signature: 'ordered request sequence', normalization: 'method/status/path per entry, in order', allowedNondeterminism: ['timing deltas'], requiredSignals: ['networkSequence'], fingerprintInputs: ['networkSequence'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'full sequence must match in order' },
  dom_state: { id: 'oracle.dom_state', failureType: 'dom', signature: 'selector + predicate + normalized value', normalization: 'attribute/property values compared with Object.is after read', allowedNondeterminism: [], requiredSignals: ['actual', 'expected', 'selector'], fingerprintInputs: ['oracleIdentity', 'domInvariant'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'oracleIdentity and domInvariant must match' },
  navigation_failure: { id: 'oracle.navigation_failure', failureType: 'navigation', signature: 'url + navigation error', normalization: 'error code canonicalized', allowedNondeterminism: [], requiredSignals: ['url', 'error'], fingerprintInputs: ['oracleIdentity'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'error identity must match' },
  rendering_region: { id: 'oracle.rendering_region', failureType: 'visual', signature: 'region + predicate', normalization: 'region box snapped to device pixels', allowedNondeterminism: ['subpixel anti-aliasing'], requiredSignals: ['renderRegion'], fingerprintInputs: ['renderRegion'], repeatPolicy: 'single-run sufficient when deterministic; else flaky_statistical', timeoutMs: 5000, equivalencePolicy: 'renderRegion must match' },
  race_timing: { id: 'oracle.race_timing', failureType: 'timing', signature: 'event ordering + timing relation', normalization: 'event names in order; durations bucketed', allowedNondeterminism: ['absolute durations'], requiredSignals: ['eventOrdering', 'timingRelation'], fingerprintInputs: ['eventOrdering', 'timingRelation'], repeatPolicy: 'flaky_statistical required (default 15/20)', timeoutMs: 5000, equivalencePolicy: 'ordering must match; relation within policy' },
  performance_threshold: { id: 'oracle.performance_threshold', failureType: 'performance', signature: 'metric + budget', normalization: 'metric rounded to policy bucket', allowedNondeterminism: ['machine noise within bucket'], requiredSignals: ['metric'], fingerprintInputs: ['statePredicate'], repeatPolicy: 'flaky_statistical required (default 15/20)', timeoutMs: 30000, equivalencePolicy: 'budget verdict must agree across repeats' },
  custom_probe: { id: 'oracle.custom_probe', failureType: 'custom', signature: 'probeId + expected value', normalization: 'defined by probe author; must be documented', allowedNondeterminism: ['probe-declared only'], requiredSignals: ['probeId'], fingerprintInputs: ['statePredicate'], repeatPolicy: 'probe-declared; defaults to single-run', timeoutMs: 5000, equivalencePolicy: 'probe-declared; must be documented' },
  flaky_statistical: { id: 'oracle.flaky_statistical', failureType: 'statistical', signature: 'fail rate over N trials + fingerprint confidence', normalization: 'Wilson lower bound for fail rate', allowedNondeterminism: ['per-run outcomes'], requiredSignals: ['trials', 'minFailRate'], fingerprintInputs: ['all matched dimensions'], repeatPolicy: 'baseline fail >= 15/20; candidate fail >= threshold with fingerprint confidence >= threshold', timeoutMs: 60000, equivalencePolicy: 'rate thresholds plus fingerprint equivalence' },
});

// Executable mapping: the 5 browser runtime oracle kinds implement these classes.
export const RUNTIME_ORACLE_CLASS = Object.freeze({
  dom_property: 'dom_state',
  dom_attribute: 'dom_state',
  dom_exists: 'dom_state',
  computed_style: 'dom_state',
  runtime_error: 'uncaught_exception',
});

export function describeOracleClassFull(cls) {
  const base = describeOracleClass(cls);
  return { ...base, ...(ORACLE_CLASS_METADATA[cls] || {}) };
}
