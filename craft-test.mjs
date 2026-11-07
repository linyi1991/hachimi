import {routeComparison} from './comparison.mjs';
import {materialUses} from './uses.mjs';
import {preparationPlan,preparationNeeded} from './preparation.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {craftPool,simulateCraft,craftCapacity,craftBatch,craftTree} from './craft.mjs';
const data=JSON.parse(await fs.readFile('data.json','utf8'));
const order=Object.fromEntries(data.inventoryNodes.map((n,i)=>[n.name,i]));for(const[name,r]of Object.entries(data.recipes))for(const ingredient of Object.keys(r.items)){assert(ingredient in order);assert(order[name]<order[ingredient],`${name} must precede ${ingredient}`);}
const known=Object.fromEntries(data.schematics.map(s=>[s.id,{status:'known'}]));
let state={};const put=(name,qty)=>{const n=data.inventoryNodes.find(n=>n.name===name);state[n.id]={collected:qty,delivered:0};};
put('胡桃原木',10);put('風之碎晶',7);assert.deepEqual(craftCapacity(data,craftPool(data,state,known),'胡桃木材'),{direct:3,chain:3});
put('風之碎晶',1);assert.equal(craftCapacity(data,craftPool(data,state,known),'胡桃木材').chain,0);
let woodTrial=simulateCraft(data,craftPool(data,state,known),{'胡桃木材':1});assert(woodTrial.missing.some(m=>m.name==='風之碎晶'&&m.quantity===1));
put('鈷鐵錠',600);assert.equal(craftPool(data,state,known)['鈷鐵錠'],0);put('鈷鐵錠',650);assert.equal(craftPool(data,state,known)['鈷鐵錠'],50);state[data.inventoryNodes.find(n=>n.name==='鈷鐵錠').id].delivered=100;assert.equal(craftPool(data,state,known)['鈷鐵錠'],50);
const nodes=[{id:'a',name:'A',total:1,direct:true},{id:'b',name:'B',total:1,direct:true},{id:'y',name:'Y',total:0},{id:'x',name:'X',total:0},{id:'ore',name:'Ore',total:0},{id:'fire',name:'Fire',total:0},{id:'water',name:'Water',total:0}];
const fixture={inventoryNodes:nodes,items:nodes.slice(0,2),recipes:{A:{yield:1,items:{X:1,Y:1}},B:{yield:1,items:{X:2}},X:{yield:2,items:{Ore:2,Fire:1}},Y:{yield:1,items:{X:1,Water:1}}}};
const stock={ore:{collected:2},fire:{collected:1},water:{collected:1}},pool=craftPool(fixture,stock),copy={...pool};assert.equal(craftCapacity(fixture,pool,'A').chain,1);assert.equal(craftCapacity(fixture,pool,'B').chain,1);assert.deepEqual(pool,copy);
const one=simulateCraft(fixture,pool,{A:1});assert(one.ok);assert.equal(one.steps.find(s=>s.name==='X').batches,1);assert.equal(one.pool.Ore,0);assert.equal(one.pool.Fire,0);assert.equal(one.pool.X,0);
assert(!simulateCraft(fixture,pool,{A:1,B:1}).ok);
let batch=craftBatch(fixture,stock);assert.equal(batch.rows[0].quantity,1);assert.equal(batch.rows[1].quantity,0);assert.equal(batch.pool.Ore,0);
batch=craftBatch(fixture,stock,'B');assert.equal(batch.rows[0].name,'B');assert.equal(batch.rows[0].quantity,1);assert.equal(batch.rows[1].quantity,0);
assert.equal(craftCapacity(fixture,{Ore:5,Fire:4},'X').chain,4);assert.equal(simulateCraft(fixture,{Ore:5,Fire:4},{X:3}).steps[0].made,4);
assert.throws(()=>simulateCraft(fixture,pool,{A:-1}));
console.log('Passed: crystal bottlenecks, protected hand-in stock, delivered-stock accounting, shared DAG demand aggregation, recipe yields, independent capacities, batch no-double-use, priority, no inventory mutation.');

const directIntermediate={...fixture,inventoryNodes:fixture.inventoryNodes.map(n=>n.name==='X'?{...n,direct:true,total:1}:n),items:[fixture.items[0],{id:'x',name:'X',total:1,direct:true}]};const xBatch=craftBatch(directIntermediate,{ore:{collected:4},fire:{collected:2},water:{collected:1}});assert.equal(xBatch.production.X.quantity,4);assert.equal(xBatch.rows.find(r=>r.name==='X').handIn,1);assert.equal(xBatch.rows.find(r=>r.name==='X').quantity,4);console.log('Passed: batch includes intermediate production separately from hand-in output.');

