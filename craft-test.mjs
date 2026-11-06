import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {craftPool,simulateCraft,craftCapacity,craftBatch} from './craft.mjs';
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
