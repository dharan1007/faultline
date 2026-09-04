import { createHash, timingSafeEqual } from 'node:crypto';

export function capabilityId(token){
  if(typeof token!=='string'||token.length<16) throw new Error('INVALID_CAPABILITY_TOKEN');
  return createHash('sha256').update(token,'utf8').digest('hex');
}

export function verifyCapability(headers,requestedId){
  try{
    const value=headers instanceof Headers?headers.get('authorization'):new Headers(headers||{}).get('authorization');
    const match=/^Bearer\s+(.+)$/i.exec(String(value||''));
    if(!match) throw new Error('UNAUTHORIZED_CAPABILITY');
    const actual=capabilityId(match[1].trim());
    const expected=String(requestedId||'');
    if(!/^[a-f0-9]{64}$/.test(expected)) throw new Error('UNAUTHORIZED_CAPABILITY');
    if(!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'))) throw new Error('UNAUTHORIZED_CAPABILITY');
    return true;
  }catch(error){
    if(error?.message==='UNAUTHORIZED_CAPABILITY') throw error;
    throw new Error('UNAUTHORIZED_CAPABILITY');
  }
}
