import {initializeApp,getApps,cert} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {seed} from './seed.mjs';

export const defaultDatabaseURL='https://salao-884a5-default-rtdb.firebaseio.com';
export function createDatabase(reference){
  let ready;
  async function initialize(){
    if(!ready)ready=reference.transaction(current=>{
      const state=current||{};
      if(state.schemaVersion===1)return;
      state.bookings??={};
      for(const b of seed)if(!state.bookings[b.id])state.bookings[b.id]={...b,created_at:0};
      state.schemaVersion=1;
      return state;
    },undefined,false).catch(error=>{ready=undefined;throw error;});
    await ready;
  }
  async function read(){return (await reference.get()).val()||{};}
  async function mutate(update){
    let result;
    // Firebase retries this pure callback when two phones update the same agenda.
    const out=await reference.transaction(current=>{
      const state=structuredClone(current||{});
      result=update(state);
      return state;
    },undefined,false);
    if(!out.committed)throw new Error('TRANSACTION_ABORTED');
    return result;
  }
  return {initialize,read,mutate};
}
let instance;
export function database(env=process.env){
  if(instance)return instance;
  const databaseURL=env.FIREBASE_DATABASE_URL||defaultDatabaseURL;
  const url=new URL(databaseURL);
  if(url.protocol!=='https:'||!/(^|\.)(firebaseio\.com|firebasedatabase\.app)$/.test(url.hostname))throw new Error('INVALID_FIREBASE_URL');
  const options={databaseURL};
  if(env.FIREBASE_DATABASE_EMULATOR_HOST){
    if(env.NODE_ENV==='production')throw new Error('EMULATOR_NOT_ALLOWED_IN_PRODUCTION');
    options.projectId='demo-salao';
  }else{
    if(!env.FIREBASE_SERVICE_ACCOUNT_JSON)throw new Error('FIREBASE_CREDENTIALS_MISSING');
    const serviceAccount=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    serviceAccount.private_key=serviceAccount.private_key?.replace(/\\n/g,'\n');
    options.credential=cert(serviceAccount);
  }
  const app=getApps().find(app=>app.name==='salon-api')||initializeApp(options,'salon-api');
  instance=createDatabase(getDatabase(app).ref('salon'));
  return instance;
}