const beforeTree=structuredClone(stock),tree=craftTree(fixture,stock,'A',1);assert.equal(tree.capacity.chain,1);assert.equal(tree.nodes.X.need,2);assert.equal(tree.nodes.X.batches,1);assert.equal(tree.nodes.Ore.need,2);assert.deepEqual(tree.missing,[]);assert.deepEqual(stock,beforeTree);
const idOf=name=>data.inventoryNodes.find(n=>n.name===name).id,ironStock={[idOf('黑鐵錠')]:{collected:10},[idOf('火之碎晶')]:{collected:10}},ironTree=craftTree(data,ironStock,'黑鐵釘',12,known);
assert.equal(ironTree.capacity.chain,10);assert.equal(ironTree.nodes['黑鐵錠'].used,10);assert.equal(ironTree.nodes['黑鐵錠'].made,2);assert.equal(ironTree.nodes['火之碎晶'].need,14);assert.equal(ironTree.nodes['火之碎晶'].missing,4);assert.equal(ironTree.nodes['鐵礦'].missing,6);
console.log('Passed: material tree aggregates shared intermediates/crystals once, shows partial-stock deficits and preserves inventory.');

const prep=preparationPlan(fixture,stock,4);assert.equal(prep.find(n=>n.name==='Ore').need,4);assert.equal(prep.find(n=>n.name==='Ore').short,2);const finished={...stock,a:{collected:1},b:{collected:1}};assert.equal(preparationPlan(fixture,finished,4).find(n=>n.name==='Ore').short,0);console.log('Passed: full self-craft preparation aggregates shared raw demand and deducts finished inventory once.');

const crystalState={[idOf('黑鐵錠')]:{collected:10}};assert.equal(craftCapacity(data,craftPool(data,crystalState),'黑鐵釘').chain,0);assert.equal(craftCapacity(data,craftPool(data,crystalState,{}, {ignoreCrystals:true}),'黑鐵釘').chain,10);assert.equal(craftPool(data,crystalState,{}, {ignoreCrystals:true})['鐵礦'],0);assert.equal(crystalState[idOf('黑鐵錠')].collected,10);console.log('Passed: self-funded crystals remove only crystal bottlenecks and never alter stock or other shortages.');

const cokeUses=materialUses(data,'焦炭');assert.deepEqual(cokeUses.direct.map(p=>p.name).sort(),['加隆德鋼','玄鋼錠'].sort());assert(!cokeUses.reachable.includes('玄鋼板'),'plate uses Darksteel Nugget, not the Coke-based ingot');assert(cokeUses.parts.some(p=>p.name==='甲鱟級船首'));assert(!cokeUses.parts.some(p=>p.name==='鯊魚級船體'));assert.equal(materialUses(data,'紅木原木').schematics.length,1);console.log('Passed: Coke direct recipes and submarine part links without confusing ingots/nuggets; unlock-only raw material use.');

assert(!preparationNeeded(preparationPlan(fixture,finished,4).find(n=>n.name==='Ore')));
assert(preparationNeeded(preparationPlan(fixture,{a:{collected:1}},4).find(n=>n.name==='Ore')),'shared raw still needed for B');
assert(preparationNeeded({name:'Ore',need:0},{required:{Ore:3}}),'mandatory stock must stay visible');
assert(preparationNeeded({name:'Ore',need:4,short:0}),'stocked but still used is not obsolete');
console.log('Passed: hide obsolete upstream materials only after all shared uses are covered; keep unlock reserves and stocked requirements visible.');

const startStock=Object.fromEntries(data.items.map(i=>[i.id,{collected:i.start,delivered:i.start}]));
const comparison=routeComparison(data,startStock,4);assert.equal(comparison.start.lack,0);assert.equal(comparison.full.lack,data.items.reduce((s,i)=>s+i.upgrade,0));
assert.equal(comparison.full.ready,comparison.start.need,'delivered is part of collected, never added twice');
assert.equal(routeComparison(data,{},1).full.need*4,routeComparison(data,{},4).full.need);
assert.equal(comparison.rows.reduce((s,i)=>s+i.fullLack,0),comparison.full.lack);
assert.equal(comparison.rows.reduce((s,i)=>s+i.startLack,0),comparison.start.lack);
assert.equal(routeComparison(data,Object.fromEntries(data.items.map(i=>[i.id,{collected:i.total,delivered:i.total}])),4).full.lack,0);
console.log('Passed: readonly 1111/3124 comparison uses cumulative totals, delivered once, consistent row deficits and fleet scaling.');
