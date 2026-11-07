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
