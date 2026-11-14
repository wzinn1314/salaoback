import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const token=()=>randomBytes(32).toString('hex');
export const digest=value=>createHash('sha256').update(value).digest('hex');
export async function passwordHash(password){
  const salt=randomBytes(16).toString('hex');
  return salt+':'+(await scrypt(password,salt,64)).toString('hex');
}
export async function verifyPassword(password,stored){
  if(typeof password!=='string'||password.length>128||!/^([a-f0-9]{32}):([a-f0-9]{128})$/.test(stored||''))return false;
  const [salt,hash]=stored.split(':');
  return timingSafeEqual(await scrypt(password,salt,64),Buffer.from(hash,'hex'));
}
