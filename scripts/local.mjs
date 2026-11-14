import app from '../index.js';
const server=app.listen(Number(process.env.PORT||3001),'127.0.0.1',()=>console.log('Backend: http://localhost:'+server.address().port));
