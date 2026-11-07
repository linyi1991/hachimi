import {craftPool} from './craft.mjs';
import {fleetRequired,stepOffset} from './collaboration.mjs';
export function preparationPlan(data,state,fleet=4,stage='all',schematics={}){
 const pool=craftPool(data,state,schematics),demand={},rows=[];
 for(const n of data.inventoryNodes){const i=data.items.find(i=>i.id===n.id),s=state[n.id]||{},target=i?fleetRequired(i,fleet,stage):0,credit=i?Math.min(target,Math.max(0,(s.collected||0)-stepOffset(i,stage))):0,need=target-credit+(demand[n.name]||0),available=pool[n.name]||0,short=Math.max(0,need-available),recipe=data.recipes[n.name],batches=recipe?Math.ceil(short/recipe.yield):0;
 rows.push({...n,need,available,short,batches});if(recipe)for(const[name,q]of Object.entries(recipe.items))demand[name]=(demand[name]||0)+batches*q;
 }return rows;
}
