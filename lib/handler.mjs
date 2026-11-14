import {database} from './database.mjs';
import {createApp} from './app.mjs';
let app;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'Configure DATABASE_URL no backend.'});
  try{
    app??=createApp({db:database()});
    const headers=new Headers();
    for(const [name,value]of Object.entries(req.headers))if(value!=null)headers.set(name,Array.isArray(value)?value.join(','):value);
    const method=req.method||'GET';
    let body;
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.statusCode=413;res.end();return;}chunks.push(chunk);}body=Buffer.concat(chunks).toString();}
    }
    const url='https://backend.internal'+(req.url||'/');
    const response=await app(new Request(url,{method,headers,...(body!==undefined?{body}:{})}));
    res.statusCode=response.status;
    for(const[k,v]of response.headers)res.setHeader(k,v);
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Backend indisponível. Verifique a configuração.'}));}
}
