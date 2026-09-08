export class CaptureLimitError extends Error{
  constructor(limit,observed,maximum){
    super(`CAPTURE_LIMIT_REACHED ${limit} observed=${observed} maximum=${maximum}`);
    this.name='CaptureLimitError';
    this.code='CAPTURE_LIMIT_REACHED';
    this.limit=limit;
    this.observed=observed;
    this.maximum=maximum;
  }
}

export class CaptureLimitConfigurationError extends Error{
  constructor(limit,value,maximum){
    super(`CAPTURE_LIMIT_CONFIGURATION_INVALID ${limit} value=${value} maximum=${maximum}`);
    this.name='CaptureLimitConfigurationError';
    this.code='CAPTURE_LIMIT_CONFIGURATION_INVALID';
    this.limit=limit;
    this.value=value;
    this.maximum=maximum;
  }
}

export const CAPTURE_LIMIT_CEILINGS=Object.freeze({
  maxDurationMs:15000,
  navigationTimeoutMs:8000,
  settleMs:750,
  maxEvents:500,
  maxScreenshotBytes:5_000_000,
  maxResourceEntries:250,
  maxTextSampleChars:4096
});

export const DEFAULT_CAPTURE_LIMITS=Object.freeze({
  maxDurationMs:12000,
  navigationTimeoutMs:6000,
  settleMs:300,
  maxEvents:350,
  maxScreenshotBytes:3_000_000,
  maxResourceEntries:160,
  maxTextSampleChars:2048
});

export function mergeCaptureLimits(overrides={}){
  if(overrides===null||typeof overrides!=='object'||Array.isArray(overrides))throw new CaptureLimitConfigurationError('limits',overrides,'object');
  const unknown=Object.keys(overrides).filter(key=>!(key in CAPTURE_LIMIT_CEILINGS));
  if(unknown.length)throw new CaptureLimitConfigurationError(unknown[0],overrides[unknown[0]],'unsupported');
  const result={...DEFAULT_CAPTURE_LIMITS};
  for(const [key,value] of Object.entries(overrides)){
    const ceiling=CAPTURE_LIMIT_CEILINGS[key];
    if(!Number.isInteger(value)||value<1||value>ceiling)throw new CaptureLimitConfigurationError(key,value,ceiling);
    result[key]=value;
  }
  if(result.navigationTimeoutMs>result.maxDurationMs)result.navigationTimeoutMs=result.maxDurationMs;
  if(result.settleMs>result.maxDurationMs)result.settleMs=result.maxDurationMs;
  return Object.freeze(result);
}

export function assertCaptureLimit(limit,observed,maximum){
  if(Number(observed)>Number(maximum))throw new CaptureLimitError(limit,observed,maximum);
  return observed;
}
