import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../index.js';
import {createHandler} from '../lib/handler.mjs';

test('Express serves root, version and every API path without losing /api prefix',async()=>{
  const requests=[];
  const app=createServer({apiHandler:async(req,res)=>{
    requests.push(req.originalUrl);
    res.status(req.originalUrl.includes('/admin/')?401:200).json({path:req.originalUrl});
  }});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const root='http://127.0.0.1:'+server.address().port;
  try{
    let r=await fetch(root);assert.equal(r.status,200);assert.equal((await r.json()).version,'firebase-express-v3');
    r=await fetch(root+'/api/version');assert.equal(r.status,200);assert.equal((await r.json()).storage,'firebase-realtime-database');
    for(const path of ['/api/health','/api/availability?month=2026-12','/api/bookings','/api/admin/bookings','/api/admin/bookings/id','/api/admin/login','/api/admin/logout','/api/admin/password']){
      r=await fetch(root+path);assert.notEqual(r.status,404,path);assert.equal((await r.json()).path,path);
    }
    assert.equal(requests.length,8);
    assert.equal((await fetch(root+'/missing')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('Missing Firebase credential returns actionable 503 with CORS, not 404',async()=>{
  const apiHandler=createHandler({env:{FRONTEND_ORIGINS:'https://salon.example'},getDatabase(){throw new Error('Must not access database without credentials');}});
  const server=createServer({apiHandler}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const root='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/api/health','/api/admin/bookings']){
      const r=await fetch(root+path,{headers:{Origin:'https://salon.example'}});
      assert.equal(r.status,503);assert.equal(r.headers.get('access-control-allow-origin'),'https://salon.example');
      assert.match((await r.json()).error,/FIREBASE_SERVICE_ACCOUNT_JSON/);
    }
    assert.equal((await fetch(root+'/api/bookings',{method:'OPTIONS',headers:{Origin:'https://salon.example'}})).status,204);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
