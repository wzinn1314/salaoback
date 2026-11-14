import {randomUUID} from 'node:crypto';
import {passwordHash,verifyPassword,token,digest} from './security.mjs';
import {lastWorkingDate,prices,services,available} from './rules.mjs';

export function createApp({db,env=process.env,now}){
  const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  async function rate(key,limit,seconds){
    const bucket=Math.floor(Date.now()/(seconds*1000));
    const r=await db.query('INSERT INTO salon_rate(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=salon_rate.count+1 RETURNING count',[key+':'+bucket,Date.now()+seconds*1000]);
    return r.rows[0].count<=limit;
  }
  async function route(request,url){
    const path=url.pathname,method=request.method;
    if(!['GET','POST','DELETE','OPTIONS'].includes(method))return response({error:'Método não permitido.'},405);
    await db.initialize();
    if(path==='/api/health'&&method==='GET')return response({ok:true,storage:'postgresql'});
    if(path==='/api/availability'&&method==='GET'){
      const month=url.searchParams.get('month')||'';
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return response({error:'Mês inválido.'},400);
      const {rows}=await db.query('SELECT date,time,duration FROM salon_bookings WHERE date LIKE $1 ORDER BY date,time',[month+'-%']);
      return response({lastWorkingDate,bookings:rows,pendingDates:[...new Set(rows.filter(b=>!b.time).map(b=>b.date))],closedDates:[]});
    }
    const ip=digest(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown');
    let b={};
    if(method==='POST'){
      const text=await request.text();
      if(text.length>4096)return response({error:'Requisição muito grande.'},413);
      try{b=JSON.parse(text);}catch{return response({error:'Dados inválidos.'},400);}
      if(!b||typeof b!=='object'||Array.isArray(b))return response({error:'Dados inválidos.'},400);
    }
    if(path==='/api/bookings'&&method==='POST'){
      if(!await rate('booking:'+ip,20,3600))return response({error:'Muitas tentativas. Tente mais tarde.'},429);
      if(!Object.hasOwn(services,b.service)||!Object.hasOwn(prices,b.hairLength)||typeof b.name!=='string'||b.name.trim().length<2||b.name.length>100||typeof b.phone!=='string'||!/^\d{10,11}$/.test(b.phone.replace(/\D/g,'')))return response({error:'Confira nome, WhatsApp e serviço.'},400);
      return db.transaction(async c=>{
        // This database lock serializes competing reservations across every server instance.
        await c.query('SELECT pg_advisory_xact_lock(7352102)');
        const {rows}=await c.query('SELECT date,time,duration FROM salon_bookings WHERE date=$1',[b.date]);
        if(!available(b.date,rows,now?.()).includes(b.time))return response({error:'Horário indisponível. Escolha outro.'},409);
        const booking={id:randomUUID(),name:b.name.trim(),phone:b.phone.replace(/\D/g,''),service:services[b.service],hair_length:b.hairLength,price:prices[b.hairLength],date:b.date,time:b.time,duration:120,manual:false};
        await c.query('INSERT INTO salon_bookings(id,name,phone,service,hair_length,price,date,time) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[booking.id,booking.name,booking.phone,booking.service,booking.hair_length,booking.price,booking.date,booking.time]);
        return response({id:booking.id,service:booking.service,date:booking.date,time:booking.time,price:booking.price},201);
      });
    }
    if(path==='/api/admin/login'&&method==='POST'){
      if(!await rate('login:'+ip,5,900))return response({error:'Muitas tentativas. Aguarde 15 minutos.'},429);
      if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.ADMIN_PASSWORD_HASH||''))return response({error:'Configure a senha administrativa no backend.'},503);
      await db.query('INSERT INTO salon_credentials(id,password_hash) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',[env.ADMIN_PASSWORD_HASH]);
      const {rows}=await db.query('SELECT password_hash FROM salon_credentials WHERE id=1');
      if(!await verifyPassword(b.password,rows[0].password_hash))return response({error:'Senha incorreta.'},401);
      const value=token();
      await db.query('INSERT INTO salon_sessions(token_hash,expires_at) VALUES($1,$2)',[digest(value),Date.now()+28800000]);
      await db.query('DELETE FROM salon_sessions WHERE expires_at<$1',[Date.now()]);
      await db.query('DELETE FROM salon_rate WHERE expires_at<$1',[Date.now()]);
      return response({ok:true,token:value});
    }
    if(path.startsWith('/api/admin/')){
      const bearer=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if(!bearer)return response({error:'Entre com sua senha.'},401);
      const sessionHash=digest(bearer);
      const {rows}=await db.query('SELECT token_hash FROM salon_sessions WHERE token_hash=$1 AND expires_at>$2',[sessionHash,Date.now()]);
      if(!rows.length)return response({error:'Sessão expirada. Entre novamente.'},401);
      if(path==='/api/admin/bookings'&&method==='GET'){
        const result=await db.query('SELECT * FROM salon_bookings ORDER BY date,time');
        return response({bookings:result.rows});
      }
      if(path==='/api/admin/logout'&&method==='POST'){
        await db.query('DELETE FROM salon_sessions WHERE token_hash=$1',[sessionHash]);
        return response({ok:true});
      }
      if(path==='/api/admin/password'&&method==='POST'){
        if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)return response({error:'Use de 12 a 128 caracteres.'},400);
        if(!await rate('password:'+ip,5,900))return response({error:'Aguarde 15 minutos.'},429);
        return db.transaction(async c=>{
          const credential=await c.query('SELECT password_hash FROM salon_credentials WHERE id=1 FOR UPDATE');
          if(!await verifyPassword(b.currentPassword,credential.rows[0].password_hash))return response({error:'Senha atual incorreta.'},401);
          await c.query('UPDATE salon_credentials SET password_hash=$1 WHERE id=1',[await passwordHash(b.password)]);
          await c.query('DELETE FROM salon_sessions');
          return response({ok:true});
        });
      }
      if(path.startsWith('/api/admin/bookings/')&&method==='DELETE'){
        const id=decodeURIComponent(path.slice('/api/admin/bookings/'.length));
        return db.transaction(async c=>{
          await c.query('SELECT pg_advisory_xact_lock(7352102)');
          const deleted=await c.query('DELETE FROM salon_bookings WHERE id=$1 RETURNING id',[id]);
          return deleted.rows.length?response({ok:true}):response({error:'Agendamento não encontrado.'},404);
        });
      }
    }
    return response({error:'Não encontrado.'},404);
  }
  return async request=>{
    const origin=request.headers.get('origin');
    const allowed=(env.FRONTEND_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
    const cors={'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'600'};
    if(origin&&allowed.includes(origin))cors['Access-Control-Allow-Origin']=origin;
    if(origin&&!allowed.includes(origin))return response({error:'Origem não permitida.'},403,cors);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    try{
      const r=await route(request,new URL(request.url));
      for(const [k,v]of Object.entries(cors))r.headers.set(k,v);
      return r;
    }catch(error){
      console.error('API failure',error.code||error.name);
      return response({error:'Agenda indisponível. Confira a conexão do banco no backend.'},503,cors);
    }
  };
}
