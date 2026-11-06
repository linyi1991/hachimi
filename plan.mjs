import {unlockReservation} from './unlock.mjs';
export function calculatePlan(data,state,fleet=4,schematics={}){
 if(!Number.isInteger(fleet)||fleet<1||fleet>4)throw Error('艘數必須為 1 至 4');
 const demand={},rows=[],unlock=unlockReservation(data,state,schematics);
 for(const n of data.inventoryNodes){
  const s=state[n.id]||{},direct=Math.max(0,n.total*fleet/4-(s.delivered||0)),upstream=demand[n.name]||0;let available=Math.max(0,(s.collected||0)-(s.delivered||0));
  const unlockHeld=unlock.held[n.name]||0;available=Math.max(0,available-unlockHeld);
  const reserve=Math.min(available,direct),forCraft=Math.max(0,available-reserve),total=direct+upstream,short=Math.max(0,total-available),rec=data.recipes[n.name],batches=rec?Math.ceil(short/rec.yield):0;
  rows.push({...n,unlockHeld,unlockNeed:unlock.required[n.name]||0,directNeed:direct,upstream,available,reserve,forCraft,total,short,batches,tab:s.reserve_tab||4,locked:s.reserve_locked!==0});
  if(rec)for(const[i,q]of Object.entries(rec.items))demand[i]=(demand[i]||0)+batches*q;
 }
 return rows;
}
