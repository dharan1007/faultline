const clone = value => JSON.parse(JSON.stringify(value));

export const INVESTIGATION_STAGES = ['reproduce','observe','isolate','verify','handoff'];
export const RUN_STATES = ['queued','provisioning','cloning','installing','building','launching','reproducing','investigating','verifying'];
export const TERMINAL_RUN_STATES = ['completed','cancelled','source_access_failed','install_failed','build_failed','launch_failed','route_unreachable','not_reproduced','oracle_ambiguous','experiment_timeout','sandbox_failed','browser_failed'];

const SAFE_SOURCE_PROTOCOLS = new Set(['https:','http:']);
const SECRET_KEYS = new Set(['token','password','secret','credentials','authorization','apiKey','api_key']);

function now(){ return new Date().toISOString(); }
function id(prefix){ return `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`; }

function sanitizeObject(input){
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [key,value] of Object.entries(input)) {
    if (SECRET_KEYS.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = sanitizeObject(value);
    else out[key] = clone(value);
  }
  return out;
}

export function normalizeSource(source={}){
  const kind = source.kind;
  if (!['git','url','minimal'].includes(kind)) throw new Error('INVALID_SOURCE_KIND');
  if (kind === 'minimal') return { kind:'minimal' };
  let parsed;
  try { parsed = new URL(String(source.url || '')); } catch { throw new Error('INVALID_SOURCE_URL'); }
  if (!SAFE_SOURCE_PROTOCOLS.has(parsed.protocol)) throw new Error('INVALID_SOURCE_URL');
  return {
    kind,
    url: parsed.toString(),
    ...(source.revision ? { revision:String(source.revision) } : {}),
    ...(source.branch ? { branch:String(source.branch) } : {})
  };
}

export function projectCompatibility(project={}){
  const source = project.source || {};
  if (source.kind === 'url' || source.kind === 'minimal') return { status:'ready', reasons:[] };
  const detected = project.detected || {};
  if (detected.framework === 'unsupported') return { status:'unsupported', reasons:['framework_unsupported'] };
  const commands = detected.commands || {};
  if (!Array.isArray(commands.start) || commands.start.length < 1) return { status:'configuration_required', reasons:['start_command_missing'] };
  return { status:'ready', reasons:[] };
}

export function createProject(input={}){
  const createdAt = input.createdAt || now();
  const source = normalizeSource(input.source || {});
  const detected = sanitizeObject(input.detected || {});
  const compatibility = projectCompatibility({source,detected});
  return {
    id: String(input.id || id('proj')),
    name: String(input.name || 'Untitled project').trim() || 'Untitled project',
    source,
    detected,
    compatibility: compatibility.status,
    compatibilityReasons: compatibility.reasons,
    createdAt,
    updatedAt: input.updatedAt || createdAt
  };
}

export function createInvestigation(projectId,input={}){
  if (!projectId) throw new Error('PROJECT_ID_REQUIRED');
  const createdAt = input.createdAt || now();
  const reportInput = sanitizeObject(input.report || {});
  return {
    id: String(input.id || id('inv')),
    projectId: String(projectId),
    title: String(input.title || reportInput.description || 'Untitled investigation').trim() || 'Untitled investigation',
    stage: 'reproduce',
    status: String(input.status || 'draft'),
    report: {
      description: String(reportInput.description || ''),
      route: String(reportInput.route || ''),
      expected: String(reportInput.expected || ''),
      observed: String(reportInput.observed || '')
    },
    oracle: input.oracle ? sanitizeObject(input.oracle) : null,
    activeRunId: null,
    evidenceIds: [],
    sourceRevision: String(input.sourceRevision || 'r1'),
    createdAt,
    updatedAt: createdAt
  };
}

export function transitionInvestigation(investigation,nextStage,status){
  const currentIndex = INVESTIGATION_STAGES.indexOf(investigation?.stage);
  const nextIndex = INVESTIGATION_STAGES.indexOf(nextStage);
  if (currentIndex < 0 || nextIndex < 0 || nextIndex < currentIndex || nextIndex > currentIndex + 1) throw new Error('INVALID_STAGE_TRANSITION');
  return {
    ...clone(investigation),
    stage: nextStage,
    status: String(status || investigation.status),
    updatedAt: now()
  };
}

export function sanitizePlatformValue(value){ return sanitizeObject(value); }
