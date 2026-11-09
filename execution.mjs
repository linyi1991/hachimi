import {preparationPlan} from './preparation.mjs';
import {craftPool} from './craft.mjs';
import {completionPlan} from './completion.mjs';
export function craftExecutionPlan(data,state,schematics={},fleet=4,stage='all',personalCrystals=false){
 const virtual=structuredClone(state),steps=[];
 for(const n of [...data.inventoryNodes].reverse()){
  const recipe=data.recipes[n.name];if(!recipe)continue;const demand=preparationPlan(data,virtual,fleet,stage,schematics).find(i=>i.id===n.id),pool=craftPool(data,virtual,schematics,{ignoreCrystals:personalCrystals});
  const batches=Math.min(Math.ceil(demand.short/recipe.yield),Math.floor((1000000-(virtual[n.id]?.collected||0))/recipe.yield),...Object.entries(recipe.items).map(([name,q])=>Math.floor((pool[name]||0)/q)));if(!Number.isFinite(batches)||batches<=0)continue;
  const receipt=completionPlan(data,virtual,schematics,n.id,batches*recipe.yield,personalCrystals);if(!receipt.ok)throw Error('順序用料不足。');
  for(const input of receipt.inputs.filter(i=>!i.personal)){virtual[input.id]||={collected:0,delivered:0};virtual[input.id].collected-=input.amount;}virtual[n.id]||={collected:0,delivered:0};virtual[n.id].collected+=receipt.quantity;
  steps.push({...receipt,number:steps.length+1,workshop:n.direct});
 }return {steps,state:virtual};
}
