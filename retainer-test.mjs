import assert from 'node:assert/strict';import fs from 'node:fs';import {retainerOrder,retainerText} from './retainer.mjs';
const d=JSON.parse(fs.readFileSync('data.json')),id=name=>d.inventoryNodes.find(n=>n.name===name).id;
const input=[{id:id('鈷鐵錠'),quantity:100},{id:id('白鋼鉚釘'),quantity:200},{id:id('鈷鐵錠'),quantity:23}],snapshot=JSON.stringify(input);
assert.equal(retainerText(d,input),'鈷鐵錠:123\n白鋼鉚釘:200');assert.equal(JSON.stringify(input),snapshot);assert.equal(retainerText(d,[]),'');for(const quantity of [0,-1,1.2,1000001,'1',NaN])assert.throws(()=>retainerOrder(d,[{id:id('鈷鐵錠'),quantity}]));assert.throws(()=>retainerOrder(d,[{id:'missing',quantity:1}]));assert.throws(()=>retainerOrder(d,[{id:id('鈷鐵錠'),quantity:1000000},{id:id('鈷鐵錠'),quantity:1}]));
console.log('Passed: exact Traditional Chinese plugin syntax, duplicate aggregation, quantity validation, no ingredient expansion or input mutation.');
