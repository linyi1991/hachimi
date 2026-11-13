import {validateVoyageProfiles,voyageEquippedParts} from './voyage-profiles.mjs';
import {craftPool} from './craft.mjs';
import {unlockReservation} from './unlock.mjs';
// Ordinary part IDs follow the game data: bow, bridge, hull, stern within each family.
export function voyageCodeParts(code){return [...code].map((f,slot)=>4*(Number(f)-1)+[3,4,1,2][slot]);}
export function voyagePartName(id){return ['', '鯊魚','甲鱟','鬚鯨','腔棘魚','希爾德拉'][Math.ceil(id/4)]+'級'+['船尾','船首','艦橋','船體'][id%4];}
export function nextSwapEquipment(data,value){
 const profiles=validateVoyageProfiles(value),codes=data.route.codes,gray=profiles.progress>=32||profiles.progress===30&&profiles.nextKnown;
 const equipped=voyageEquippedParts(profiles),owned={...profiles.completedParts};
 for(const [id,q] of Object.entries(equipped))owned[id]=Math.max(owned[id]||0,q);
 const boats=profiles.boats.map((b,index)=>{
  const recommended=b.rank>=85?'3124':b.rank>=50&&gray?'1123':b.rank>=25?'3113':b.rank>=20?'1121':'1111',at=codes.indexOf(b.code);
  // Never send a canonical boat backwards just because the Rank/map has not caught up.
  const next=!b.registered?'1111':at>=0?codes[Math.min(Math.max(at+1,codes.indexOf(recommended)),codes.length-1)]:recommended;
  return {...b,index,next,finished:b.registered&&b.code==='3124',minimumRank:Math.max(...voyageCodeParts(next).map(id=>({1:1,2:15,3:25,4:35,5:50})[Math.ceil(id/4)])),wait:next==='1123'?'Rank 50 且灰海已開，再換回舊件':next==='3124'?'建議 Rank 85 再換，接 O→J':next==='1121'?'建議 Rank 20 再換':next==='3113'?'Rank 25 再換':'先登記 1111'};
 });
 const desired={};for(const b of boats)for(const id of voyageCodeParts(b.next))desired[id]=(desired[id]||0)+1;
 const parts=Object.entries(desired).map(([key,quantity])=>{const id=Number(key),name=voyagePartName(id),recipe=data.parts.find(p=>p.name===name);return {id,name,quantity,owned:owned[id]||0,missing:Math.max(0,quantity-(owned[id]||0)),equipped:equipped[id]||0,recipe,boats:boats.filter(b=>voyageCodeParts(b.next).includes(id)).map(b=>b.index+1)};});
 if(parts.some(p=>p.missing&&!p.recipe))throw Error('這個配置所需零件還沒有完整配方，暫不顯示不完整的材料數量。');
 const direct={},uses={};for(const p of parts.filter(p=>p.missing))for(const [name,q]of Object.entries(p.recipe.ingredients)){direct[name]=(direct[name]||0)+q*p.missing;(uses[name]||=[]).push({name:p.name,quantity:q*p.missing,parts:p.missing});}
 return {profiles,boats,parts,owned,equipped,direct,uses,newParts:parts.reduce((sum,p)=>sum+p.missing,0)};
}
export function nextSwapMaterials(data,state,schematics,value,ignoreCrystals=false){
 const gear=nextSwapEquipment(data,value),locked=unlockReservation(data,state,schematics),pool=craftPool(data,state,schematics),demand={},uses={},rows=[];
 // Parents precede children. Aggregate shared ingredients before spending each stock once.
 for(const n of data.inventoryNodes){
  const s=state[n.id]||{},physical=Math.max(0,(s.collected||0)-(s.delivered||0)),goal=gear.direct[n.name]||0,unlockHeld=locked.held[n.name]||0,credit=Math.min(goal,Math.max(0,physical-unlockHeld)),processing=demand[n.name]||0,available=pool[n.name]||0,need=goal+processing,short=Math.max(0,goal-credit+processing-available),recipe=data.recipes[n.name],batches=recipe?Math.ceil(short/recipe.yield):0,crystal=/碎晶|水晶|晶簇/.test(n.name);
  rows.push({...n,physical,goal,credit,processing,need,available,short,batches,recipe,crystal,ignored:ignoreCrystals&&crystal,held:Math.max(0,physical-available),unlockHeld,uses:[...(gear.uses[n.name]||[]),...(uses[n.name]||[])],processingUses:uses[n.name]||[],forIngredients:processing,handInNeed:Math.max(0,goal-credit),processingShort:Math.max(0,processing-available)});
  if(batches)for(const [name,q]of Object.entries(recipe.items)){demand[name]=(demand[name]||0)+q*batches;(uses[name]||=[]).push({name:n.name,quantity:q*batches,output:batches*recipe.yield});}
 }
 return {...gear,rows,locked,finished:rows.filter(n=>n.goal).map(n=>({...n,need:n.goal,short:n.handInNeed,uses:gear.uses[n.name]||[]})),support:rows.filter(n=>n.processing).map(n=>({...n,need:n.processing,short:n.processingShort,uses:n.processingUses})),missing:rows.filter(n=>n.short&&!n.ignored),raw:rows.filter(n=>!n.recipe&&n.short&&!n.ignored)};
}
