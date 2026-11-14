import http from 'node:http';
import handler from '../lib/handler.mjs';
const server=http.createServer((req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};
  res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  return handler(req,res);
});
server.listen(Number(process.env.PORT||3001),'127.0.0.1',()=>console.log('Backend: http://localhost:'+server.address().port));
