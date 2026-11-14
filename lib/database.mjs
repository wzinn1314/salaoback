import pg from 'pg';
import {seed} from './seed.mjs';
export function createDatabase(pool){
  let ready;
  const transaction=async task=>{
    const client=await pool.connect();
    try {await client.query('BEGIN');const out=await task(client);await client.query('COMMIT');return out;}
    catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  };
  async function initialize(){
    if(!ready)ready=transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(7352101)');
      await c.query(`CREATE TABLE IF NOT EXISTS salon_meta (key text PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS salon_bookings (
          id text PRIMARY KEY, name text NOT NULL, phone text NOT NULL DEFAULT '',
          service text NOT NULL, hair_length text NOT NULL DEFAULT '', price integer,
          date text NOT NULL, time text NOT NULL DEFAULT '', duration integer NOT NULL DEFAULT 120,
          period text NOT NULL DEFAULT '', manual boolean NOT NULL DEFAULT false,
          status text NOT NULL DEFAULT 'confirmed', created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS salon_bookings_date ON salon_bookings(date);
        CREATE TABLE IF NOT EXISTS salon_credentials(id integer PRIMARY KEY CHECK(id=1),password_hash text NOT NULL);
        CREATE TABLE IF NOT EXISTS salon_sessions(token_hash text PRIMARY KEY,expires_at bigint NOT NULL);
        CREATE TABLE IF NOT EXISTS salon_rate(key text PRIMARY KEY,count integer NOT NULL,expires_at bigint NOT NULL);`);
      const done=await c.query("SELECT key FROM salon_meta WHERE key='caderno-v1'");
      if(!done.rows.length){
        for(const b of seed)await c.query('INSERT INTO salon_bookings(id,name,phone,service,date,time,duration,period,manual) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT(id) DO NOTHING',[b.id,b.name,b.phone,b.service,b.date,b.time,b.duration,b.period]);
        await c.query("INSERT INTO salon_meta(key) VALUES('caderno-v1')");
      }
    }).catch(error=>{ready=undefined;throw error;});
    return ready;
  }
  return {initialize,transaction,query:(sql,args)=>pool.query(sql,args)};
}
let instance;
export function database(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_MISSING');
  if(!instance){
    const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
    pool.on('error',()=>console.error('Database connection error'));
    instance=createDatabase(pool);
  }
  return instance;
}
