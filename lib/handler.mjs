import {database} from './firebase-database.mjs';
import {createApp} from './app.mjs';
let app;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const origin=req.headers.origin;
  const allowed=(process.env.FRONTEND_ORIGINS||'https://agendamentos-amber-xi.vercel.app').split(',').map(x=>x.trim());
  if(origin&&allowed.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){
    res.statusCode=origin&&!allowed.includes(origin)?403:204;
    res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
    res.end();return;
  }
  if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON&&!process.env.FIREBASE_DATABASE_EMULATOR_HOST){
    res.statusCode=503;res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({error:'Configure FIREBASE_SERVICE_ACCOUNT_JSON no backend.'}));return;
  }
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
