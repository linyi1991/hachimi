import {nextActionPlan} from './action-plan.mjs';
import {craftPool,simulateCraft} from './craft.mjs';
import {unlockReservation} from './unlock.mjs';
import {recommendAllocation} from './allocation.mjs';
import {stepOffset} from './collaboration.mjs';
// Allocate finished-stock credit to route phases once; a reused part has zero new demand.
export function outstandingPhases(data,state,fleet=4,stage='all'){
 const phases=data.route.steps.filter(s=>stage==='all'||stage==='upgrade'&&s.id!=='start'||s.id===stage).map(s=>({...s,goals:{}}));
 for(const i of data.items){let credit=Math.max(0,(state[i.id]?.collected||0)-stepOffset(i,stage));for(const s of phases){const need=(i.stepNeeds?.[s.id]||0)*fleet/4,used=Math.min(need,credit);credit-=used;if(need>used)s.goals[i.name]=need-used;}}
 return phases.filter(s=>Object.keys(s.goals).length);
}
export function priorityPreparationPlan(data,state,schematics={},fleet=4,stage='all',personalCrystals=false,dispatch={}){
 const model=nextActionPlan(data,state,schematics,fleet,stage,personalCrystals,dispatch),phases=outstandingPhases(data,state,fleet,stage),pool=craftPool(data,state,schematics,{ignoreCrystals:personalCrystals});
 const routeRank=new Map(data.route.steps.map((s,index)=>[s.id,index])),next=phases[0];
 // Prototypes correspond to route construction stages; the zero-material reuse stage needs none.
 const phasePrototype={start:0,to1121:1,to3113:2,to3124:3},index=next?phasePrototype[next.id]:undefined;
 const activePrototypes=index===undefined?[]:(data.schematics||[]).slice(0,index+1);
 const urgentLock=unlockReservation({...data,schematics:activePrototypes},state,schematics);
 const unlockPhases=['start','to1121','to3113','to3124'].map((id,i)=>({id,short:unlockReservation({...data,schematics:(data.schematics||[]).slice(0,i+1)},state,schematics).short}));
 const pendingUnlocks=activePrototypes.filter(s=>!['known','paid'].includes(schematics[s.id]?.status));
 const trials=phases.map(s=>({...s,trial:simulateCraft(data,pool,s.goals)}));
 const urgent=Object.fromEntries((trials[0]?.trial.missing||[]).map(n=>[n.name,n.quantity]));
 const rootTrials=phases.flatMap(s=>Object.entries(s.goals).map(([name,quantity])=>({name,quantity,phase:s.id,label:s.label,trial:simulateCraft(data,pool,{[name]:quantity})}))).sort((a,b)=>(routeRank.get(a.phase)||0)-(routeRank.get(b.phase)||0)||a.trial.missing.length-b.trial.missing.length||a.name.localeCompare(b.name,'zh-Hant'));
 const recommendations=model.assigned?null:recommendAllocation(data,state,schematics,fleet,stage),retainers=new Map((recommendations?.lines||[]).map(n=>[n.id,n.quantity]));
 const order=model.rows.filter(n=>!n.recipe&&n.short>0&&!n.ignored).map(n=>{
  const productionNow=urgent[n.name]||0,unlockNow=urgentLock.short[n.name]||0,first=Math.min(n.short,productionNow+unlockNow);
  const roots=rootTrials.filter(r=>r.trial.missing.some(m=>m.name===n.name)),root=roots[0],phase=trials.find(s=>s.trial.missing.some(m=>m.name===n.name));
  const unlockPhase=unlockPhases.find(s=>s.short[n.name]>0),productionRank=phase?routeRank.get(phase.id)??99:99,unlockRank=unlockPhase?routeRank.get(unlockPhase.id)??99:99;
  const rank=unlockNow?0:first?1:2,phaseIndex=Math.min(productionRank,unlockRank),futureUnlock=unlockRank<=productionRank&&unlockRank!==99;
  const gc=n.exchanges.find(e=>e.kind==='gc'),tribe=n.exchanges.find(e=>e.kind==='tribe');
  const retainer=n.method==='gather'||n.method==='retainer'?Math.min(n.short,model.assigned?n.retainer:(retainers.get(n.id)||0)):0;
  const self=n.method==='gather'||n.method==='retainer'?n.short-retainer:0;
  const kind=n.method==='retainer'?'retainer':n.sources.length?'gather':gc?'gc':tribe?'tribe':n.crystal?'crystal':'lookup';
  const cost=gc?.cost?.match(/每個\s*([\d,]+)\s*軍票/),unitCost=cost?Number(cost[1].replaceAll(',','')):null;
  return {...n,first,later:n.short-first,rank,phaseIndex,futureUnlock,phaseLabel:unlockNow?'下一段設計圖・必留':futureUnlock?((data.route.steps.find(s=>s.id===unlockPhase.id)?.label||'後續')+'・設計圖必留'):phase?.label||'後續解鎖／備料',kind,self,retainer,gc,tribe,unitCost,sealCost:unitCost===null?null:unitCost*n.short,recommended:!model.assigned,root,blockers:root?.trial.missing.length||99,unlockNow};
 }).sort((a,b)=>a.rank-b.rank||a.phaseIndex-b.phaseIndex||Number(b.futureUnlock)-Number(a.futureUnlock)||a.blockers-b.blockers||a.name.localeCompare(b.name,'zh-Hant')).map((n,i)=>({...n,order:i+1}));
 return {...model,order,nextPhase:next||null,pendingUnlocks,unlockReady:pendingUnlocks.every(s=>Object.keys(s.materials).every(name=>!(urgentLock.short[name]>0))),suggested:!model.assigned};
}
