// Generic causal collection reducer.
//
// This module reduces structured collections such as network fixtures,
// browser-state records, feature flags, repository manifests, and test-data
// entries. The caller owns the reset/replay/equivalence oracle. Faultline owns
// deterministic candidate scheduling, memoization, bounded concurrency, trial
// accounting, and the final 1-minimal fixpoint check.
//
// It intentionally does not claim that a repository/network/data integration
// exists merely because its collection can be minimized.

const fail = code => { throw new Error(code); };

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function defaultKey(item, index) {
  if (item && typeof item === 'object') {
    for (const candidate of ['id', 'key', 'path', 'url', 'name']) {
      if (typeof item[candidate] === 'string' && item[candidate]) return `${candidate}:${item[candidate]}`;
    }
  }
  return `${index}:${stableStringify(item)}`;
}

function normalizeVerdict(value) {
  if (typeof value === 'boolean') return { accept: value, reason: value ? 'ACCEPTED' : 'REJECTED' };
  if (!value || typeof value !== 'object' || typeof value.accept !== 'boolean') fail('FAULTLINE_COLLECTION_INVALID_VERDICT');
  return value;
}

function validateOptions(items, evaluate, options) {
  if (!Array.isArray(items)) fail('FAULTLINE_COLLECTION_ITEMS_REQUIRED');
  if (typeof evaluate !== 'function') fail('FAULTLINE_COLLECTION_EVALUATOR_REQUIRED');
  const maxTrials = options.maxTrials ?? 100;
  const concurrency = options.concurrency ?? 4;
  if (!Number.isSafeInteger(maxTrials) || maxTrials < 1 || maxTrials > 10000) fail('FAULTLINE_COLLECTION_INVALID_TRIAL_BUDGET');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) fail('FAULTLINE_COLLECTION_INVALID_CONCURRENCY');
  return { maxTrials, concurrency };
}

async function mapBounded(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await mapper(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

export async function reduceCollection(items, evaluate, {
  maxTrials = 100,
  concurrency = 4,
  cache = true,
  key = defaultKey,
  protectedKeys = [],
  signal
} = {}) {
  ({ maxTrials, concurrency } = validateOptions(items, evaluate, { maxTrials, concurrency }));
  if (typeof key !== 'function') fail('FAULTLINE_COLLECTION_KEY_REQUIRED');
  if (!Array.isArray(protectedKeys)) fail('FAULTLINE_COLLECTION_INVALID_PROTECTED_KEYS');

  const records = items.map((item, index) => ({
    item,
    index,
    key: String(key(item, index))
  }));
  if (new Set(records.map(record => record.key)).size !== records.length) fail('FAULTLINE_COLLECTION_DUPLICATE_KEY');

  const protectedSet = new Set(protectedKeys.map(String));
  const memo = new Map();
  let trialCount = 0;
  let cacheHits = 0;

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Faultline collection reduction aborted', 'AbortError');
  };

  const evaluateRecords = async candidateRecords => {
    throwIfAborted();
    const signature = candidateRecords.map(record => record.key).join('\u001f');
    if (cache && memo.has(signature)) {
      cacheHits++;
      return memo.get(signature);
    }
    if (trialCount >= maxTrials) fail('FAULTLINE_COLLECTION_TRIAL_BUDGET_EXHAUSTED');
    trialCount++;
    const verdict = normalizeVerdict(await evaluate(candidateRecords.map(record => record.item), {
      trial: trialCount,
      keys: candidateRecords.map(record => record.key),
      signal
    }));
    if (cache) memo.set(signature, verdict);
    return verdict;
  };

  let current = [...records];
  const baseline = await evaluateRecords(current);
  if (!baseline.accept) fail(`FAULTLINE_COLLECTION_BASELINE_REJECTED:${baseline.reason ?? 'REJECTED'}`);

  let granularity = 2;
  while (current.some(record => !protectedSet.has(record.key))) {
    throwIfAborted();
    const removable = current.filter(record => !protectedSet.has(record.key));
    if (!removable.length) break;

    const chunkSize = Math.ceil(removable.length / granularity);
    const chunks = [];
    for (let start = 0; start < removable.length; start += chunkSize) {
      const chunk = removable.slice(start, start + chunkSize);
      const removedKeys = new Set(chunk.map(record => record.key));
      chunks.push({
        index: chunks.length,
        candidate: current.filter(record => !removedKeys.has(record.key))
      });
    }

    const remainingBudget = maxTrials - trialCount;
    if (remainingBudget <= 0) fail('FAULTLINE_COLLECTION_TRIAL_BUDGET_EXHAUSTED');
    const batch = chunks.slice(0, remainingBudget);
    const verdicts = await mapBounded(batch, concurrency, async entry => ({
      ...entry,
      verdict: await evaluateRecords(entry.candidate)
    }));
    const accepted = verdicts.find(entry => entry.verdict.accept);

    if (accepted) {
      current = accepted.candidate;
      granularity = Math.max(2, granularity - 1);
      continue;
    }

    if (granularity >= removable.length) break;
    granularity = Math.min(removable.length, granularity * 2);
  }

  // Explicit single-item fixpoint verification. ddmin normally converges to
  // 1-minimality, but this pass makes the claim machine-checkable even when
  // custom protected keys and cached candidate schedules are involved.
  let changed = true;
  while (changed) {
    changed = false;
    const removable = current.filter(record => !protectedSet.has(record.key));
    for (const record of removable) {
      const candidate = current.filter(item => item.key !== record.key);
      const verdict = await evaluateRecords(candidate);
      if (verdict.accept) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }

  const surviving = new Set(current.map(record => record.key));
  const removed = records.filter(record => !surviving.has(record.key));

  return Object.freeze({
    schema: 'faultline.collection-reduction.v1',
    items: current.map(record => record.item),
    keys: current.map(record => record.key),
    removed: removed.map(record => record.item),
    removedKeys: removed.map(record => record.key),
    originalCount: records.length,
    reducedCount: current.length,
    reduction: records.length ? 1 - current.length / records.length : 0,
    trialCount,
    cacheHits,
    concurrency,
    protectedKeys: [...protectedSet],
    minimality: 'LOCALLY_MINIMAL'
  });
}

export function reduceNetworkFixtures(fixtures, evaluate, options = {}) {
  return reduceCollection(fixtures, evaluate, {
    ...options,
    key: options.key ?? ((fixture, index) => fixture?.id || `${String(fixture?.method || 'GET').toUpperCase()} ${fixture?.url || index} ${fixture?.requestBodySha256 || ''}`)
  });
}

export function reduceStateEntries(entries, evaluate, options = {}) {
  return reduceCollection(entries, evaluate, {
    ...options,
    key: options.key ?? ((entry, index) => entry?.id || `${entry?.scope || 'state'}:${entry?.key || index}`)
  });
}

export function reduceRepositoryManifest(entries, evaluate, options = {}) {
  return reduceCollection(entries, evaluate, {
    ...options,
    key: options.key ?? ((entry, index) => entry?.path || entry?.id || `entry:${index}`)
  });
}
