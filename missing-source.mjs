// Read the existing verified acquisition data. No stock, demand or reservations are changed here.
export function missingSourceInfo(data,name,quantity=0){
 const special=data.specialSources?.[name],gathering=data.gathering?.[name]||[],exchanges=data.acquisition?.[name]?.exchanges||[],gc=exchanges.filter(e=>e.kind==='gc'),tribes=exchanges.filter(e=>e.kind==='tribe'),crystal=/碎晶|水晶|晶簇/.test(name),timed=!!data.timedGathering?.[name]&&!crystal;
 const kind=special?.kind||(gathering.length?(timed?'retainer':'gather'):gc.length?'gc':tribes.length?'tribe':crystal?'crystal':'lookup');
 const labels={exploration:'潛水艇探索帶回',drop:'打怪掉落',retainer:'限時素材・交給僱員',gather:'可以自己採集',gc:'軍票兌換',tribe:'友好部落',crystal:'水晶類',lookup:'查詢其他取得方式'};
 const regions=new Map([['Limsa Lominsa Upper Decks','利姆薩上層甲板'],['New Gridania','格里達尼亞新街'],["Ul'dah - Steps of Nald",'烏爾達哈現世回廊']]);
 for(const entries of Object.values(data.gathering||{}))for(const s of entries)if(s.areas?.length===1&&s.regions?.length===1)regions.set(s.areas[0],s.regions[0]);
 const translate=text=>{let result=text||'';for(const [from,to]of [...regions].sort((a,b)=>b[0].length-a[0].length))result=result.replaceAll(from,to);return result;};
 const vendors={'Storm Quartermaster':'黑渦團軍需官','Serpent Quartermaster':'雙蛇黨軍需官','Flame Quartermaster':'恆輝隊軍需官'};
 const shops=[...gc,...tribes].map(e=>({...e,displayVendor:vendors[e.vendor]||(e.tribe?e.tribe+'商店':'商店'),displayLocation:translate(e.location)}));
 const cost=gc[0]?.cost?.match(/每個\s*([\d,]+)\s*軍票/),unitSeals=cost?Number(cost[1].replaceAll(',','')):null;
 const places=[...new Set(gathering.flatMap(s=>(s.regions||[]).map(region=>region+'・'+s.job+' Lv.'+s.level)))];
 return {kind,label:labels[kind]||'取得方式',special,gathering,shops,gc,tribes,timed,places,unitSeals,totalSeals:unitSeals===null?null:unitSeals*quantity,search:[name,labels[kind],special?.label,special?.note,...places,...shops.map(s=>s.displayVendor+' '+s.displayLocation)].join(' ')};
}
export function missingSourceRows(data,model){
 const priorities=new Map((model.order||[]).map((n,index)=>[n.id,{index,phaseLabel:n.phaseLabel}]));
 return (model.rest||model.rows||[]).filter(n=>n.short>0&&!n.ignored&&!data.recipes[n.name]).map(n=>({...n,sourceInfo:missingSourceInfo(data,n.name,n.short),phaseLabel:priorities.get(n.id)?.phaseLabel||n.priority?.label||'目前目標',sourceOrder:priorities.get(n.id)?.index??999})).sort((a,b)=>a.sourceOrder-b.sourceOrder||a.name.localeCompare(b.name,'zh-Hant'));
}
