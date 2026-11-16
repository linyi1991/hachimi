import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {parseWarehouseCsv} from './warehouse.mjs';
const data=JSON.parse(await fs.readFile('data.json','utf8')),header='名稱,數量／可用總數,來源,庫存位置\r\n',sample='\uFEFF'+header+'古神木材,81,同部隊,部隊倉庫－4 - 1\r\n古神木材,3,同部隊,部隊倉庫－4 - 2\r\n雜項,7,同部隊,部隊倉庫－2 - 1\r\nGil,10000000,同部隊,部隊－金幣';
const p=parseWarehouseCsv(sample,data,true);assert.equal(p.items.find(n=>n.name==='古神木材').physical,84);assert.equal(p.items.length,data.inventoryNodes.length);assert.equal(p.misc[0].physical,7);assert.equal(p.ignored,1);assert.equal(parseWarehouseCsv(sample,data,false).items.length,1);assert.throws(()=>parseWarehouseCsv(header+'古神木材,3,人,背包',data));assert.throws(()=>parseWarehouseCsv(header+'古神木材,-3,人,部隊倉庫－1',data));assert.throws(()=>parseWarehouseCsv(header+'古神木材,3,A,部隊倉庫－1\n古神木材,4,B,部隊倉庫－2',data));console.log('Passed: Allagan CSV BOM/CRLF, stack/quality aggregation, complete vs partial coverage, misc/currency separation and private/mixed-source rejection.');

for(const name of ['氣泡水','發泡水','发泡水']){const imported=parseWarehouseCsv(header+name+',7,同部隊,部隊倉庫－1',data,false);assert.equal(imported.items[0].id,'r084');assert.equal(imported.items[0].name,'氣泡水');assert.equal(imported.misc.length,0);}
const water=parseWarehouseCsv(header+'氣泡水,3,同部隊,部隊倉庫－1\n發泡水,4,同部隊,部隊倉庫－2',data,false);assert.equal(water.items.length,1);assert.equal(water.items[0].physical,7);

// Traditional Chinese export variants include guild crystals, HQ stacks and Gil.
const modern='\uFEFF最愛?,圖示,名稱,類型,數量/可用總數量,來源,物品欄位置\nfalse,,古神木材,NQ,3,測試部隊,公會儲物櫃 - 1 - 1\nfalse,,古神木材,HQ,4,測試部隊,公會儲物櫃 - 5 - 2\nfalse,,火之碎晶,NQ,8,測試部隊,公會 - 水晶 - 1\nfalse,,Gil,NQ,9999999,測試部隊,公會 - Gil\nfalse,,公會戰績,NQ,3,測試部隊,公會 - 貨幣 - 1\nfalse,,測試雜項,NQ,2,測試部隊,公會儲物櫃 - 3 - 3';
const modernParsed=parseWarehouseCsv(modern,data);assert.equal(modernParsed.items.find(n=>n.name==='古神木材').physical,7);assert.equal(modernParsed.items.find(n=>n.name==='火之碎晶').physical,8);assert.equal(modernParsed.ignored,2);assert.equal(modernParsed.misc.length,1);assert.ok(modernParsed.locations.includes('水晶頁'));assert.ok(!modernParsed.locations.includes('第 4 頁'));
assert.throws(()=>parseWarehouseCsv(modern.replace('公會儲物櫃 - 1 - 1','背包 - 1 - 1'),data));
assert.throws(()=>parseWarehouseCsv(modern.replace('公會儲物櫃 - 1 - 1','公會儲物櫃 - 6 - 1'),data));
assert.throws(()=>parseWarehouseCsv(header+'名稱\n',data));
console.log('Passed: current Traditional Chinese headers, guild chest pages, crystal tab, HQ/NQ merge, Gil/credits exclusion and explicit missing-page coverage.');

// Old website spelling and current game spelling resolve to one persistent item ID.
for(const name of ['金剛砂','金剛沙'])for(const complete of [false,true]){const p=parseWarehouseCsv(header+name+',24,測試部隊,公會儲物櫃 - 3 - 3',data,complete);const emery=p.items.find(n=>n.id==='r057');assert.equal(emery.name,'金剛砂');assert.equal(emery.physical,24);assert.equal(p.misc.length,0,'Emery must never fall into misc and be zeroed by complete imports');}
const emeryStacks=parseWarehouseCsv(header+'金剛砂,16,測試部隊,公會儲物櫃 - 3 - 3\n金剛沙,8,測試部隊,公會儲物櫃 - 2 - 1',data,true);assert.equal(emeryStacks.items.find(n=>n.id==='r057').physical,24);assert.equal(data.recipes['黃玉'].items['金剛砂'],1);assert.equal(data.recipes['黃玉'].items['金剛沙'],undefined);assert.ok(data.acquisition['金剛砂']);assert.ok(JSON.parse(await fs.readFile('assets/icon-sources.json','utf8'))['金剛砂']);
console.log('Passed: 金剛砂 24 imports into r057 with current and legacy spelling, partial/full inventories preserve it, aliases merge once and recipe/source/icon names agree.');
