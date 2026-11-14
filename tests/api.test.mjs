import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../lib/database.mjs';
import {createApp} from '../lib/app.mjs';
import {passwordHash} from '../lib/security.mjs';

test('shared PostgreSQL: independent clients, auth, conflicts, deletion and restart',async()=>{
  const pg=new PGlite();
  let tail=Promise.resolve();
  async function acquire(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return release;}
  const query=async(sql,args)=>sql.includes(';')&&!args?(await pg.exec(sql)).at(-1):pg.query(sql,args);
  const pool={async connect(){const release=await acquire();return {query,release};},async query(sql,args){const release=await acquire();try{return await query(sql,args);}finally{release();}}};
  const env={FRONTEND_ORIGINS:'https://salon.example',ADMIN_PASSWORD_HASH:await passwordHash('test-password-12345')};
  const makeApp=()=>createApp({db:createDatabase(pool),env,now:()=>({date:'2026-11-14',minutes:0})});
  const adminApp=makeApp(),customerApp=makeApp();let ip=0;
  const req=async(app,path,{method='GET',body,token,origin='https://salon.example',address}={})=>app(new Request('https://backend.example'+path,{method,headers:{Origin:origin,'Content-Type':'application/json','x-forwarded-for':address||'test-'+(++ip),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  try{
    assert.equal((await req(adminApp,'/api/health',{origin:'https://evil.example'})).status,403);
    const preflight=await req(adminApp,'/api/bookings',{method:'OPTIONS'});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),env.FRONTEND_ORIGINS);
    let r=await req(customerApp,'/api/availability?month=2026-12');let data=await r.json();assert.equal(data.bookings.length,21);assert(!JSON.stringify(data).includes('Micaelly'));
    assert.equal((await req(adminApp,'/api/admin/bookings')).status,401);
    assert.equal((await req(adminApp,'/api/admin/login',{method:'POST',body:{password:'wrong'}})).status,401);
    r=await req(adminApp,'/api/admin/login',{method:'POST',body:{password:'test-password-12345'}});assert.equal(r.status,200);let token=(await r.json()).token;
    const b={name:'Client from another phone',phone:'11999999999',service:'progressiva',hairLength:'curto',date:'2026-12-22',time:'17:30',price:1};
    const attempts=await Promise.all([req(customerApp,'/api/bookings',{method:'POST',body:b}),req(makeApp(),'/api/bookings',{method:'POST',body:b})]);
    assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
    const saved=await attempts.find(r=>r.status===201).json();assert.equal(saved.price,130);
    data=await (await req(adminApp,'/api/admin/bookings',{token})).json();assert.equal(data.bookings.length,22);assert.equal(data.bookings.find(x=>x.id===saved.id).phone,b.phone);
    // A fresh server instance reads the same database, never browser storage.
    assert((await (await req(makeApp(),'/api/admin/bookings',{token})).json()).bookings.some(x=>x.id===saved.id));
    assert.equal((await req(adminApp,'/api/admin/bookings/'+saved.id,{method:'DELETE',token})).status,200);
    assert.equal((await req(customerApp,'/api/bookings',{method:'POST',body:b})).status,201);
    assert.equal((await req(customerApp,'/api/bookings',{method:'POST',body:{...b,date:'2026-12-29'}})).status,409);
    const manual=data.bookings.find(x=>x.name==='Janinha');
    assert.equal((await req(adminApp,'/api/admin/bookings/'+encodeURIComponent(manual.id),{method:'DELETE',token})).status,200);
    assert(!(await (await req(makeApp(),'/api/admin/bookings',{token})).json()).bookings.some(x=>x.id===manual.id));
    assert.equal((await req(customerApp,'/api/bookings',{method:'POST',body:{...b,date:'2026-12-19',time:'08:00'}})).status,201);
    // Day capacity is respected when requests compete for different slots.
    const full=await Promise.all(['08:00','17:30','08:00'].map(time=>req(makeApp(),'/api/bookings',{method:'POST',body:{...b,date:'2026-12-15',time}})));
    assert.deepEqual(full.map(r=>r.status).sort(),[201,201,409]);
    assert.equal((await req(adminApp,'/api/admin/password',{method:'POST',token,body:{currentPassword:'test-password-12345',password:'changed-password-12345'}})).status,200);
    assert.equal((await req(adminApp,'/api/admin/bookings',{token})).status,401);
    r=await req(makeApp(),'/api/admin/login',{method:'POST',body:{password:'changed-password-12345'}});assert.equal(r.status,200);token=(await r.json()).token;
    await req(adminApp,'/api/admin/logout',{method:'POST',body:{},token});assert.equal((await req(adminApp,'/api/admin/bookings',{token})).status,401);
    for(let i=0;i<5;i++)assert.equal((await req(adminApp,'/api/admin/login',{method:'POST',body:{password:'wrong'},address:'limited-ip'})).status,401);
    assert.equal((await req(adminApp,'/api/admin/login',{method:'POST',body:{password:'wrong'},address:'limited-ip'})).status,429);
  }finally{await pg.close();}
});
