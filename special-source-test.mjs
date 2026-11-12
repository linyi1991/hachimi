import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {priorityPreparationPlan} from './priority-plan.mjs';
const data=JSON.parse(await fs.readFile('data.json','utf8'));data.specialSources=JSON.parse(await fs.readFile('special-sources.json','utf8'));data.gathering=JSON.parse(await fs.readFile('gathering-sources.json','utf8'));
for(const [name,s]of Object.entries(data.specialSources)){assert(!data.recipes[name]);assert(!data.gathering[name]?.length);assert(s.source.startsWith('https://ffxiv.consolegameswiki.com/'));if(s.kind==='exploration')assert.equal(s.label,'潛水艇探索帶回');}
for(const name of ['輕木廢材','竹片','輕木木材','合成纖維'])assert.equal(data.specialSources[name].market,false);
for(const name of ['藍鐵礦','蒼天石原石','鐵刀木'])assert.equal(data.specialSources[name].market,true);
const plan=priorityPreparationPlan(data,{});for(const n of plan.order.filter(n=>data.specialSources[n.name])){assert.equal(n.self,0);assert.equal(n.retainer,0);assert(['exploration','drop'].includes(n.kind));}
assert.equal(data.specialSources['明膠怪的肉'].kind,'drop');console.log('Passed: exploration and monster drops separated from gathering/crafting, four market-prohibited unlock items, correct tradable exploration inputs and no gathering-retainer assignments.');
