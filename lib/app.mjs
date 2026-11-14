import {randomUUID} from 'node:crypto';
import {passwordHash,verifyPassword,token,digest} from './security.mjs';
import {lastWorkingDate,prices,services,available} from './rules.mjs';

export function createApp({db,env=process.env,now}){
  const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  const values=state=>Object.values(state.bookings||{});
  async function rate(key,limit,seconds){
    const timestamp=Date.now(),id=digest(key)+'-'+Math.floor(timestamp/(seconds*1000));
    return db.mutate(state=>{
      state.rates??={};
      for(const[k,v]of Object.entries(state.rates))if(v.expires_at<=timestamp)delete state.rates[k];
      const record=state.rates[id]||{count:0,expires_at:timestamp+seconds*1000};
      record.count++;state.rates[id]=record;
      return record.count<=limit;
    });
  }
  async function route(request,url){
    const path=url.pathname,method=request.method;
    if(!['GET','POST','DELETE','OPTIONS'].includes(method))return response({error:'Método não permitido.'},405);
    await db.initialize();
    if(path==='/api/health'&&method==='GET')return response({ok:true,storage:'firebase-realtime-database'});
    if(path==='/api/availability'&&method==='GET'){
      const month=url.searchParams.get('month')||'';
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return response({error:'Mês inválido.'},400);
      const rows=values(await db.read()).filter(b=>b.date.startsWith(month)).map(({date,time,duration})=>({date,time,duration}));
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
      const booking={id:randomUUID(),name:b.name.trim(),phone:b.phone.replace(/\D/g,''),service:services[b.service],hair_length:b.hairLength,price:prices[b.hairLength],date:b.date,time:b.time,duration:120,manual:false,status:'confirmed',created_at:Date.now()};
      const clock=now?.();
      const saved=await db.mutate(state=>{
        if(!available(b.date,values(state).filter(row=>row.date===b.date),clock).includes(b.time))return false;
        state.bookings??={};state.bookings[booking.id]=booking;return true;
      });
      return saved?response({id:booking.id,service:booking.service,date:booking.date,time:booking.time,price:booking.price},201):response({error:'Horário indisponível. Escolha outro.'},409);
    }
    if(path==='/api/admin/login'&&method==='POST'){
      if(!await rate('login:'+ip,5,900))return response({error:'Muitas tentativas. Aguarde 15 minutos.'},429);
      let bootstrapHash=env.ADMIN_PASSWORD_HASH;
      if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(bootstrapHash||'')){
        if(typeof env.ADMIN_PASSWORD!=='string'||env.ADMIN_PASSWORD.length<12||env.ADMIN_PASSWORD.length>128)return response({error:'Configure ADMIN_PASSWORD com pelo menos 12 caracteres no backend.'},503);
        bootstrapHash=await passwordHash(env.ADMIN_PASSWORD);
      }
      const hash=await db.mutate(state=>{state.password_hash??=bootstrapHash;return state.password_hash;});
      if(!await verifyPassword(b.password,hash))return response({error:'Senha incorreta.'},401);
      const value=token(),timestamp=Date.now();
      const saved=await db.mutate(state=>{
        if(state.password_hash!==hash)return false;
        state.sessions??={};
        for(const[k,v]of Object.entries(state.sessions))if(v.expires_at<=timestamp)delete state.sessions[k];
        state.sessions[digest(value)]={expires_at:timestamp+28800000};return true;
      });
      return saved?response({ok:true,token:value}):response({error:'A senha mudou. Entre novamente.'},401);
    }
    if(path.startsWith('/api/admin/')){
      const bearer=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if(!bearer)return response({error:'Entre com sua senha.'},401);
      const sessionHash=digest(bearer);
      const authorized=state=>state.sessions?.[sessionHash]?.expires_at>Date.now();
      const state=await db.read();
      if(!authorized(state))return response({error:'Sessão expirada. Entre novamente.'},401);
      if(path==='/api/admin/bookings'&&method==='GET')return response({bookings:values(state).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))});
      if(path==='/api/admin/logout'&&method==='POST'){
        await db.mutate(state=>{if(state.sessions)delete state.sessions[sessionHash];});return response({ok:true});
      }
      if(path==='/api/admin/password'&&method==='POST'){
        if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)return response({error:'Use de 12 a 128 caracteres.'},400);
        if(!await rate('password:'+ip,5,900))return response({error:'Aguarde 15 minutos.'},429);
        if(!await verifyPassword(b.currentPassword,state.password_hash))return response({error:'Senha atual incorreta.'},401);
        const hash=await passwordHash(b.password);
        const changed=await db.mutate(current=>{
          if(!authorized(current)||current.password_hash!==state.password_hash)return false;
          current.password_hash=hash;delete current.sessions;return true;
        });
        return changed?response({ok:true}):response({error:'Sessão expirada. Entre novamente.'},401);
      }
      if(path.startsWith('/api/admin/bookings/')&&method==='DELETE'){
        const id=decodeURIComponent(path.slice('/api/admin/bookings/'.length));
        const deleted=await db.mutate(current=>{
          if(!authorized(current))return 'unauthorized';
          if(!Object.hasOwn(current.bookings||{},id))return false;
          delete current.bookings[id];return true;
        });
        if(deleted==='unauthorized')return response({error:'Sessão expirada.'},401);
        return deleted?response({ok:true}):response({error:'Agendamento não encontrado.'},404);
      }
    }
    return response({error:'Não encontrado.'},404);
  }
  return async request=>{
    const origin=request.headers.get('origin');
    const allowed=(env.FRONTEND_ORIGINS||'https://agendamentos-amber-xi.vercel.app').split(',').map(x=>x.trim()).filter(Boolean);
    const cors={'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'600'};
    if(origin&&allowed.includes(origin))cors['Access-Control-Allow-Origin']=origin;
    if(origin&&!allowed.includes(origin))return response({error:'Origem não permitida.'},403,cors);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    try{
      const r=await route(request,new URL(request.url));for(const[k,v]of Object.entries(cors))r.headers.set(k,v);return r;
    }catch(error){
      console.error('API failure',error.code||error.name);
      return response({error:'Agenda indisponível. Confira as credenciais Firebase no backend.'},503,cors);
    }
  };
}
