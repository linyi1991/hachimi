import {preparationPlan} from './preparation.mjs';
import {unlockReservation} from './unlock.mjs';
import {fleetRequired,stepOffset} from './collaboration.mjs';
// One shared shortage calculation; phase views must never be added together.
export function gatheringPlan(data,state,fleet=4,stage='all',schematics={},ignoreCrystals=false){
 const plan=preparationPlan(data,state,fleet,stage,schematics),locked=unlockReservation(data,state,schematics),priority={},uses={};
 const visit=(name,rank,label,root,seen=new Set())=>{if(seen.has(name))return;seen.add(name);if(priority[name]===undefined||rank<priority[name].rank)priority[name]={rank,label};(uses[name]||=new Set()).add(root);const row=plan.find(n=>n.name===name);if(row?.short>0)for(const child of Object.keys(data.recipes[name]?.items||{}))visit(child,rank,label,root,new Set(seen));};
 for(const i of data.items){let credit=Math.max(0,(state[i.id]?.collected||0)-stepOffset(i,stage));for(const [rank,s]of data.route.steps.entries()){if(stage==='start'&&s.id!=='start'||stage==='upgrade'&&s.id==='start'||!['all','start','upgrade'].includes(stage)&&stage!==s.id)continue;const q=(i.stepNeeds?.[s.id]||0)*fleet/4,covered=Math.min(q,credit);credit-=covered;if(q>covered)visit(i.name,rank+1,s.label,i.name);}}
 return plan.flatMap(n=>{const sources=data.gathering?.[n.name];if(!sources?.length||data.recipes[n.name]||ignoreCrystals&&/碎晶|水晶|晶簇/.test(n.name))return [];const reserved=locked.short[n.name]||0,quantity=n.short+reserved;if(!quantity)return [];return [{...n,quantity,production:n.short,reserved,sources,priority:reserved?{rank:0,label:'設計圖解鎖・必留'}:priority[n.name]||{rank:9,label:'目前目標'},outputs:[...(uses[n.name]||[])],processingUses:n.processingUses}];}).sort((a,b)=>a.priority.rank-b.priority.rank||a.name.localeCompare(b.name,'zh-Hant'));
}
