import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {defaultVoyageProfiles,retainVoyageParts,validateVoyageProfiles} from './voyage-profiles.mjs';
import {nextSwapEquipment,nextSwapMaterials,voyagePartName,voyageCodeParts} from './next-swap.mjs';
const data=JSON.parse(await fs.readFile('data.json','utf8')),known=Object.fromEntries(data.schematics.map(p=>[p.id,{status:'known'}]));
const profiles=(code,rank=25)=>({...defaultVoyageProfiles(),boats:Array.from({length:4},()=>({registered:true,rank,code}))});
const node=name=>data.inventoryNodes.find(n=>n.name===name),stock=entries=>Object.fromEntries(Object.entries(entries).map(([name,collected])=>[node(name).id,{collected,delivered:0}]));
for(let id=1;id<=20;id++){assert.ok(voyagePartName(id));assert.ok(voyageCodeParts('1111').every(n=>n>=1&&n<=4));}
const blank=nextSwapMaterials(data,{},known,defaultVoyageProfiles());assert.equal(blank.newParts,16);assert.ok(blank.finished.length>0);assert.equal(blank.finished.find(n=>n.name==='胡桃木材').goal,72,'new four-boat 1111 material demand excludes later stages');
let one=profiles('1111',20),gear=nextSwapEquipment(data,one);assert.equal(gear.newParts,4);assert.equal(gear.parts.find(p=>p.name==='甲鱟級船首').missing,4);assert.ok(gear.parts.filter(p=>p.id!==5).every(p=>!p.missing));
let two=structuredClone(one);two.boats[0].code='1121';two=retainVoyageParts(two,one);
assert.equal(two.completedParts[1],4,'old shark bows survive a swap');
// Moving a stored/equipped part to another boat must not create a fifth part.
let moved=structuredClone(two);moved.boats[0].code='1111';moved.boats[1].code='1121';moved=retainVoyageParts(moved,two);assert.equal(moved.completedParts[5],1);
let route=retainVoyageParts(profiles('1121',20),one);route=retainVoyageParts(profiles('3113',25),route);
assert.equal(nextSwapEquipment(data,route).newParts,0,'3113 to 1123 uses all previously retained parts');
const reused=nextSwapMaterials(data,{},known,route);assert.equal(reused.finished.length,0);assert.equal(reused.raw.length,0,'reused parts never expand old recipes');
assert.ok(nextSwapEquipment(data,profiles('3113')).newParts>0,'missing history is not silently assumed to exist');
const done=nextSwapMaterials(data,{},known,profiles('3124',85));assert.equal(done.newParts,0);assert.equal(done.missing.length,0);
assert.equal(nextSwapEquipment(data,profiles('1111',85)).boats[0].next,'3124','high-rank boats avoid obsolete intermediate swaps');
// New target is only whale hull + bridge for 1121 -> 3113.
const stage=retainVoyageParts(profiles('1121',25),one),empty=nextSwapMaterials(data,{},known,stage),direct=Object.fromEntries(empty.finished.map(n=>[n.name,n.goal]));
const supplied=nextSwapMaterials(data,stock(direct),known,stage);assert.equal(supplied.missing.length,0,'finished hand-in materials suppress every lower recipe');
const full=Object.fromEntries(data.inventoryNodes.map(n=>[n.id,{collected:100000,delivered:0}]));assert.equal(nextSwapMaterials(data,full,known,stage).missing.length,0);
const historical=Object.fromEntries(Object.entries(direct).map(([name,q])=>[node(name).id,{collected:q,delivered:q}]));
assert.deepEqual(nextSwapMaterials(data,historical,known,stage).finished.map(n=>n.short),empty.finished.map(n=>n.short),'already delivered old-stage materials cannot be credited a second time');
// Each shared input is counted from the parent batch needs exactly once.
const expected={};for(const n of empty.rows)if(n.recipe&&n.batches)for(const [name,q]of Object.entries(n.recipe.items))expected[name]=(expected[name]||0)+q*n.batches;
for(const n of empty.rows)assert.equal(n.processing,expected[n.name]||0,n.name);
const crystals=nextSwapMaterials(data,{},known,stage,true);assert.ok(crystals.rows.some(n=>n.crystal&&n.short));assert.ok(crystals.missing.every(n=>!n.crystal));
// A retained raw material is not spendable as craft stock.
const locks=nextSwapMaterials(data,full,{},stage);for(const n of locks.rows)assert.ok(n.available<=n.physical-n.unlockHeld,'unlock protection included in available stock');
const partial=nextSwapMaterials(data,stock({'胡桃木材':10}),known,defaultVoyageProfiles());assert.equal(partial.finished.find(n=>n.name==='胡桃木材').short,62);
assert.throws(()=>validateVoyageProfiles({...one,completedParts:{1:-1}}));assert.throws(()=>validateVoyageProfiles({...one,completedParts:{21:1}}));assert.throws(()=>retainVoyageParts({...one,completedParts:{}},one,true),/船上/);
console.log('Passed: 4-boat current/next BOM, retained and moved parts, zero-cost reuse, high-rank skip, fully finished route, finished-material suppression, delivered isolation, shared-input aggregation, mandatory locks, crystal ignore and partial stock credits.');
