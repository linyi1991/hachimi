import {preparationPlan} from './preparation.mjs';
import {unlockReservation} from './unlock.mjs';
import {craftExecutionPlan} from './execution.mjs';
import {gatheringPlan} from './gathering.mjs';
import {allocationFingerprint,timedRetainerMaterial} from './allocation.mjs';
import {fleetRequired,stepOffset} from './collaboration.mjs';
// Read-only projection of the existing stock and reservation calculations. Never adds recipe levels together.
export function materialActionPlan(data,state,schematics={},fleet=4,stage='all',personalCrystals=false,dispatch={}){
 const locked=unlockReservation(data,state,schematics),gather=new Map(gatheringPlan(data,state,fleet,stage,schematics,personalCrystals).map(n=>[n.id,n]));
 const assigned=!!dispatch.revision&&dispatch.fleet===fleet&&dispatch.stage===stage&&dispatch.fingerprint===allocationFingerprint(data,state,schematics);
 const lines=new Map((assigned?dispatch.lines||[]:[]).map(n=>[n.id,n.quantity]));
 const rows=preparationPlan(data,state,fleet,stage,schematics).map(n=>{
  const s=state[n.id]||{},physical=Math.max(0,(s.collected||0)-(s.delivered||0)),workshopHeld=n.direct?Math.min(physical,Math.max(0,n.total-(s.delivered||0))):0;
  const reserve=locked.required[n.name]||0,held=workshopHeld+(locked.held[n.name]||0),need=n.need+workshopHeld+reserve,short=n.short+(locked.short[n.name]||0),recipe=data.recipes[n.name],crystal=/碎晶|水晶|晶簇/.test(n.name),g=gather.get(n.id),timed=timedRetainerMaterial(data,n.name);
  const retainer=g?(timed?short:Math.min(short,lines.get(n.id)||0)):0,self=g&&assigned?short-retainer:null;
  const exchanges=data.acquisition?.[n.name]?.exchanges||[],method=recipe?'craft':crystal?'crystal':g?(timed?'retainer':'gather'):exchanges.length?'exchange':'lookup';
  const usage=n.processingUses.map(u=>({name:u.name,quantity:u.quantity,output:u.output}));
  return {...n,physical,need,short,held,reserve,reserveShort:locked.short[n.name]||0,workshopHeld,method,crystal,ignored:personalCrystals&&crystal,sources:g?.sources||[],priority:g?.priority||{rank:8,label:'目前目標'},retainer,self,assigned,exchanges,usage,recipe};
 });
 const goals=data.items.map(i=>{const target=fleetRequired(i,fleet,stage),ready=Math.min(target,Math.max(0,(state[i.id]?.collected||0)-stepOffset(i,stage)));return {target,ready};});
 const goal=goals.reduce((a,n)=>({need:a.need+n.target,ready:a.ready+n.ready,lack:a.lack+n.target-n.ready}),{need:0,ready:0,lack:0});
 return {rows,goal,assigned};
}
export function nextActionPlan(data,state,schematics={},fleet=4,stage='all',personalCrystals=false,dispatch={}){
 const current=materialActionPlan(data,state,schematics,fleet,stage,personalCrystals,dispatch),execution=craftExecutionPlan(data,state,schematics,fleet,stage,personalCrystals);
 const after=materialActionPlan(data,execution.state,schematics,fleet,stage,personalCrystals);
 // Plan current gathering assignments against the real stock only, never pretend planned crafting has happened.
 const rest=after.rows.filter(n=>!n.recipe&&n.short>0&&!n.ignored).map(n=>{const original=current.rows.find(r=>r.id===n.id);return {...n,assigned:original.assigned,retainer:Math.min(n.short,original.retainer),self:original.assigned?Math.max(0,n.short-original.retainer):null};});
 rest.sort((a,b)=>a.priority.rank-b.priority.rank||a.name.localeCompare(b.name,'zh-Hant'));
 return {...current,steps:execution.steps,rest};
}
