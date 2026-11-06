// Schematic costs are one-off FC costs, independent of fleet size.
export function unlockPending(data,schematics={}){return (data.schematics||[]).filter(s=>!['known','paid'].includes(schematics[s.id]?.status));}
export function unlockReservation(data,state,schematics={}){
 const roots={},demand={},held={},required={},short={},batches={};
 for(const s of unlockPending(data,schematics))for(const[name,q]of Object.entries(s.materials))roots[name]=(roots[name]||0)+q;
 Object.assign(demand,roots);
 for(const n of data.inventoryNodes){const qty=demand[n.name]||0;if(!qty)continue;const s=state[n.id]||{},available=Math.max(0,(s.collected||0)-(s.delivered||0)),partReserve=n.direct?Math.max(0,n.total-(s.delivered||0)):0,free=Math.max(0,available-partReserve),keep=Math.min(free,qty),missing=Math.max(0,qty-keep);required[n.name]=qty;held[n.name]=keep;short[n.name]=missing;
  const recipe=data.recipes[n.name];if(missing&&recipe){const times=Math.ceil(missing/recipe.yield);batches[n.name]=times;for(const[name,q]of Object.entries(recipe.items))demand[name]=(demand[name]||0)+times*q;}
 }
 return {roots,held,required,short,batches};
}
