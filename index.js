import express from 'express';
import handler from './lib/handler.mjs';

export function createServer({apiHandler=handler}={}){
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  const version=()=>({version:'firebase-express-v3',storage:'firebase-realtime-database'});
  app.get('/',(req,res)=>res.json({service:'API de agendamento Jaiane Neves',...version(),health:'/api/health',administration:'/api/admin/bookings'}));
  app.get('/api/version',(req,res)=>res.json({...version(),credentialsConfigured:Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),adminConfigured:Boolean(process.env.ADMIN_PASSWORD_HASH||process.env.ADMIN_PASSWORD)}));
  // Keep the full /api prefix: mounting at app.use('/api') would remove it.
  app.use((req,res,next)=>{
    if(req.path.startsWith('/api/'))return apiHandler(req,res);
    next();
  });
  app.use((req,res)=>res.status(404).json({error:'Rota não encontrada. Consulte /api/health.',...version()}));
  app.use((error,req,res,next)=>{
    console.error('HTTP request failed',error.name);
    if(!res.headersSent)res.status(500).json({error:'Não foi possível atender a requisição.'});
  });
  return app;
}

export default createServer();
