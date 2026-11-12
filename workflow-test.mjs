import {completionEntry} from './completion.mjs';
import {allocationFingerprint} from './allocation.mjs';
import {exchangeOptions,exchangeKinds} from './exchange.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {DatabaseSync} from 'node:sqlite';import {pbkdf2Sync} from 'node:crypto';
import app from './dist/server/index.js';import {unlockReservation} from './unlock.mjs';import {craftPool,craftCapacity} from './craft.mjs';import {calculatePlan} from './plan.mjs';import {collaboration,fleetRequired,stepOffset} from './collaboration.mjs';
const data=JSON.parse(await fs.readFile('data.json','utf8')),migrations=await Promise.all(['0000_progress','0001_collaboration','0002_schematic_reservations','0003_explicit_claims'].map(n=>fs.readFile('drizzle/'+n+'.sql','utf8')));
const accounts=['哈沁咪','浮光若水'].map(username=>({username,salt:Buffer.from('local-test-salt-'+username).toString('base64url'),hash:pbkdf2Sync('test-password',Buffer.from('local-test-salt-'+username),100000,32,'sha256').toString('base64url')}));
function adapter(db){let queue=Promise.resolve();return {prepare(sql){let args=[];return {bind(...a){assert(a.length<=100,"D1 parameter limit");args=a;return this;},async run(){return db.prepare(sql).run(...args);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};},async batch(statements){const previous=queue;let release;queue=new Promise(r=>release=r);await previous;db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}finally{release();}}};}
async function fixture(){const db=new DatabaseSync(':memory:');for(const m of migrations)db.exec(m);const env={DB:adapter(db),EDIT_ACCOUNTS:JSON.stringify(accounts),SESSION_SECRET:'test-workflow-signing-secret'};const call=async(path,method='GET',body,session)=>{const r=await app.fetch(new Request('https://api.example'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,body:await r.json()};};const session=(await call('/api/login','POST',{username:'哈沁咪',password:'test-password'})).body.session,second=(await call('/api/login','POST',{username:'浮光若水',password:'test-password'})).body.session;const node=name=>data.inventoryNodes.find(n=>n.name===name),seed=(name,qty)=>db.prepare('INSERT INTO progress(item_id,collected) VALUES (?,?) ON CONFLICT(item_id) DO UPDATE SET collected=excluded.collected').run(node(name).id,qty),stock=name=>db.prepare('SELECT * FROM progress WHERE item_id=?').get(node(name).id),state=async()=> (await call('/api/state','GET',null,session)).body,pay=(id,revision,stockRevisions)=>call('/api/schematic','POST',{id,action:'pay',revision,stockRevisions},session);return {db,env,call,session,second,node,seed,stock,state,pay};}
const pending=unlockReservation(data,{},{});assert.deepEqual(pending.roots,{'紅木木材':6,'輕木廢材':14,'竹片':8,'輕木木材':10,'合成纖維':14});assert.equal(pending.required['紅木原木'],18);assert.equal(pending.required['風之碎晶'],30);
const find=n=>data.inventoryNodes.find(x=>x.name===n).id;const physical={[find('紅木原木')]:{collected:18},[find('風之碎晶')]:{collected:40},[find('胡桃原木')]:{collected:100}};const reserved=unlockReservation(data,physical);assert.equal(reserved.held['風之碎晶'],30);assert.equal(craftPool(data,physical)['風之碎晶'],10);assert.equal(craftCapacity(data,craftPool(data,physical),'胡桃木材').chain,5);
for(const fleet of [1,2,3,4])assert.equal(calculatePlan(data,physical,fleet).find(n=>n.name==='風之碎晶').unlockHeld,30);
assert.equal(craftPool(data,physical,{'sub-I':{status:'known'}})['風之碎晶'],40);
const fullWood={...physical,[find('紅木木材')]:{collected:6}};assert.equal(craftPool(data,fullWood)['紅木木材'],0);assert.equal(craftPool(data,fullWood)['風之碎晶'],40);
const f=await fixture();const patch=(id,collected,revision=0)=>({id,collected,delivered:0,owner:'',note:'',revision,partner_target:0,partner_done:0});f.seed('風之碎晶',40);f.seed('紅木原木',18);assert.equal((await f.call('/api/item','PATCH',patch(find('風之碎晶'),29),f.session)).status,422);assert.equal(f.stock('風之碎晶').collected,40);
f.seed('紅木木材',5);assert.equal((await f.pay('sub-I',0,{u001:0})).status,409);assert.equal(f.stock('紅木木材').collected,5);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM schematic_events').get().n,0);
f.seed('紅木木材',6);assert.equal((await f.call('/api/schematic','POST',{id:'sub-I',action:'pay',revision:0,stockRevisions:{u001:0}})).status,403);assert.equal((await f.pay('sub-I',0,{u001:1})).status,409);
assert.equal((await f.call('/api/schematic','POST',{id:'sub-I',action:'existing',revision:0},f.session)).status,200);assert.equal(f.stock('紅木木材').collected,6);assert.equal((await f.pay('sub-I',1,{u001:0})).status,409);
assert.equal((await f.call('/api/schematic','POST',{id:'sub-I',action:'reset',revision:1},f.session)).status,200);assert.equal((await f.pay('sub-I',2,{u001:0})).status,200);assert.equal(f.stock('紅木木材').collected,0);assert.equal((await f.pay('sub-I',3,{u001:1})).status,409);assert.equal(f.stock('紅木木材').collected,0);
f.seed('輕木廢材',14);f.seed('竹片',8);f.seed('合成纖維',14);assert.equal((await f.pay('sub-II',0,{u002:0,u003:0})).status,200);assert.equal(f.stock('輕木廢材').collected,4);assert.equal(f.stock('竹片').collected,4);assert.equal((await f.pay('sub-IV',0,{u002:0,u005:0})).status,409);assert.equal(f.stock('輕木廢材').collected,4);assert.equal((await f.pay('sub-IV',0,{u002:1,u005:0})).status,200);assert.equal(f.stock('輕木廢材').collected,0);assert.equal(f.stock('合成纖維').collected,0);
const ss=await f.state(),stockMap=Object.fromEntries(ss.items.map(x=>[x.item_id,x])),planMap=Object.fromEntries(ss.schematics.map(x=>[x.schematic_id,x]));assert.equal(unlockReservation(data,stockMap,planMap).held['竹片'],4);
f.seed('輕木木材',10);const original=f.env.DB,eventsBefore=f.db.prepare('SELECT COUNT(*) AS n FROM schematic_events').get().n;f.env.DB={...original,async batch(statements){f.db.exec('BEGIN');try{await statements[0].run();throw Error('test storage failure');}finally{f.db.exec('ROLLBACK');}}};assert.equal((await f.pay('sub-III',0,{u004:0,u003:1})).status,503);assert.equal(f.stock('竹片').collected,4);assert.equal(f.stock('輕木木材').collected,10);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM schematic_events').get().n,eventsBefore);f.env.DB=original;
assert.equal((await f.call('/api/calculation','POST',{fleet:2,stage:'to1121',revision:0},f.session)).status,200);assert.equal((await f.state()).calculation.fleet,2);assert.equal((await f.call('/api/state','GET',null,f.second)).body.calculation,null);assert.equal((await f.call('/api/calculation','POST',{fleet:4,stage:'start',revision:0},f.second)).status,200);assert.equal((await f.state()).calculation.stage,'to1121');assert.equal((await f.call('/api/calculation','POST',{fleet:3,stage:'all',revision:0},f.session)).status,409);assert.equal((await f.call('/api/calculation','POST',{fleet:9,stage:'all',revision:1},f.session)).status,400);
assert((await f.call('/api/search?q='+encodeURIComponent('胡桃 第四頁'),'GET',null,f.session)).body.items.some(n=>n.name==='胡桃木材'));assert((await f.call('/api/search?q=walnut','GET',null,f.session)).body.items.some(n=>n.name==='胡桃木材'));
assert.equal((await f.call('/api/comments','POST',{item:find('風之碎晶'),author:'浮光若水',quantity:7,location:'部隊倉庫第2頁 第3格',body:'解鎖用，禁止挪用'},f.session)).status,200);const result=(await f.call('/api/search?q='+encodeURIComponent('風之碎晶 第三格'),'GET',null,f.session)).body.items;assert.equal(result.length,1);assert(result[0].messages[0].location.includes('第3格'));
const h=await fixture();h.seed('胡桃木材',10);const prior=data.items.filter(i=>i.stepNeeds.start>0),revs=Object.fromEntries(prior.map(i=>[i.id,0]));assert.equal((await h.call('/api/history','POST',{before:'to1121',fleet:1,revisions:revs},h.session)).status,200);const walnut=h.stock('胡桃木材');assert.equal(walnut.collected,28);assert.equal(walnut.delivered,18);assert.equal(walnut.history_delivered,18);assert.equal(walnut.collected-walnut.delivered,10);const c=collaboration(data.items.find(i=>i.name==='胡桃木材'),walnut);assert.equal(c.people.reduce((n,p)=>n+p.done,0),10);assert.equal(c.people.reduce((n,p)=>n+p.target,0)+c.unclaimed,150);
assert.equal((await h.call('/api/history','POST',{before:'to1121',fleet:1,revisions:revs},h.session)).status,409);assert.equal(h.stock('胡桃木材').collected,28);
const race=await fixture();race.seed('風之碎晶',40);await race.call('/api/schematic','POST',{id:'sub-I',action:'existing',revision:0},race.session);
const baseRace=race.env.DB;let raced=false;race.env.DB={...baseRace,prepare(sql){const stmt=baseRace.prepare(sql);if(sql.startsWith('UPDATE progress SET collected=')){const first=stmt.first;stmt.first=async()=>{if(!raced){raced=true;race.db.prepare("UPDATE schematic_progress SET status='pending',revision=revision+1 WHERE schematic_id='sub-I'").run();}return first();};}return stmt;}};
assert.equal((await race.call('/api/item','PATCH',patch(find('風之碎晶'),0),race.session)).status,409,'reservation dependency races must refuse the write');assert.equal(race.stock('風之碎晶').collected,40);
const hand=await fixture(),first=data.items.filter(i=>i.stepNeeds.start>0),handRevs=Object.fromEntries(first.map(i=>[i.id,0]));
for(const i of first)hand.seed(i.name,i.stepNeeds.start/4);
hand.seed('風之碎晶',70);
const handReq={action:'deliver',before:'start',fleet:1,revisions:handRevs};
hand.seed(first[0].name,first[0].stepNeeds.start/4-1);
assert.equal((await hand.call('/api/history','POST',handReq,hand.session)).status,409);
assert.equal(hand.stock(first[1].name).delivered,0,'shortfall must not partially hand in');
hand.seed(first[0].name,first[0].stepNeeds.start/4);
assert.equal((await hand.call('/api/history','POST',handReq,hand.session)).status,200);
assert.equal(hand.stock('胡桃木材').collected,18);assert.equal(hand.stock('胡桃木材').delivered,18);assert.equal(hand.stock('胡桃木材').history_delivered,0);
assert.equal(hand.stock('風之碎晶').collected,70,'finished hand-in cannot consume raw stock');
assert.equal((await hand.call('/api/history','POST',handReq,hand.session)).status,409);
assert.equal(hand.stock('胡桃木材').delivered,18);
const made=new Set();for(const step of data.route.steps){for(const name of step.add){assert(!made.has(name),'do not craft a reused part twice');made.add(name);}for(const name of step.keep)assert(made.has(name),name+' must already exist');}assert.equal(made.size,8);assert.equal(data.route.steps.find(s=>s.id==='to1123').add.length,0);
for(const i of data.items){assert.equal(Object.values(i.stepNeeds).reduce((a,b)=>a+b,0),i.total);assert.equal(fleetRequired(i,4,'to1121'),i.stepNeeds.to1121);}assert.equal(data.items.find(i=>i.name==='胡桃木材').total,168);assert.equal(data.items.find(i=>i.name==='胡桃木材').stepNeeds.to1121,0);assert.equal(stepOffset(data.items.find(i=>i.name==='胡桃木材'),'to3113'),72);
console.log('Passed: 4 one-off schematics, protected finished/raw stocks, fleet-independent reservations, atomic deductions, no double payment, stale-write refusal, rollback, account calculation persistence/isolation, name/location/comment search, historical completion without physical-stock loss, route part reuse, all phase/material reconciliations.');

const unclaimed=collaboration({total:192},{collected:0});assert.equal(unclaimed.mine,0);assert.equal(unclaimed.unclaimedLeft,192);assert.equal(unclaimed.people[0].target,0);
const requested=collaboration({total:192},{collected:70,partner_done:20,partner_target:80,self_claimed:1});assert.deepEqual(requested.people.map(p=>[p.target,p.done,p.left]),[[112,50,62],[80,20,60]]);assert.equal(requested.unclaimed,0);
for(const claimed of [0,1])for(const total of [0,70,192,230])for(const target of [0,80,192])for(const done of [0,Math.floor(total/2),total]){const a=collaboration({total:192},{self_claimed:claimed,collected:total,partner_done:done,partner_target:target});assert.equal(a.people.reduce((n,p)=>n+p.target,0)+a.unclaimed,192);assert.equal(a.mine+a.partner+a.unclaimedLeft,a.remaining);}
const claimTest=await fixture();assert.equal((await claimTest.call('/api/item','PATCH',{...patch(find('清漆'),70),partner_target:80,partner_done:20,self_claimed:1},claimTest.session)).status,200);assert.equal(claimTest.stock('清漆').self_claimed,1);assert.equal((await claimTest.call('/api/item','PATCH',{...patch(find('清漆'),70,1),partner_target:80,partner_done:20,self_claimed:9},claimTest.session)).status,400);
console.log('Passed: explicit remainder claims, unclaimed work, requested 192/70/122 example, surplus conservation and claim persistence.');

assert(exchangeKinds(data,'胡桃木材').some(e=>e.kind==='tribe'&&!e.indirect));assert(!exchangeKinds(data,'胡桃木材').some(e=>e.kind==='gc'));assert(exchangeKinds(data,'加隆德鋼').some(e=>e.kind==='gc'&&e.indirect));assert(exchangeOptions(data,'焦炭').filter(e=>e.kind==='gc').every(e=>e.cost.includes('200')));assert(data.acquisition['白鋼錠'].exchanges.some(e=>e.method==='金幣'&&e.cost.includes('258')));for(const a of Object.values(data.acquisition))for(const e of a.exchanges||[])assert(e.official.startsWith('https://na.finalfantasyxiv.com/lodestone/playguide/db/shop/'));console.log('Passed: direct vs ingredient exchange labels, verified GC prices, tribe Gil vs currency and official links.');
{
// Atomic completion uses authoritative immediate recipes, all-stock CAS and replay-safe receipts.
async function craftRequest(f,name,quantity,personalCrystals=false){const state=await f.state();return {id:find(name),quantity,personalCrystals,requestId:'craft-'+crypto.randomUUID(),revisions:Object.fromEntries(data.inventoryNodes.map(n=>[n.id,state.items.find(i=>i.item_id===n.id)?.revision||0])),schematicRevisions:Object.fromEntries(data.schematics.map(n=>[n.id,state.schematics.find(i=>i.schematic_id===n.id)?.revision||0]))};}
const made=await fixture();made.seed('胡桃原木',30);made.seed('風之碎晶',50);
let make=await craftRequest(made,'胡桃木材',4);assert.equal((await made.call('/api/craft-complete','POST',make)).status,403);
let done=await made.call('/api/craft-complete','POST',make,made.session);assert.equal(done.status,200);assert.equal(made.stock('胡桃木材').collected,4);assert.equal(made.stock('胡桃原木').collected,18);assert.equal(made.stock('風之碎晶').collected,42);
assert.equal((await made.call('/api/craft-complete','POST',make,made.session)).body.replayed,true);assert.equal(made.stock('胡桃原木').collected,18);assert.equal(made.stock('胡桃木材').collected,4);
assert.equal((await made.call('/api/craft-complete','POST',{...make,quantity:5},made.session)).status,409);
assert.equal((await made.call('/api/craft-complete','POST',make,made.second)).status,409);
make=await craftRequest(made,'胡桃木材',10);assert.equal((await made.call('/api/craft-complete','POST',make,made.session)).status,422);assert.equal(made.stock('胡桃木材').collected,4);
const blocked=await fixture();blocked.seed('風之碎晶',30);blocked.seed('胡桃原木',30);make=await craftRequest(blocked,'胡桃木材',1);assert.equal((await blocked.call('/api/craft-complete','POST',make,blocked.session)).status,422);assert.equal(blocked.stock('風之碎晶').collected,30);assert(!blocked.stock('胡桃木材'));
make=await craftRequest(blocked,'胡桃木材',1,true);assert.equal((await blocked.call('/api/craft-complete','POST',make,blocked.second)).status,200);assert.equal(blocked.stock('風之碎晶').collected,30);assert.equal(blocked.stock('胡桃木材').partner_done,1);
const nuggets=await fixture();nuggets.seed('玄鋼塊',84);nuggets.seed('火之水晶',100);make=await craftRequest(nuggets,'玄鋼鉚釘',1);assert.equal((await nuggets.call('/api/craft-complete','POST',make,nuggets.session)).status,422);
nuggets.seed('玄鋼塊',90);make=await craftRequest(nuggets,'玄鋼鉚釘',3);assert.equal((await nuggets.call('/api/craft-complete','POST',make,nuggets.session)).status,200);assert.equal(nuggets.stock('玄鋼塊').collected,87);assert.equal(nuggets.stock('玄鋼鉚釘').collected,3);assert.equal(nuggets.stock('火之水晶').collected,91);assert(!nuggets.stock('玄鐵礦'));
const concurrent=await fixture();concurrent.seed('胡桃原木',30);concurrent.seed('風之碎晶',50);const requestA=await craftRequest(concurrent,'胡桃木材',2),requestB=await craftRequest(concurrent,'胡桃木材',2);const raceResults=await Promise.all([concurrent.call('/api/craft-complete','POST',requestA,concurrent.session),concurrent.call('/api/craft-complete','POST',requestB,concurrent.second)]);assert.deepEqual(raceResults.map(r=>r.status).sort(),[200,409]);assert.equal(concurrent.stock('胡桃木材').collected,2);
const retry=await fixture();retry.seed('胡桃原木',30);retry.seed('風之碎晶',50);const retryRequest=await craftRequest(retry,'胡桃木材',2);assert.deepEqual((await Promise.all([retry.call('/api/craft-complete','POST',retryRequest,retry.session),retry.call('/api/craft-complete','POST',retryRequest,retry.session)])).map(r=>r.status),[200,200]);assert.equal(retry.stock('胡桃木材').collected,2);assert.equal(retry.stock('胡桃原木').collected,24);
const rollback=await fixture();rollback.seed('胡桃原木',30);rollback.seed('風之碎晶',50);const rbRequest=await craftRequest(rollback,'胡桃木材',1),realDB=rollback.env.DB;rollback.env.DB={...realDB,async batch(statements){rollback.db.exec('BEGIN');try{await statements[0].run();await statements[1].run();throw Error('test interrupted transaction');}finally{rollback.db.exec('ROLLBACK');}}};assert.equal((await rollback.call('/api/craft-complete','POST',rbRequest,rollback.session)).status,503);assert.equal(rollback.stock('胡桃原木').collected,30);assert(!rollback.stock('胡桃木材'));rollback.env.DB=realDB;assert.equal((await rollback.call('/api/craft-complete','POST',rbRequest,rollback.session)).status,200);
const changed=await fixture();changed.seed('胡桃原木',30);changed.seed('風之碎晶',50);const staleRequest=await craftRequest(changed,'胡桃木材',1);changed.db.prepare('UPDATE progress SET revision=revision+1 WHERE item_id=?').run(find('風之碎晶'));assert.equal((await changed.call('/api/craft-complete','POST',staleRequest,changed.session)).status,409);assert(!changed.stock('胡桃木材'));
const yieldRecipe=data.inventoryNodes.find(n=>data.recipes[n.name]?.yield>1);if(yieldRecipe){const q=await craftRequest(changed,yieldRecipe.name,1,true);assert.equal((await changed.call('/api/craft-complete','POST',q,changed.session)).status,400);}
console.log('Passed: completion auth, actual immediate consumption, output credit/attribution, crystal self-funding, mandatory reserves, atomic rollback, CAS races, duplicate concurrent/replayed requests and whole recipe yields.');

}
{
 const f=await fixture(),item=find('泡鹼');
 const claim=(session,revision,action='claim')=>f.call('/api/material-claim','POST',{id:item,revision,action},session);
 assert.equal((await claim(undefined,0)).status,403);
 const results=await Promise.all([claim(f.session,0),claim(f.second,0)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const winner=results[0].status===200?f.session:f.second,loser=winner===f.session?f.second:f.session;
 const stock=f.stock('泡鹼');assert.equal(stock.collected,0);assert.equal(stock.delivered,0);assert.equal(stock.revision,1);
 assert.equal((await claim(loser,1,'release')).status,409);assert.equal((await claim(loser,1)).status,409);
 assert.equal((await claim(winner,1,'release')).status,200);assert.equal(f.stock('泡鹼').owner,'');
 f.seed('泡鹼',12);assert.equal((await claim(loser,2)).status,200);assert.equal(f.stock('泡鹼').collected,12);
 assert.equal((await f.call('/api/material-claim','POST',{id:find('胡桃木材'),revision:0,action:'claim'},winner)).status,400);
 const snapshot=await f.state();assert.equal(snapshot.items.find(n=>n.item_id===item).owner,f.stock('泡鹼').owner);
 console.log('Passed: material claims use signed-in identity, allow one winner, protect others claims, self-release, preserve quantities and expose shared responsibility.');
}
{
 const f=await fixture();f.seed('鈷鐵錠',527);const id=find('鈷鐵錠');
 assert.equal((await f.call('/api/inventory-correction','POST',{id,physical:74,revision:0})).status,403);
 assert.equal((await f.call('/api/inventory-correction','POST',{id,physical:74,revision:0},f.session)).status,200);assert.equal(f.stock('鈷鐵錠').collected,74);
 assert.equal((await f.call('/api/inventory-correction','POST',{id,physical:10,revision:0},f.second)).status,409);assert.equal(f.stock('鈷鐵錠').collected,74);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM history_events WHERE before_step='inventory-correction'").get().n,1);
 console.log('Passed: audited physical inventory correction can lower reserved stock, rejects stale/anonymous writes and leaves production protection intact.');
}
{
 const f=await fixture();f.seed('鈷鐵錠',527);f.seed('胡桃木材',20);f.db.prepare('UPDATE progress SET delivered=10,owner=? WHERE item_id=?').run('浮光若水',find('胡桃木材'));
 const body={requestId:'warehouse-'+crypto.randomUUID(),complete:false,items:[{id:find('鈷鐵錠'),physical:74,revision:0},{id:find('胡桃木材'),physical:7,revision:0}],misc:[{name:'雜項測試',physical:3}]};
 assert.equal((await f.call('/api/warehouse-import','POST',body)).status,403);assert.equal((await f.call('/api/warehouse-import','POST',body,f.session)).status,200);assert.equal(f.stock('鈷鐵錠').collected,74);assert.equal(f.stock('胡桃木材').collected,17);assert.equal(f.stock('胡桃木材').delivered,10);assert.equal(f.stock('胡桃木材').owner,'浮光若水');
 assert.equal((await f.call('/api/warehouse-import','POST',body,f.session)).body.replayed,true);assert.equal(f.stock('胡桃木材').collected,17);assert.equal((await f.call('/api/warehouse-import','GET',null,f.session)).body.receipt.misc[0].physical,3);
 const stale={...body,requestId:'warehouse-'+crypto.randomUUID()};assert.equal((await f.call('/api/warehouse-import','POST',stale,f.session)).status,409);assert.equal(f.stock('鈷鐵錠').collected,74);
 const snapshot=await f.state(),full={requestId:'warehouse-'+crypto.randomUUID(),complete:true,items:data.inventoryNodes.map(n=>({id:n.id,physical:0,revision:snapshot.items.find(x=>x.item_id===n.id)?.revision||0})),misc:[]};assert.equal((await f.call('/api/warehouse-import','POST',full,f.session)).status,200);assert.equal(f.stock('胡桃木材').collected,10);assert.equal(f.stock('胡桃木材').delivered,10);
 console.log('Passed: warehouse overwrite, all-material zeroing, preserved delivered/owner, authenticated misc history, backup, stale refusal and safe replay.');
}
// Plugin orders stay personal and cannot mutate stock or bypass stale writes.
{
const r=await fixture(),lines=[{id:r.node('鈷鐵錠').id,quantity:100}];r.seed('鈷鐵錠',74);const before=JSON.stringify((await r.state()).items);
assert.equal((await r.call('/api/retainer-plan')).status,403);assert.equal((await r.call('/api/retainer-plan','POST',{revision:0,lines})).status,403);
assert.equal((await r.call('/api/retainer-plan','POST',{revision:1,lines},r.session)).status,409);
const saved=await r.call('/api/retainer-plan','POST',{revision:0,lines},r.session);assert.equal(saved.status,200);assert.equal(saved.body.plan.revision,1);
assert.deepEqual((await r.call('/api/retainer-plan','GET',null,r.session)).body.plan.lines,lines);assert.deepEqual((await r.call('/api/retainer-plan','GET',null,r.second)).body.plan.lines,[]);
assert.equal((await r.call('/api/retainer-plan','POST',{revision:0,lines},r.session)).status,409);assert.equal((await r.call('/api/retainer-plan','POST',{revision:1,lines:[{id:lines[0].id,quantity:-1}]},r.session)).status,400);
assert.equal((await r.call('/api/retainer-plan','POST',{revision:0,lines:[]},r.second)).status,200);assert.deepEqual((await r.call('/api/retainer-plan','GET',null,r.session)).body.plan.lines,lines);
assert.equal((await r.call('/api/retainer-plan','POST',{revision:1,lines:[]},r.session)).status,200);assert.equal(JSON.stringify((await r.state()).items),before);
console.log('Passed: personal retainer orders persist across sessions, reject anonymous/invalid/stale writes, isolate accounts and never change physical inventory.');
}
// One shared gathering allocation across both accounts; no stock mutation.
{
const a=await fixture(),before=JSON.stringify((await a.state()).items);
assert.equal((await a.call('/api/gather-allocation','POST',{action:'analyze',revision:0,fleet:4,stage:'all'})).status,403);
const first=await a.call('/api/gather-allocation','POST',{action:'analyze',revision:0,fleet:4,stage:'all'},a.session);assert.equal(first.status,200);assert(first.body.plan.lines.length);assert.equal(first.body.plan.revision,1);
const other=(await a.call('/api/state','GET',null,a.second)).body.dispatch;assert.deepEqual(other,first.body.plan);assert.equal((await a.call('/api/state')).status,403);
assert.equal((await a.call('/api/gather-allocation','POST',{action:'analyze',revision:0,fleet:4,stage:'all'},a.second)).status,409);
const plan=first.body.plan;assert.equal((await a.call('/api/gather-allocation','POST',{action:'adjust',revision:1,fleet:4,stage:'all',fingerprint:plan.fingerprint,lines:[{id:a.node('胡桃木材').id,quantity:1}]},a.second)).status,400);
const canceled=await a.call('/api/gather-allocation','POST',{action:'cancel',revision:1,fleet:4,stage:'all',fingerprint:plan.fingerprint},a.second);assert.equal(canceled.status,200);assert(canceled.body.plan.lines.length>0);assert(canceled.body.plan.lines.every(l=>data.timedGathering[data.inventoryNodes.find(n=>n.id===l.id).name]));assert.equal(JSON.stringify((await a.state()).items),before);
a.seed('胡桃原木',10);assert.notEqual((await a.state()).dispatch.fingerprint,allocationFingerprint(data,Object.fromEntries((await a.state()).items.map(n=>[n.item_id,n])),{}));
assert.equal((await a.call('/api/gather-allocation','POST',{action:'cancel',revision:2,fleet:4,stage:'all',fingerprint:plan.fingerprint},a.second)).status,409);
assert.equal((await a.call('/api/gather-allocation','POST',{action:'analyze',revision:2,fleet:4,stage:'all'},a.second)).status,200);
assert.equal(a.stock('胡桃原木').collected,10);
console.log('Passed: authenticated one-click analysis, shared visibility, stale/conflicting refusal, non-gatherable exclusion, cancellation, CSV-style stock invalidation and no inventory changes.');
}

{const a=await fixture();const found=await a.call('/api/search?q='+encodeURIComponent('發泡水'),'GET',null,a.session);assert.equal(found.status,200);assert(found.body.items.some(n=>n.name==='氣泡水'));assert(!found.body.items.some(n=>n.name==='發泡水'));}
// Screenshot regression: physical total 528 is only +375, never +528.
{
const a=await fixture();a.seed('玫瑰金塊',153);a.seed('金礦',1389);a.seed('銅礦',573);const s=await a.state(),stock=Object.fromEntries(s.items.map(n=>[n.item_id,n])),plan=completionEntry(data,stock,{},a.node('玫瑰金塊').id,528,'total',true),body={id:plan.id,quantity:plan.quantity,personalCrystals:true,requestId:'craft-'+crypto.randomUUID(),revisions:Object.fromEntries(data.inventoryNodes.map(n=>[n.id,stock[n.id]?.revision||0])),schematicRevisions:Object.fromEntries(data.schematics.map(n=>[n.id,0]))};
assert.equal(plan.quantity,375);const result=await a.call('/api/craft-complete','POST',body,a.session);assert.equal(result.status,200);assert.equal(a.stock('玫瑰金塊').collected,528);assert.equal(a.stock('金礦').collected,264);assert.equal(a.stock('銅礦').collected,198);assert.equal((await a.call('/api/craft-complete','POST',body,a.session)).status,200);assert.equal(a.stock('玫瑰金塊').collected,528);
console.log('Passed: total-mode quantity records exactly 528, consumes only the +375 batch, and retries never duplicate the completion.');
}
