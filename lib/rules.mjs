export const lastWorkingDate='2026-12-27';
export const prices={retoque3:100,retoque6:120,curto:130,medio:150,longo:170,extralongo:200};
export const services={progressiva:'Progressiva',selagem:'Selagem'};
export const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
export function nowSalon(){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
export function available(date,bookings,now=nowSalon()){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const d=new Date(date+'T12:00:00Z');
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==date||date<now.date||date>lastWorkingDate)return [];
  const day=d.getUTCDay();
  const times=['2026-12-07','2026-12-14'].includes(date)?['08:00','17:30']:day===1?[]:day===0||day===6?['08:00','14:00']:['08:00','17:30'];
  if(bookings.length>=2||bookings.some(b=>!b.time))return [];
  return times.filter(t=>(date!==now.date||minutes(t)>now.minutes)&&!bookings.some(b=>minutes(t)<minutes(b.time)+b.duration&&minutes(t)+120>minutes(b.time)));
}
