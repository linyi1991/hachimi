export function materialUses(data,name){
 const parents=item=>Object.entries(data.recipes).filter(([,r])=>r.items[item]).map(([output,r])=>({name:output,input:r.items[item],yield:r.yield}));
 const seen=new Set(),walk=item=>{if(seen.has(item))return;seen.add(item);for(const p of parents(item))walk(p.name);};walk(name);
 return {name,direct:parents(name),reachable:[...seen],parts:data.parts.filter(p=>Object.keys(p.ingredients).some(n=>seen.has(n))),schematics:(data.schematics||[]).filter(p=>Object.keys(p.materials).some(n=>seen.has(n)))};
}
