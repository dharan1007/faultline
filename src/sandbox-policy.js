function containsExecutableIdentifier(source,target){
  const text=String(source??'');
  let i=0;
  const isStart=c=>/[A-Za-z_$]/.test(c||'');
  const isPart=c=>/[\w$]/.test(c||'');
  const skipQuoted=quote=>{
    i++;
    while(i<text.length){
      if(text[i]==='\\'){i+=2;continue;}
      if(text[i]===quote){i++;return;}
      i++;
    }
  };
  const scanCode=stopAtTemplateBrace=>{
    let braces=0;
    while(i<text.length){
      const c=text[i],next=text[i+1];
      if(c==="'"||c==='"'){skipQuoted(c);continue;}
      if(c==='/'&&next==='/'){i+=2;while(i<text.length&&text[i]!=='\n')i++;continue;}
      if(c==='/'&&next==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i=Math.min(text.length,i+2);continue;}
      if(c==='`'){
        i++;
        while(i<text.length){
          if(text[i]==='\\'){i+=2;continue;}
          if(text[i]==='`'){i++;break;}
          if(text[i]==='$'&&text[i+1]==='{'){i+=2;if(scanCode(true))return true;continue;}
          i++;
        }
        continue;
      }
      if(isStart(c)){
        const start=i++;
        while(i<text.length&&isPart(text[i]))i++;
        if(text.slice(start,i)===target)return true;
        continue;
      }
      if(stopAtTemplateBrace){
        if(c==='{'){braces++;i++;continue;}
        if(c==='}'){
          if(braces===0){i++;return false;}
          braces--;i++;continue;
        }
      }
      i++;
    }
    return false;
  };
  return scanCode(false);
}

function containsExecutableCall(source,target){
  const text=String(source??'');
  let i=0;
  const isStart=c=>/[A-Za-z_$]/.test(c||'');
  const isPart=c=>/[\w$]/.test(c||'');
  const skipQuoted=quote=>{
    i++;
    while(i<text.length){
      if(text[i]==='\\'){i+=2;continue;}
      if(text[i]===quote){i++;return;}
      i++;
    }
  };
  const skipTrivia=()=>{
    while(i<text.length){
      if(/\s/.test(text[i])){i++;continue;}
      if(text[i]==='/'&&text[i+1]==='/'){i+=2;while(i<text.length&&text[i]!=='\n')i++;continue;}
      if(text[i]==='/'&&text[i+1]==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i=Math.min(text.length,i+2);continue;}
      break;
    }
  };
  const scanCode=stopAtTemplateBrace=>{
    let braces=0;
    while(i<text.length){
      const c=text[i],next=text[i+1];
      if(c==="'"||c==='"'){skipQuoted(c);continue;}
      if(c==='/'&&next==='/'){i+=2;while(i<text.length&&text[i]!=='\n')i++;continue;}
      if(c==='/'&&next==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i=Math.min(text.length,i+2);continue;}
      if(c==='`'){
        i++;
        while(i<text.length){
          if(text[i]==='\\'){i+=2;continue;}
          if(text[i]==='`'){i++;break;}
          if(text[i]==='$'&&text[i+1]==='{'){i+=2;if(scanCode(true))return true;continue;}
          i++;
        }
        continue;
      }
      if(isStart(c)){
        const start=i++;
        while(i<text.length&&isPart(text[i]))i++;
        const identifier=text.slice(start,i);
        skipTrivia();
        if(identifier===target&&text[i]==='(')return true;
        continue;
      }
      if(stopAtTemplateBrace){
        if(c==='{'){braces++;i++;continue;}
        if(c==='}'){
          if(braces===0){i++;return false;}
          braces--;i++;continue;
        }
      }
      i++;
    }
    return false;
  };
  return scanCode(false);
}

