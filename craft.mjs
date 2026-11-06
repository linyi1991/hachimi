import {unlockReservation} from './unlock.mjs';
// Stock is always current unused stock. Direct hand-in items are protected for four subs.
export function craftPool(data,state,schematics={}){const lock=unlockReservation(data,state,schematics).held;return Object.fromEntries(data.inventoryNodes.map(n=>{const s=state[n.id]||{},available=Math.max(0,(s.collected||0)-(s.delivered||0)),reserved=n.direct?Math.max(0,n.total-(s.delivered||0)):0;return [n.name,Math.max(0,available-reserved-(lock[n.name]||0))];}));}
// Aggregate every upstream demand before consuming any shared ingredient.
export function simulateCraft(data,pool,goals){
 const next={...pool},demand={},steps=[],missing=[];
 for(const[name,qty]of Object.entries(goals))if(!data.recipes[name]||!Number.isSafeInteger(qty)||qty<0||qty>1000000)throw Error('製作量不正確');
 for(const n of data.inventoryNodes){const goal=goals[n.name]||0,need=demand[n.name]||0,have=next[n.name]||0,used=Math.min(have,need),short=Math.max(0,need-used)+goal;next[n.name]=have-used;
  if(!short)continue;const recipe=data.recipes[n.name];if(!recipe){missing.push({name:n.name,quantity:short});continue;}
  const batches=Math.ceil(short/recipe.yield),made=batches*recipe.yield;next[n.name]+=made-short;
  steps.push({name:n.name,batches,made,goal,forIngredients:short-goal});
  for(const[name,qty]of Object.entries(recipe.items))demand[name]=(demand[name]||0)+batches*qty;
 }
 return {ok:missing.length===0,pool:next,steps,missing};
}
export function craftCapacity(data,pool,name){
 const r=data.recipes[name];if(!r)return {direct:0,chain:0};
 const direct=Math.min(...Object.entries(r.items).map(([n,q])=>Math.floor((pool[n]||0)/q)))*r.yield;
 // Whole batches only; bound outputs to the inventory entry limit.
 const limit=Math.floor(1000000/r.yield);let low=0,high=1;
 while(high<limit&&simulateCraft(data,pool,{[name]:high*r.yield}).ok){low=high;high=Math.min(limit,high*2);}
 while(low<high){const mid=Math.ceil((low+high)/2);if(simulateCraft(data,pool,{[name]:mid*r.yield}).ok)low=mid;else high=mid-1;}
 return {direct,chain:low*r.yield};
}
export function craftBatch(data,state,priority,schematics={}){let pool=craftPool(data,state,schematics);const ordered=[...data.items];if(priority){const idx=ordered.findIndex(n=>n.name===priority);if(idx>0)ordered.unshift(ordered.splice(idx,1)[0]);}const rows=[],production={};
 for(const i of ordered){const need=Math.max(0,i.total-(state[i.id]?.collected||0));if(!need){rows.push({name:i.name,quantity:0,batches:0,need:0,left:0});continue;}const capacity=craftCapacity(data,pool,i.name).chain,qty=Math.min(need,capacity);if(!qty){rows.push({name:i.name,quantity:0,batches:0,need,left:need});continue;}
 const trial=simulateCraft(data,pool,{[i.name]:qty});if(!trial.ok)throw Error('批次分配失敗');pool=trial.pool;for(const step of trial.steps){production[step.name]||={quantity:0,batches:0};production[step.name].quantity+=step.made;production[step.name].batches+=step.batches;}const step=trial.steps.find(s=>s.name===i.name);rows.push({name:i.name,quantity:step.made,batches:step.batches,need,left:Math.max(0,need-step.made)});
 }
 return {rows:rows.map(r=>({...r,handIn:Math.min(r.need,r.quantity),quantity:production[r.name]?.quantity||0,batches:production[r.name]?.batches||0})),pool,production};
}
