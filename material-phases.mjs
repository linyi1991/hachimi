import {outstandingPhases} from './priority-plan.mjs';
import {craftPool,simulateCraft} from './craft.mjs';
import {unlockReservation} from './unlock.mjs';
export function materialShortageVisible(row,locked={},personalCrystals=false){
 if(!row||personalCrystals&&/碎晶|水晶|晶簇/.test(row.name))return false;
 return row.short+(locked.short?.[row.name]||0)>0;
}
// These are usage labels, not an additional demand calculation. Share stock across phases once.
export function materialPhaseUses(data,state,fleet=4,scope='all',schematics={}){
 const labels={},add=(name,entry)=>{labels[name]||=[];if(!labels[name].some(n=>n.id===entry.id))labels[name].push(entry);};
 let pool=craftPool(data,state,schematics);
 for(const phase of outstandingPhases(data,state,fleet,scope)){
  const entry={id:phase.id,label:phase.to==='1111'?'1111 起步':phase.to+' 換裝',kind:'production'},trial=simulateCraft(data,pool,phase.goals);
  pool=trial.pool;
  for(const name of Object.keys(phase.goals))add(name,entry);
  for(const step of trial.steps){add(step.name,entry);for(const name of Object.keys(data.recipes[step.name].items))add(name,entry);}
  for(const missing of trial.missing)add(missing.name,entry);
 }
 const locked=unlockReservation(data,state,schematics),codes=['1111','1121','3113','3124'];
 for(const [index,schematic] of (data.schematics||[]).entries()){
  if(['known','paid'].includes(schematics[schematic.id]?.status))continue;
  const local=unlockReservation({...data,schematics:[schematic]},state,schematics);
  for(const name of Object.keys(local.required))if(local.required[name]>0&&(locked.required[name]||0)>0)add(name,{id:'unlock:'+schematic.id,label:(codes[index]||schematic.name)+' 設計圖・必留',kind:'unlock'});
 }
 return labels;
}