function containsExecutableMemberCall(source,roots,target){
  const text=String(source??'');
  const rootSet=new Set(roots);
  let i=0;
  const isStart=c=>/[A-Za-z_$]/.test(c||'');
  const isPart=c=>/[\w$]/.test(c||'');
  const skipQuoted=quote=>{
    i++;
    while(i<text.length){
      if(text[i]==='\\'){i+=2;continue;}
      if(text[i]===quote){i++;return;}
      i++;
    }
  };
  const skipTrivia=()=>{
    while(i<text.length){
      if(/\s/.test(text[i])){i++;continue;}
      if(text[i]==='/'&&text[i+1]==='/'){i+=2;while(i<text.length&&text[i]!=='\n')i++;continue;}
      if(text[i]==='/'&&text[i+1]==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i=Math.min(text.length,i+2);continue;}
      break;
    }
  };
  const scanCode=stopAtTemplateBrace=>{
    let braces=0;
    while(i<text.length){
      const c=text[i],next=text[i+1];
      if(c==="'"||c==='"'){skipQuoted(c);continue;}
      if(c==='/'&&next==='/'){i+=2;while(i<text.length&&text[i]!=='\n')i++;continue;}
      if(c==='/'&&next==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i=Math.min(text.length,i+2);continue;}
      if(c==='`'){
        i++;
        while(i<text.length){
          if(text[i]==='\\'){i+=2;continue;}
          if(text[i]==='`'){i++;break;}
          if(text[i]==='$'&&text[i+1]==='{'){i+=2;if(scanCode(true))return true;continue;}
          i++;
        }
        continue;
      }
      if(isStart(c)){
        const start=i++;
        while(i<text.length&&isPart(text[i]))i++;
        const root=text.slice(start,i);
        if(rootSet.has(root)){
          skipTrivia();
          if(text[i]==='.'){
            i++;skipTrivia();
            if(isStart(text[i])){
              const memberStart=i++;
              while(i<text.length&&isPart(text[i]))i++;
              const member=text.slice(memberStart,i);
              skipTrivia();
              if(member===target&&text[i]==='(')return true;
            }
          }
        }
        continue;
      }
      if(stopAtTemplateBrace){
        if(c==='{'){braces++;i++;continue;}
        if(c==='}'){
          if(braces===0){i++;return false;}
          braces--;i++;continue;}
      }
      i++;
    }
    return false;
  };
  return scanCode(false);
}

function containsExternalScript(source){
  const html=String(source??'');
  if(typeof DOMParser==='function'){
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const script of doc.querySelectorAll('script[src]')){
      if(String(script.getAttribute('src')??'').trim())return true;
    }
    return false;
  }
  const withoutComments=html.replace(/<!--[\s\S]*?-->/g,'');
  return /<script\b(?=[^>]*\bsrc\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+))[^>]*>/i.test(withoutComments);
}

function containsExternalStylesheet(source){
  const html=String(source??'');
  if(typeof DOMParser==='function'){
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const link of doc.querySelectorAll('link[href]')){
      const rel=String(link.getAttribute('rel')??'').toLowerCase().split(/\s+/).filter(Boolean);
      if(rel.includes('stylesheet')&&String(link.getAttribute('href')??'').trim())return true;
    }
    return false;
  }
  const withoutComments=html.replace(/<!--[\s\S]*?-->/g,'');
  for(const match of withoutComments.matchAll(/<link\b[^>]*>/gi)){
    const tag=match[0];
    const rel=tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href=tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const relValue=String(rel?.[1]??rel?.[2]??rel?.[3]??'').toLowerCase().split(/\s+/).filter(Boolean);
    const hrefValue=String(href?.[1]??href?.[2]??href?.[3]??'').trim();
    if(relValue.includes('stylesheet')&&hrefValue)return true;
  }
  return false;
}

function isBlockedImageSource(source){
  const src=String(source??'').trim();
  return Boolean(src)&&!/^(?:data|blob):/i.test(src);
}

function srcsetContainsBlockedSource(source){
  const srcset=String(source??'').trim();
  let i=0;
  while(i<srcset.length){
    while(i<srcset.length&&(srcset[i]===','||/\s/.test(srcset[i])))i++;
    if(i>=srcset.length)break;
    const start=i;
    while(i<srcset.length&&!/\s/.test(srcset[i]))i++;
    let url=srcset.slice(start,i);
    let endedAtSeparator=false;
    while(url.endsWith(',')){
      url=url.slice(0,-1);
      endedAtSeparator=true;
    }
    if(isBlockedImageSource(url))return true;
    if(endedAtSeparator)continue;
    while(i<srcset.length&&srcset[i]!==',')i++;
    if(srcset[i]===',')i++;
  }
  return false;
}

