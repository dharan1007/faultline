// Causal fingerprint — SAME_CAUSE acceptance for reductions.
// A binary PASS/FAIL oracle is not enough: checkout failing from a payment
// race vs from broken JS syntax are both FAIL but different causes.
// Fingerprint uses only observable failure signals, normalized deterministically.
import { createHash } from 'node:crypto';

export const FINGERPRINT_VERSION = 'faultline.causal-fingerprint.v1';

// Strong dimensions: mismatch on any jointly-present strong dimension rejects.
const STRONG_DIMENSIONS = ['exceptionClass', 'stackSignature', 'assertionIdentity'];
// Supporting dimensions: count toward confidence.
const SUPPORTING_DIMENSIONS = [
  'networkSequence', 'domInvariant', 'requestResponse',
  'eventOrdering', 'consoleSignature', 'renderRegion',
  'statePredicate', 'timingRelation', 'sourceAncestry',
];
export const ALL_DIMENSIONS = [...STRONG_DIMENSIONS, ...SUPPORTING_DIMENSIONS];

const normalizeStack = (stack) => {
  if (!stack) return null;
  // Strip line/column numbers, addresses, timestamps; keep frames + function names.
  return String(stack)
    .split('\n')
    .map((l) => l.trim().replace(/:\d+:\d+/g, '').replace(/0x[0-9a-f]+/gi, '0x').replace(/\?\w+=\w+/g, ''))
    .filter(Boolean)
    .slice(0, 12)
    .join('\n');
};

const normalizeNetwork = (seq) => {
  if (!seq) return null;
  const list = Array.isArray(seq) ? seq : [seq];
  return list.map((r) => `${r.method || 'GET'} ${r.status || '?'} ${String(r.url || '').split('?')[0].slice(-120)}`).join('|');
};

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function buildFingerprint(signals = {}) {
  const dims = {};
  dims.exceptionClass = signals.exceptionClass ? String(signals.exceptionClass) : null;
  dims.stackSignature = signals.stack ? sha256(normalizeStack(signals.stack)).slice(0, 32) : null;
  dims.assertionIdentity = signals.assertionIdentity ? String(signals.assertionIdentity) : null;
  dims.networkSequence = signals.networkSequence ? sha256(normalizeNetwork(signals.networkSequence)) : null;
  dims.domInvariant = signals.domInvariant ? sha256(JSON.stringify(signals.domInvariant)) : null;
  dims.requestResponse = signals.requestResponse ? sha256(JSON.stringify(signals.requestResponse)) : null;
  dims.eventOrdering = signals.eventOrdering ? sha256(JSON.stringify(signals.eventOrdering)) : null;
  dims.consoleSignature = signals.consoleSignature ? sha256(String(signals.consoleSignature).slice(0, 2000)) : null;
  dims.renderRegion = signals.renderRegion ? sha256(JSON.stringify(signals.renderRegion)) : null;
  dims.statePredicate = signals.statePredicate ? sha256(JSON.stringify(signals.statePredicate)) : null;
  dims.timingRelation = signals.timingRelation ? String(signals.timingRelation) : null;
  dims.sourceAncestry = signals.sourceAncestry ? sha256(JSON.stringify(signals.sourceAncestry)) : null;
  const canonical = JSON.stringify({ version: FINGERPRINT_VERSION, dims });
  return { version: FINGERPRINT_VERSION, dimensions: dims, signature: sha256(canonical) };
}

// Provisional SAME_CAUSE rule: every jointly-present strong dimension must
// match, plus >=2 supporting matches. Returns { sameCause, reason, matched, confidence }.
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
      if (da[dim] === db[dim]) matched++;
    }
  }
  const strongPresent = STRONG_DIMENSIONS.filter((d) => da[d] && db[d]).length;
  const confidence = comparable ? matched / comparable : (strongPresent ? 0.5 : 0);
  if (strongPresent === 0 && matched < 2) {
    return { sameCause: false, reason: 'INSUFFICIENT_DIMENSIONS', matched, confidence };
  }
  if (matched < 2 && comparable >= 2) {
    return { sameCause: false, reason: 'WEAK_MATCH', matched, confidence };
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
