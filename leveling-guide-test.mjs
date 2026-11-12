import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {voyageMetrics,voyageBuild} from './voyage-reference.mjs';
import {voyageGuideAdvice} from './route-advice.mjs';
const data=JSON.parse(await fs.readFile('data/voyage-reference.json','utf8')),guide=JSON.parse(await fs.readFile('leveling-guide.json','utf8'));
for(let rank=1;rank<=85;rank++){
 const stages=guide.stages.filter(s=>rank>=s.from&&rank<=s.to);assert.equal(stages.length,1,`Rank ${rank} must be covered exactly once`);
 const s=stages[0],m=voyageMetrics(data,rank,s.build,s.map,s.points);assert(m.valid,`${rank} ${s.points} cannot be reached`);assert(s.points.length<=5);assert(m.seconds>=43200);
 for(const chain of s.unlockChains)for(let i=1;i<chain.length;i++){const n=data.sectors.find(n=>n.map===s.map&&n.code===chain[i]),p=data.sectors.find(n=>n.map===s.map&&n.code===chain[i-1]);assert.equal(n.parent,p.id);}
}
assert.equal(voyageBuild(data,15,'1121').valid,true);assert.equal(voyageBuild(data,24,'3113').valid,false);
assert.equal(voyageMetrics(data,85,'3124',1,['O','J']).distance,59);assert.equal(voyageMetrics(data,20,'1111',1,['I','K','J']).valid,false,'1111 cannot run IKJ');
const advice=(rank,code,progress=2,nextKnown=false)=>voyageGuideAdvice(data,guide,{rank,code,progress,nextKnown,registered:true});
assert.equal(advice(19,'1111').target,'1111');assert.equal(advice(20,'1111').target,'1121');assert.equal(advice(25,'1121').target,'3113');
assert.equal(advice(50,'3113',20).target,'3113');assert.equal(advice(50,'3113',20).stage.map,1,'no gray route before gray is discovered');
assert.equal(advice(50,'3113',30,true).target,'1123');assert.equal(advice(50,'1123',32).stage.map,2);
assert.equal(advice(85,'3124',15).ojReady,true);assert.equal(advice(85,'3124',5).ojReady,false);assert.equal(advice(1,'3333').valid,false);
assert.equal(advice(20,'1121',5,true).explore.code,'J');assert.equal(advice(19,'1111',5,true).explore,null);
assert.throws(()=>advice(20,'12a4'));assert.throws(()=>advice(100,'1111'));assert.throws(()=>advice(20,'1111',999));
console.log('Passed: every Rank 1–85 covered once, ordinary gear/capacity/range/5-stop limits, exact prerequisite chains, 15-vs-20 swap distinction, gray-sea gate, custom configuration validation and OJ prerequisites.');