function containsExternalImage(source){
  const html=String(source??'');
  if(typeof DOMParser==='function'){
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const image of doc.querySelectorAll('img[src],img[srcset],source[srcset]')){
      if(isBlockedImageSource(image.getAttribute('src'))||srcsetContainsBlockedSource(image.getAttribute('srcset')))return true;
    }
    return false;
  }
  const withoutComments=html.replace(/<!--[\s\S]*?-->/g,'');
  for(const match of withoutComments.matchAll(/<(?:img|source)\b[^>]*>/gi)){
    const tag=match[0];
    const src=tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const srcset=tag.match(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>]+))/i);
    const srcValue=String(src?.[1]??src?.[2]??src?.[3]??'').trim();
    const srcsetValue=String(srcset?.[1]??srcset?.[2]??srcset?.[3]??'').trim();
    if(isBlockedImageSource(srcValue)||srcsetContainsBlockedSource(srcsetValue))return true;
  }
  return false;
}

function isBlockedFrameSource(source){
  const src=String(source??'').trim();
  return Boolean(src)&&!/^about:blank(?:[?#]|$)/i.test(src);
}

function containsExternalFrame(source){
  const html=String(source??'');
  if(typeof DOMParser==='function'){
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const frame of doc.querySelectorAll('iframe[src]')){
      if(frame.hasAttribute('srcdoc'))continue;
      if(isBlockedFrameSource(frame.getAttribute('src')))return true;
    }
    return false;
  }
  const withoutComments=html.replace(/<!--[\s\S]*?-->/g,'');
  for(const match of withoutComments.matchAll(/<iframe\b[^>]*>/gi)){
    const tag=match[0];
    if(/\bsrcdoc\s*=/i.test(tag))continue;
    const src=tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const srcValue=String(src?.[1]??src?.[2]??src?.[3]??'').trim();
    if(isBlockedFrameSource(srcValue))return true;
  }
  return false;
}

function containsExternalStylesheetImport(source){
  const css=String(source??'');
  let i=0;
  const skipComment=()=>{
    i+=2;
    while(i<css.length&&!(css[i]==='*'&&css[i+1]==='/'))i++;
    i=Math.min(css.length,i+2);
  };
  const skipTrivia=()=>{
    while(i<css.length){
      if(/\s/.test(css[i])){i++;continue;}
      if(css[i]==='/'&&css[i+1]==='*'){skipComment();continue;}
      break;
    }
  };
  const readQuoted=quote=>{
    i++;
    let value='';
    while(i<css.length){
      if(css[i]==='\\'){
        if(i+1<css.length)value+=css[i+1];
        i+=2;
        continue;
      }
      if(css[i]===quote){i++;return value;}
      value+=css[i++];
    }
    return value;
  };
  while(i<css.length){
    const c=css[i];
    if(c==='/'&&css[i+1]==='*'){skipComment();continue;}
    if(c==="'"||c==='"'){readQuoted(c);continue;}
    if(c==='@'&&css.slice(i+1,i+7).toLowerCase()==='import'&&!/[-\w]/.test(css[i+7]||'')){
      i+=7;
      skipTrivia();
      if(css[i]==="'"||css[i]==='"')return Boolean(readQuoted(css[i]).trim());
      if(css.slice(i,i+3).toLowerCase()==='url'&&!/[-\w]/.test(css[i+3]||'')){
        i+=3;
        skipTrivia();
        if(css[i]!=='(')continue;
        i++;
        skipTrivia();
        if(css[i]==="'"||css[i]==='"')return Boolean(readQuoted(css[i]).trim());
        const start=i;
        while(i<css.length&&css[i]!==')')i++;
        return Boolean(css.slice(start,i).trim());
      }
    }
    i++;
  }
  return false;
}

function computedGlobalRisk(source){
  const text=String(source??'');
  const roots=new Set(['window','self','globalThis','document','parent','top','frames','this']);
  const navigationProperties=new Set(['location','document','defaultView','parent','top','frames','self','window','globalThis','history','open']);
  const isStart=c=>/[A-Za-z_$]/.test(c||'');
  const isPart=c=>/[\w$]/.test(c||'');
  let i=0;

  const skipQuoted=quote=>{
    i++;
    while(i<text.length){
      if(text[i]==='\\'){i+=2;continue;}
      if(text[i]===quote){i++;return;}
      i++;
    }
  };
  const skipTrivia=()=>{
    while(i<text.length){
      if(/\s/.test(text[i])){i++;continue;}
      if(text[i]==='/'&&text[i+1]==='/'){i+=2;while(i<text.length&&text[i]!=='\n')i++;continue;}
      if(text[i]==='/'&&text[i+1]==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i=Math.min(text.length,i+2);continue;}
      break;
    }
  };
  const parseStaticProperty=()=>{
    const bracketStart=i;
    i++;
    skipTrivia();
    const quote=text[i];
    if(quote!=="'"&&quote!=='"'){i=bracketStart;return null;}
    i++;
    let property='';
    while(i<text.length){
      const c=text[i];
      if(c==='\\'){i=bracketStart;return null;}
      if(c===quote){i++;break;}
      property+=c;i++;
    }
    skipTrivia();
    if(text[i]!==']'){i=bracketStart;return null;}
    i++;
    return property;
  };

  while(i<text.length){
    const c=text[i],next=text[i+1];
    if(c==="'"||c==='"'){skipQuoted(c);continue;}
    if(c==='/'&&next==='/'){i+=2;while(i<text.length&&text[i]!=='\n')i++;continue;}
    if(c==='/'&&next==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i=Math.min(text.length,i+2);continue;}
    if(c==='`'){
      i++;
      while(i<text.length){
        if(text[i]==='\\'){i+=2;continue;}
        if(text[i]==='`'){i++;break;}
        i++;
      }
      continue;
    }
    if(isStart(c)){
      const start=i++;
      while(i<text.length&&isPart(text[i]))i++;
      const root=text.slice(start,i);
      if(roots.has(root)){
        skipTrivia();
        if(text[i]==='['){
          const property=parseStaticProperty();
          if(property===null)return {root,property:null};
          if(navigationProperties.has(property))return {root,property};
        }
      }
      continue;
    }
    i++;
  }
  return null;
}

export function navigationRisk(candidate){
  const js=String(candidate?.js??'');
  if(containsExecutableCall(js,'Worker')||containsExecutableMemberCall(js,['window','self','globalThis'],'Worker'))return {reason:'UNSAFE_NETWORK',axis:'js',capability:'worker'};
  if(containsExecutableMemberCall(js,['navigator'],'sendBeacon'))return {reason:'UNSAFE_NETWORK',axis:'js',capability:'sendbeacon'};
  if(containsExecutableCall(js,'EventSource')||containsExecutableMemberCall(js,['window','self','globalThis'],'EventSource'))return {reason:'UNSAFE_NETWORK',axis:'js',capability:'eventsource'};
  if(containsExecutableCall(js,'WebSocket')||containsExecutableMemberCall(js,['window','self','globalThis'],'WebSocket'))return {reason:'UNSAFE_NETWORK',axis:'js',capability:'websocket'};
  if(containsExecutableCall(js,'XMLHttpRequest')||containsExecutableMemberCall(js,['window','self','globalThis'],'XMLHttpRequest'))return {reason:'UNSAFE_NETWORK',axis:'js',capability:'xmlhttprequest'};
  if(containsExecutableCall(js,'fetch')||containsExecutableMemberCall(js,['window','self','globalThis'],'fetch'))return {reason:'UNSAFE_NETWORK',axis:'js',capability:'fetch'};
  if(containsExecutableIdentifier(js,'location'))return {axis:'js',capability:'location'};
  if(containsExecutableMemberCall(js,['window','self','globalThis','parent','top'],'open'))return {axis:'js',capability:'popup-navigation'};
  const computed=computedGlobalRisk(js);
  if(computed)return {axis:'js',capability:computed.property==='open'?'popup-navigation':'computed-global',...computed};
  const css=String(candidate?.css??'');
  if(containsExternalStylesheetImport(css))return {reason:'UNSAFE_NETWORK',axis:'css',capability:'external-stylesheet-import'};
  const html=String(candidate?.html??'');
  if(containsExternalScript(html))return {reason:'UNSAFE_NETWORK',axis:'html',capability:'external-script'};
  if(containsExternalStylesheet(html))return {reason:'UNSAFE_NETWORK',axis:'html',capability:'external-stylesheet'};
  if(containsExternalImage(html))return {reason:'UNSAFE_NETWORK',axis:'html',capability:'external-image'};
  if(containsExternalFrame(html))return {reason:'UNSAFE_NETWORK',axis:'html',capability:'external-frame'};
  if(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:["']?refresh["']?\b))[^>]*>/i.test(html))return {axis:'html',capability:'meta-refresh'};
  return null;
}