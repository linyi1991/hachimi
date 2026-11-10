import {gatheringPlan} from './gathering.mjs';
import {craftPool,simulateCraft} from './craft.mjs';
import {stepOffset} from './collaboration.mjs';
export function timedRetainerMaterial(data,name){return !!data.timedGathering?.[name]&&!/碎晶|水晶|晶簇/.test(name);}
export function allocationFingerprint(data,state,schematics={}){return JSON.stringify([data.allocationPolicyRevision||1,data.inventoryNodes.map(n=>{const s=state[n.id]||{};return [s.revision||0,s.collected||0,s.delivered||0];}),(data.schematics||[]).map(n=>{const s=schematics[n.id]||{};return [s.revision||0,s.status||'pending'];})]);}
export function allocationRows(data,state,schematics={},plan={},ignoreCrystals=true){
 const fleet=plan.fleet||4,stage=plan.stage||'all',lines=new Map((plan.lines||[]).map(n=>[n.id,n.quantity]));
 return gatheringPlan(data,state,fleet,stage,schematics,ignoreCrystals).map(n=>{const requested=lines.get(n.id)||0,retainer=Math.min(n.quantity,requested);return {...n,timed:timedRetainerMaterial(data,n.name),retainer,self:n.quantity-retainer,overbooked:Math.max(0,requested-retainer)};});
}
export function recommendAllocation(data,state,schematics={},fleet=4,stage='all'){
 const steps=data.route.steps.filter(s=>stage==='all'||stage==='upgrade'&&s.id!=='start'||s.id===stage),phaseGoals=new Map(steps.map(s=>[s.id,{}]));
 for(const i of data.items){let credit=Math.max(0,(state[i.id]?.collected||0)-stepOffset(i,stage));for(const s of steps){const need=(i.stepNeeds[s.id]||0)*fleet/4,taken=Math.min(need,credit);credit-=taken;if(need>taken)phaseGoals.get(s.id)[i.name]=need-taken;}}
 const next=steps.find(s=>Object.keys(phaseGoals.get(s.id)).length),urgent=next?Object.fromEntries(simulateCraft(data,craftPool(data,state,schematics),phaseGoals.get(next.id)).missing.map(n=>[n.name,n.quantity])):{},rows=gatheringPlan(data,state,fleet,stage,schematics,true),lines=[];
 for(const n of rows){const self=timedRetainerMaterial(data,n.name)?0:Math.min(n.quantity,(urgent[n.name]||0)+n.reserved),quantity=n.quantity-self;if(quantity>0)lines.push({id:n.id,quantity});}
 return {fleet,stage,lines,nextStep:next?.label||'目前工房成品已備齊',fingerprint:allocationFingerprint(data,state,schematics)};
}
export function validateAllocation(data,state,schematics,plan){
 if(!Number.isInteger(plan.fleet)||plan.fleet<1||plan.fleet>4||!['all','start','upgrade','to1121','to3113','to1123','to3124'].includes(plan.stage)||!Array.isArray(plan.lines)||plan.lines.length>data.inventoryNodes.length)throw Error('請選有效的船數、階段與材料清單');
 const allowed=new Map(gatheringPlan(data,state,plan.fleet,plan.stage,schematics,true).map(n=>[n.id,n.quantity])),seen=new Set();
 for(const l of plan.lines){if(seen.has(l.id)||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>(allowed.get(l.id)||0))throw Error('僱員數量不可超過最新缺額，且只能安排可採集原料');seen.add(l.id);}
 for(const n of gatheringPlan(data,state,plan.fleet,plan.stage,schematics,true))if(timedRetainerMaterial(data,n.name)&&plan.lines.find(l=>l.id===n.id)?.quantity!==n.quantity)throw Error('限時材料固定由僱員負責，請保留完整缺額');
 return true;
}
