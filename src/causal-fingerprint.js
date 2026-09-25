// Causal fingerprint — SAME_CAUSE acceptance for reductions.
// Browser + Node safe: no imports, no Node APIs. Imported by src/runtime.js
// (served to browsers verbatim) and by Node tests/CLI alike.
// A binary PASS/FAIL oracle is not enough: checkout failing from a payment
// race vs from broken JS syntax are both FAIL but different causes.
// Fingerprint uses only observable failure signals, normalized deterministically.

export const FINGERPRINT_VERSION = 'faultline.causal-fingerprint.v1';

// Strong dimensions: mismatch on any jointly-present strong dimension rejects.
const STRONG_DIMENSIONS = ['oracleIdentity', 'exceptionClass', 'stackSignature', 'assertionIdentity'];
// Supporting dimensions are cause-bearing evidence. Any jointly observed mismatch rejects equivalence; matching dimensions also contribute to confidence.
const SUPPORTING_DIMENSIONS = [
  'networkSequence', 'domInvariant', 'requestResponse',
  'eventOrdering', 'consoleSignature', 'renderRegion',
  'statePredicate', 'timingRelation', 'sourceAncestry',
];
export const ALL_DIMENSIONS = [...STRONG_DIMENSIONS, ...SUPPORTING_DIMENSIONS];

