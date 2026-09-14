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
