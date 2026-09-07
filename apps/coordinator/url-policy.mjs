import {createHash} from 'node:crypto';
import {lookup as dnsLookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';

export class CaptureTargetError extends Error{
  constructor(code,message,details={}){
    super(message||code);
    this.name='CaptureTargetError';
    this.code=code;
    this.details=details;
  }
}

const blocked=new BlockList();
for(const [network,prefix] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],
  ['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],
  ['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
])blocked.addSubnet(network,prefix,'ipv4');
for(const [network,prefix] of [
  ['::',128],['::1',128],['64:ff9b::',96],['100::',64],['2001::',23],['2001:2::',48],
  ['2001:db8::',32],['2002::',16],['fc00::',7],['fe80::',10],['ff00::',8]
])blocked.addSubnet(network,prefix,'ipv6');

const BLOCKED_HOSTS=new Set([
  'localhost','localhost.localdomain','metadata','metadata.google.internal','instance-data.ec2.internal','instance-data','metadata.azure.internal'
]);

function normalizeHostname(hostname){return String(hostname||'').trim().toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');}
function isBlockedHostname(hostname){
  const host=normalizeHostname(hostname);
  if(!host)return true;
  if(BLOCKED_HOSTS.has(host)||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.localdomain'))return true;
  if(!isIP(host)&&!host.includes('.'))return true;
  return false;
}
function isPublicAddress(address){
  const normalized=normalizeHostname(address);
  const family=isIP(normalized);
  if(!family)return false;
  // Node BlockList internally represents IPv4 as IPv4-mapped IPv6. Adding
  // ::ffff:0:0/96 to the shared list would therefore block every IPv4 host.
  // Reject explicit mapped IPv6 literals separately instead.
  if(family===6&&normalized.startsWith('::ffff:'))return false;
  return !blocked.check(normalized,family===6?'ipv6':'ipv4');
}
function normalizeAnswers(value){
  const source=Array.isArray(value)?value:[value];
  const answers=[];
  for(const item of source){
    const address=normalizeHostname(typeof item==='string'?item:item?.address);
    if(address&&!answers.includes(address))answers.push(address);
  }
  return answers;
}
function fingerprint(hostname,addresses){return createHash('sha256').update(`${hostname}\n${[...addresses].sort().join('\n')}`).digest('hex');}
async function withTimeout(promise,ms,code){
  let timer;
  try{
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new CaptureTargetError(code,code,{timeoutMs:ms})),ms);})
    ]);
  }finally{clearTimeout(timer);}
}

export async function defaultCaptureResolver(hostname){return dnsLookup(hostname,{all:true,verbatim:true});}

async function resolvePublic(hostname,resolver,phase){
  let raw;
  try{raw=await withTimeout(Promise.resolve(resolver(hostname)),1500,'DNS_RESOLUTION_TIMEOUT');}
  catch(error){if(error instanceof CaptureTargetError)throw error;throw new CaptureTargetError('DNS_RESOLUTION_FAILED','DNS_RESOLUTION_FAILED',{hostname,cause:error?.code||error?.message});}
  const addresses=normalizeAnswers(raw);
  if(!addresses.length)throw new CaptureTargetError('DNS_RESOLUTION_EMPTY','DNS_RESOLUTION_EMPTY',{hostname});
  const blockedAddress=addresses.find(address=>!isPublicAddress(address));
  if(blockedAddress){
    const code=phase==='recheck'?'DNS_REBINDING_BLOCKED':'PRIVATE_ADDRESS_BLOCKED';
    throw new CaptureTargetError(code,code,{hostname,address:blockedAddress});
  }
  return addresses;
}

export async function validateCaptureTarget(rawUrl,resolver=defaultCaptureResolver){
  if(typeof rawUrl!=='string'||!rawUrl.trim()||rawUrl.length>4096)throw new CaptureTargetError('CAPTURE_URL_INVALID','CAPTURE_URL_INVALID');
  let url;
  try{url=new URL(rawUrl);}catch{throw new CaptureTargetError('CAPTURE_URL_INVALID','CAPTURE_URL_INVALID');}
  if(url.protocol!=='http:'&&url.protocol!=='https:')throw new CaptureTargetError('CAPTURE_SCHEME_BLOCKED','CAPTURE_SCHEME_BLOCKED',{protocol:url.protocol});
  if(url.username||url.password)throw new CaptureTargetError('CAPTURE_URL_CREDENTIALS_BLOCKED','CAPTURE_URL_CREDENTIALS_BLOCKED');
  const hostname=normalizeHostname(url.hostname);
  if(isBlockedHostname(hostname))throw new CaptureTargetError('CAPTURE_HOST_BLOCKED','CAPTURE_HOST_BLOCKED',{hostname});

  let addresses;
  if(isIP(hostname)){
    if(!isPublicAddress(hostname))throw new CaptureTargetError('PRIVATE_ADDRESS_BLOCKED','PRIVATE_ADDRESS_BLOCKED',{hostname,address:hostname});
    addresses=[hostname];
  }else{
    const first=await resolvePublic(hostname,resolver,'initial');
    const second=await resolvePublic(hostname,resolver,'recheck');
    addresses=[...new Set([...first,...second])];
  }

  url.hostname=hostname;
  const normalized=url.href;
  return Object.freeze({
    url:normalized,
    origin:url.origin,
    protocol:url.protocol,
    hostname,
    port:url.port||String(url.protocol==='https:'?443:80),
    addresses:Object.freeze([...addresses]),
    resolutionFingerprint:fingerprint(hostname,addresses)
  });
}

export function isPublicCaptureAddress(address){return isPublicAddress(address);}
