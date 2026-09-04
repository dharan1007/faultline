function headersFromNode(input={}){
  const headers=new Headers();
  for(const [name,value] of Object.entries(input)){
    if(value==null)continue;
    if(Array.isArray(value)) value.forEach(item=>headers.append(name,String(item)));
    else headers.set(name,String(value));
  }
  return headers;
}

async function bodyFromNode(req,limit){
  if(req.method==='GET'||req.method==='HEAD')return undefined;
  const chunks=[];
  let size=0;
  for await(const part of req){
    const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);
    size+=chunk.length;
    if(size>limit)throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  return chunks.length?Buffer.concat(chunks):undefined;
}

export function toVercelRoute(webHandler,{maxBytes=1048576}={}){
  return async function faultlineVercelRoute(req,res){
    try{
      const headers=headersFromNode(req.headers||{});
      const host=headers.get('x-forwarded-host')||headers.get('host')||'faultline-webmcp.vercel.app';
      const protocol=headers.get('x-forwarded-proto')||'https';
      const body=await bodyFromNode(req,maxBytes);
      const request=new Request(`${protocol}://${host}${req.url||'/'}`,{
        method:req.method||'GET',
        headers,
        ...(body?{body}:{})
      });
      const response=await webHandler(request);
      res.statusCode=response.status;
      response.headers.forEach((value,name)=>res.setHeader(name,value));
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){
      const tooLarge=error?.message==='REQUEST_TOO_LARGE';
      res.statusCode=tooLarge?413:500;
      res.setHeader('content-type','application/json; charset=utf-8');
      res.setHeader('cache-control','no-store');
      res.end(JSON.stringify({ok:false,data:null,error:{code:tooLarge?'REQUEST_TOO_LARGE':'INTERNAL_ERROR',message:tooLarge?'Request body too large.':'Request adapter failed.',retryable:false,details:{}}}));
    }
  };
}
