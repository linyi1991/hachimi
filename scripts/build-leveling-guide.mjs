import fs from 'node:fs/promises';
import {voyageMetrics} from '../voyage-reference.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/voyage-reference.json',import.meta.url),'utf8'));
// A practical progression using only the site's eight ordinary components.
// First-boat unlock instructions take priority over these repeat leveling routes.
const rows=[
 [1,3,'1111',1,'A B'],[4,6,'1111',1,'C B D'],[7,9,'1111',1,'E C F'],
 [10,13,'1111',1,'G E C'],[14,16,'1111',1,'G H'],[17,19,'1111',1,'I G H'],
 [20,23,'1121',1,'I K J'],[24,24,'1121',1,'I K L'],[25,26,'3113',1,'I K L'],
 [27,29,'3113',1,'I K N'],[30,33,'3113',1,'I M P'],[34,49,'3113',1,'I P Q'],
 [50,53,'1123',2,'A B'],[54,56,'1123',2,'B A C D'],[57,59,'1123',2,'B A C F D'],
 [60,69,'1123',2,'A C G F K'],[70,81,'1123',2,'A C F K T'],[82,84,'1123',2,'D G F K T'],
 [85,85,'3124',1,'O J']
];
const stages=rows.map(([from,to,build,map,route])=>{
 const points=route.split(' '),metrics=Array.from({length:to-from+1},(_,i)=>voyageMetrics(data,from+i,build,map,points));
 if(metrics.some(m=>!m.valid))throw Error(`Unreachable stage ${from}-${to}`);
 const sectors=points.map(code=>data.sectors.find(s=>s.map===map&&s.code===code));
 const chains=sectors.map(s=>{let chain=[s],p=s;while(p.parent!==null&&p.parent!==undefined){const next=data.sectors.find(n=>n.id===p.parent);if(!next||next.map!==map)break;chain.unshift(next);p=next;}return chain;});
 const leaves=chains.filter(c=>!chains.some(d=>d.length>c.length&&d.some(n=>n.id===c.at(-1).id)));
 return {from,to,build,map,points,names:sectors.map(s=>s.name),distance:metrics[0].distance,range:metrics[0].range,fuel:metrics[0].fuel,minSeconds:Math.min(...metrics.map(m=>m.seconds)),maxSeconds:Math.max(...metrics.map(m=>m.seconds)),unlockChains:leaves.map(c=>c.map(n=>n.code))};
});
const opening=[['B',1,'發現 E'],['E',7,'發現 J；J 到 20 級就去探索'],['J',20,'完成探索開第 2 艘，並發現 N'],['N',27,'發現 O'],['O',30,'完成探索開第 3 艘，並發現 S'],['S',37,'發現 T'],['T',40,'完成探索開第 4 艘，並發現 Y'],['Y',47,'發現 Z'],['Z',50,'發現 AA'],['AA',50,'發現 AB'],['AB',50,'發現 AD'],['AD',50,'進入灰海 A']].map(([code,rank,goal])=>({code,rank,goal,map:1}));
const guide={verifiedAt:'2026-11-13',tableCommit:data.tableCommit,formulaCommit:data.formulaCommit,model:'ordinary parts; exact rank/range/capacity checks for every covered rank; community time model including 12 hours; no 24/48 hour cap; no guaranteed drop or bonus',stages,opening};
await fs.writeFile(new URL('../leveling-guide.json',import.meta.url),JSON.stringify(guide,null,2)+'\n');
console.log(`Verified ${stages.length} route stages covering Rank 1–85; ordinary presets and five-stop/range limits.`);
