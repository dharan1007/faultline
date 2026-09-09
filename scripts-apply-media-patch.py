from pathlib import Path

policy=Path('src/sandbox-policy.js')
text=policy.read_text()
helper=r'''
function isBlockedMediaSource(source){
  const src=String(source??'').trim();
  return Boolean(src)&&!/^(?:data|blob):/i.test(src);
}

function containsExternalMedia(source){
  const html=String(source??'');
  if(typeof DOMParser==='function'){
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const media of doc.querySelectorAll('video[src],audio[src],video source[src],audio source[src]')){
      if(isBlockedMediaSource(media.getAttribute('src')))return true;
    }
    return false;
  }
  const withoutComments=html.replace(/<!--[\s\S]*?-->/g,'');
  for(const match of withoutComments.matchAll(/<(?:video|audio)\b[^>]*>/gi)){
    const tag=match[0];
    const src=tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const srcValue=String(src?.[1]??src?.[2]??src?.[3]??'').trim();
    if(isBlockedMediaSource(srcValue))return true;
  }
  for(const match of withoutComments.matchAll(/<(video|audio)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)){
    for(const source of match[2].matchAll(/<source\b[^>]*>/gi)){
      const src=source[0].match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const srcValue=String(src?.[1]??src?.[2]??src?.[3]??'').trim();
      if(isBlockedMediaSource(srcValue))return true;
    }
  }
  return false;
}
'''
marker='\nfunction isBlockedFrameSource(source){'
if 'function containsExternalMedia(source)' not in text:
    if marker not in text:
        raise SystemExit('media helper insertion point not found')
    text=text.replace(marker,'\n'+helper+marker,1)
risk="  if(containsExternalImage(html))return {reason:'UNSAFE_NETWORK',axis:'html',capability:'external-image'};"
media="  if(containsExternalMedia(html))return {reason:'UNSAFE_NETWORK',axis:'html',capability:'external-media'};"
if media not in text:
    if risk not in text:
        raise SystemExit('media risk insertion point not found')
    text=text.replace(risk,risk+'\n'+media,1)
policy.write_text(text)

Path('scripts-apply-media-patch.py').unlink()
workflow=Path('.github/workflows/automation-media-patch.yml')
if workflow.exists():
    workflow.unlink()
