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

function computedGlobalRisk(source){
  const text=String(source??'');
  const roots=new Set(['window','self','globalThis','document','parent','top','frames','this']);
  const navigationProperties=new Set(['location','document','defaultView','parent','top','frames','self','window','globalThis','history']);
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
  if(containsExecutableIdentifier(js,'location'))return {axis:'js',capability:'location'};
  const computed=computedGlobalRisk(js);
  if(computed)return {axis:'js',capability:'computed-global',...computed};
  const html=String(candidate?.html??'');
  if(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:["']?refresh["']?\b))[^>]*>/i.test(html))return {axis:'html',capability:'meta-refresh'};
  return null;
}