// cyrb53 — small deterministic non-cryptographic hash. Fingerprints are
// equality comparators, not security boundaries; evidence immutability
// hashing (sha256sums) stays in Node release tooling.
export function hashString(str) {
  const s = String(str);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function normalizeStack(stack) {
  if (!stack) return null;
  // Strip line/column numbers, addresses, timestamps; keep frames + function names.
  return String(stack)
    .split('\n')
    .map((l) => l.trim().replace(/:\d+:\d+/g, '').replace(/0x[0-9a-f]+/gi, '0x').replace(/\?\w+=\w+/g, ''))
    .filter(Boolean)
    .slice(0, 12)
    .join('\n');
}

export function normalizeNetwork(seq) {
  if (!seq) return null;
  const list = Array.isArray(seq) ? seq : [seq];
  return list.map((r) => `${r.method || 'GET'} ${r.status || '?'} ${String(r.url || '').split('?')[0].slice(-120)}`).join('|');
}

const shortHash = (value) => (value === null || value === undefined ? null : hashString(typeof value === 'string' ? value : stableStringify(value)));

export function buildFingerprint(signals = {}) {
  const dims = {};
  const oracle = signals.oracle && typeof signals.oracle === 'object' ? signals.oracle : null;
  const oracleIdentity=oracle?Object.fromEntries(Object.entries(oracle).filter(([key])=>!['action','delayMs'].includes(key))):null;
  dims.oracleIdentity = oracleIdentity
    ? hashString(stableStringify(oracleIdentity))
    : (signals.oracleIdentity ? String(signals.oracleIdentity) : null);
  dims.exceptionClass = signals.exceptionClass ? String(signals.exceptionClass) : null;
  dims.stackSignature = signals.stack ? hashString(normalizeStack(signals.stack)) : null;
  dims.assertionIdentity = signals.assertionIdentity
    ? String(signals.assertionIdentity)
    : (oracle && oracle.kind !== 'runtime_error' && (oracle.selector || oracle.property)
      ? `${oracle.kind}:${oracle.selector || ''}:${oracle.property || ''}` : null);
  dims.networkSequence = signals.networkSequence ? hashString(normalizeNetwork(signals.networkSequence)) : null;
  dims.domInvariant = signals.domInvariant ? hashString(stableStringify(signals.domInvariant)) : null;
  dims.requestResponse = signals.requestResponse ? hashString(stableStringify(signals.requestResponse)) : null;
  dims.eventOrdering = signals.eventOrdering ? hashString(stableStringify(signals.eventOrdering)) : null;
  dims.consoleSignature = signals.consoleSignature ? hashString(String(signals.consoleSignature).slice(0, 2000)) : null;
  dims.renderRegion = signals.renderRegion ? hashString(stableStringify(signals.renderRegion)) : null;
  dims.statePredicate = signals.statePredicate ? hashString(stableStringify(signals.statePredicate)) : null;
  dims.timingRelation = signals.timingRelation ? String(signals.timingRelation) : null;
  dims.sourceAncestry = signals.sourceAncestry ? hashString(stableStringify(signals.sourceAncestry)) : null;
  const canonical = stableStringify({ version: FINGERPRINT_VERSION, dims });
  return { version: FINGERPRINT_VERSION, dimensions: dims, signature: hashString(canonical) };
}

// Map a runtime result ({evidence, oracle}) to fingerprint signals.
// Shared by the browser runtime and Node callers so both sides agree.
export function signalsFromOracleEvidence(evidence = {}, oracle = null) {
  const ev = evidence && typeof evidence === 'object' ? evidence : {};
  const hasActual = Object.hasOwn ? Object.hasOwn(ev, 'actual') : ev.actual !== undefined;
  return {
    oracle,
    exceptionClass: ev.errorName ?? null,
    stack: ev.errorStack ?? null,
    assertionIdentity: ev.assertionId ?? null,
    networkSequence: ev.networkSequence ?? null,
    domInvariant: hasActual ? { actual: ev.actual ?? null, expected: ev.expected ?? null, selector: ev.selector ?? oracle?.selector ?? null } : null,
    requestResponse: ev.requestResponse ?? null,
    eventOrdering: ev.eventOrdering ?? null,
    consoleSignature: ev.console ?? null,
    renderRegion: ev.renderRegion ?? null,
    statePredicate: ev.statePredicate ?? null,
    timingRelation: ev.timingRelation ?? null,
    sourceAncestry: ev.sourceAncestry ?? null,
  };
}

// Provisional SAME_CAUSE rule: every jointly-present strong dimension must
// match, plus >=2 supporting matches when enough dimensions are comparable.
// Returns { sameCause, reason, matched, confidence }.
export function compareFingerprints(a, b) {
  const da = a?.dimensions || {};
  const db = b?.dimensions || {};
  for (const dim of STRONG_DIMENSIONS) {
    if (da[dim] && db[dim] && da[dim] !== db[dim]) {
      return { sameCause: false, reason: `STRONG_MISMATCH:${dim}`, matched: 0, confidence: 0 };
    }
  }
  let matched = 0, comparable = 0;
  for (const dim of SUPPORTING_DIMENSIONS) {
    if (da[dim] && db[dim]) {
      comparable++;
      if (da[dim] !== db[dim]) {
        return { sameCause: false, reason: `SUPPORTING_MISMATCH:${dim}`, matched, confidence: comparable ? matched / comparable : 0 };
      }
      matched++;
    }
  }
  const strongPresent = STRONG_DIMENSIONS.filter((d) => da[d] && db[d]).length;
  const confidence = comparable ? matched / comparable : (strongPresent ? 0.5 : 0);
  if (strongPresent === 0 && matched < 2) {
    return { sameCause: false, reason: 'INSUFFICIENT_DIMENSIONS', matched, confidence };
  }
  return { sameCause: true, reason: 'SAME_CAUSE', matched, confidence };
}

export function verdictForReduction(baseline, candidate) {
  // baseline/candidate: { status, fingerprint }. Only FAIL+FAIL with
  // SAME_CAUSE may accept a removal. Anything else rejects.
  if (baseline?.status !== 'FAIL' || candidate?.status !== 'FAIL') {
    return { accept: false, reason: baseline?.status !== 'FAIL' ? 'BASELINE_NOT_FAILING' : 'CANDIDATE_NOT_FAILING' };
  }
  if (!baseline.fingerprint || !candidate.fingerprint) {
    return { accept: false, reason: 'MISSING_FINGERPRINT' };
  }
  const cmp = compareFingerprints(baseline.fingerprint, candidate.fingerprint);
  return cmp.sameCause
    ? { accept: true, reason: 'SAME_CAUSE', ...cmp }
    : { accept: false, reason: cmp.reason, ...cmp };
}
