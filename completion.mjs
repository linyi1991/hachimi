import {unlockReservation} from './unlock.mjs';
// Record only the immediate recipe actually crafted; never invent upstream crafts.
export function completionPlan(data,state,schematics,id,quantity,personalCrystals=false){
 const output=data.inventoryNodes.find(n=>n.id===id),recipe=output&&data.recipes[output.name];
 if(!recipe||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||quantity%recipe.yield)throw Error('請填配方整批產出的成品數量，每次產出 '+(recipe?.yield||1)+' 個。');
 const current=state[id]||{},after=(current.collected||0)+quantity;if(after>1000000)throw Error('成品庫存超過可記錄上限。');
 const lock=unlockReservation(data,state,schematics).held,batches=quantity/recipe.yield;
 const inputs=Object.entries(recipe.items).map(([name,q])=>{const n=data.inventoryNodes.find(n=>n.name===name);if(!n)throw Error('配方材料資料不完整。');const s=state[n.id]||{},physical=Math.max(0,(s.collected||0)-(s.delivered||0)),held=(n.direct?Math.min(physical,Math.max(0,n.total-(s.delivered||0))):0)+(lock[name]||0),free=Math.max(0,physical-held),amount=q*batches,personal=personalCrystals&&/碎晶|水晶|晶簇/.test(name);return {id:n.id,name,amount,physical,held,free,personal,short:personal?0:Math.max(0,amount-free)};});
 return {id,name:output.name,quantity,batches,yield:recipe.yield,before:current.collected||0,after,inputs,ok:inputs.every(n=>!n.short)};
}

// Resolve an explicitly chosen physical-total entry into one additional craft.
export function completionEntry(data,state,schematics,id,entered,mode='total',personalCrystals=false){
 if(!['total','added'].includes(mode)||!Number.isSafeInteger(entered)||entered<0||entered>1000000)throw Error('請填 0～1,000,000 的整數數量。');
 const current=state[id]||{},physical=Math.max(0,(current.collected||0)-(current.delivered||0)),quantity=mode==='total'?entered-physical:entered;
 if(mode==='total'&&quantity<0)throw Error('做完後總量低於目前庫存。若要修正誤填數量，請用「盤點更正」，不要記錄製作。');
 if(!quantity)throw Error(mode==='total'?'目前庫存已是這個總量，不用再增加成品或扣料。':'請填這次新做出的數量。');
 const plan=completionPlan(data,state,schematics,id,quantity,personalCrystals);
 return {...plan,mode,entered,beforePhysical:physical,afterPhysical:physical+quantity,delivered:current.delivered||0};
}
