import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {passwordHash} from '../lib/security.mjs';
const input=createInterface({input:stdin,output:stdout});
try{
  const password=await input.question('Crie a senha administrativa (mínimo de 12 caracteres): ');
  if(password.length<12||password.length>128)throw new Error('Use de 12 a 128 caracteres.');
  console.log('Salve somente este hash em ADMIN_PASSWORD_HASH na hospedagem:');
  console.log(await passwordHash(password));
}finally{input.close();}
