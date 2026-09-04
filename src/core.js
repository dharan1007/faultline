export function assertRevision(expected, current) {
  if (expected !== current) {
    const error = new Error(`STALE_REVISION expected=${expected} current=${current}`);
    error.code = 'STALE_REVISION';
    throw error;
  }
}

export async function ddmin(items, evaluate) {
  let current = [...items];
  const cache = new Map();
  const trials = [];

  async function run(candidate) {
    const key = JSON.stringify(candidate);
    if (cache.has(key)) return cache.get(key);
    const status = await evaluate(candidate);
    cache.set(key, status);
    trials.push({ candidate: [...candidate], status });
    return status;
  }

  if ((await run(current)) !== 'FAIL') {
    throw new Error('DDMIN_BASELINE_NOT_FAILING');
  }

  let granularity = 2;
  while (current.length >= 2) {
    const chunkSize = Math.ceil(current.length / granularity);
    const chunks = [];
    for (let i = 0; i < current.length; i += chunkSize) chunks.push(current.slice(i, i + chunkSize));
    let reduced = false;

    for (const chunk of chunks) {
      const complement = current.filter((item) => !chunk.includes(item));
      if ((await run(complement)) === 'FAIL') {
        current = complement;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }

    if (reduced) continue;
    if (granularity >= current.length) break;
    granularity = Math.min(current.length, granularity * 2);
  }

  for (let i = current.length - 1; i >= 0; i--) {
    const candidate = current.filter((_, idx) => idx !== i);
    if ((await run(candidate)) === 'FAIL') current = candidate;
  }

  return { items: current, trials, cacheSize: cache.size };
}

export function scoreSuspicion(experiments) {
  const ids = new Set(experiments.flatMap((e) => e.present || []));
  const failedTotal = experiments.filter((e) => e.status === 'FAIL').length || 1;
  const passedTotal = experiments.filter((e) => e.status === 'PASS').length || 1;

  const rows = [...ids].map((id) => {
    let failedPresent = 0;
    let passedPresent = 0;
    for (const exp of experiments) {
      if (!(exp.present || []).includes(id)) continue;
      if (exp.status === 'FAIL') failedPresent++;
      if (exp.status === 'PASS') passedPresent++;
    }
    const failRate = failedPresent / failedTotal;
    const passRate = passedPresent / passedTotal;
    const score = failRate / Math.sqrt(Math.max(Number.EPSILON, failRate + passRate));
    return { id, score, failedPresent, passedPresent };
  });

  return rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
