// Offline editorial verification, not a browser optimizer or a stock mutation.
// Time/distance model adapted from SubmarineTracker (MIT); see licenses/SubmarineTracker-MIT.txt.
export function voyageBuild(data,rank,code){
 const bonus=data.ranks.find(r=>r.rank===rank);
 if(!bonus||!/^\d{4}$/.test(code))throw Error('Invalid rank/build');
 const parts=[...code].map((f,slot)=>data.parts.find(p=>p.family===Number(f)&&p.slot===slot));
 if(parts.some(p=>!p))throw Error('Unknown part');
 const stats=Object.fromEntries(['surveillance','retrieval','speed','range','favor'].map(k=>[k,bonus[k]+parts.reduce((t,p)=>t+p[k],0)]));
 return {...stats,valid:parts.every(p=>p.rank<=rank)&&parts.reduce((t,p)=>t+p.capacity,0)<=bonus.capacity};
}
export function voyageLeg(a,b,speed){
 const length=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),v=Math.max(1,speed);
 return {distance:Math.floor(length*.035)+b.surveyDistance,seconds:Math.floor(length*3990/(v*100)*60)+Math.floor(b.surveyMinutes*7000/(v*100)*60)};
}
export function voyageMetrics(data,rank,code,map,points){
 const stats=voyageBuild(data,rank,code),list=points.map(c=>data.sectors.find(s=>s.map===map&&s.code===c&&!s.start));
 if(list.some(s=>!s)||new Set(points).size!==points.length||points.length<1||points.length>5)throw Error('Invalid route');
 let previous=data.sectors.find(s=>s.start&&s.map===map),distance=0,seconds=43200,exp=0,fuel=0;
 for(const s of list){const leg=voyageLeg(previous,s,stats.speed);distance+=leg.distance;seconds+=leg.seconds;exp+=s.exp;fuel+=s.fuel;previous=s;}
 const conservativeExp=list.reduce((t,s)=>t+Math.floor(s.exp*(stats.retrieval>=(s.breakpoint?.[3]??Infinity)?1.25:1)),0);
 return {distance,seconds,exp,conservativeExp,fuel,range:stats.range,valid:stats.valid&&list.every(s=>s.rank<=rank)&&distance<=stats.range};
}
// Search only the editor-declared pool. Every result is feasible; this does not claim a universal optimum.
export function editorialBestRoute(data,rank,code,map,allowed){
 const stats=voyageBuild(data,rank,code);if(!stats.valid)throw Error('Parts cannot be equipped');
 const sectors=data.sectors.filter(s=>s.map===map&&!s.start&&s.rank<=rank&&allowed.includes(s.code));
 const start=data.sectors.find(s=>s.start&&s.map===map),nodes=[start,...sectors],edges=nodes.map(a=>nodes.map(b=>voyageLeg(a,b,stats.speed)));
 let best=null;const stack=[];
 function visit(last,mask,distance,seconds,exp){
  for(let i=1;i<nodes.length;i++){
   const bit=2**(i-1);if(mask&bit)continue;const n=nodes[i],e=edges[last][i],d=distance+e.distance;if(d>stats.range)continue;
   const time=seconds+e.seconds,gain=exp+Math.floor(n.exp*(stats.retrieval>=(n.breakpoint?.[3]??Infinity)?1.25:1)),rate=gain/time;
   stack.push(n.code);
   if(!best||rate>best.rate||rate===best.rate&&time<best.seconds)best={points:[...stack],seconds:time,distance:d,rate};
   if(stack.length<5)visit(i,mask|bit,d,time,gain);
   stack.pop();
  }
 }
 visit(0,0,0,43200,0);return best;
}
