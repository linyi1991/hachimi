import assert from 'node:assert/strict';
import {warehouseRequest,warehouseSubmit} from './warehouse.mjs';
const url='https://local.invalid/api/warehouse-import',payload={requestId:'warehouse-'+crypto.randomUUID(),items:[{id:'m001',physical:74,revision:0}],misc:[],complete:false},json=(body,status=200)=>new Response(JSON.stringify(body),{status});
assert.equal((await warehouseSubmit(async()=>json({ok:true}),url,payload,{},100,100)).ok,true);
let calls=[],postBody,aborted=false;
const savedButLost=async(address,options)=>{calls.push(address);if(options.method==='POST'){postBody=options.body;options.signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});}return json({status:'applied'});};
const recovered=await warehouseSubmit(savedButLost,url,payload,{},15,100);assert.equal(recovered.confirmedByReceipt,true);assert.equal(calls.length,2);assert.ok(calls[1].endsWith(payload.requestId));assert.equal(JSON.parse(postBody).requestId,payload.requestId);assert.equal(aborted,true);
let sent=[];await assert.rejects(()=>warehouseSubmit(async(address,options)=>{sent.push(address);if(options.method==='POST')return new Promise(()=>{});return json({status:'not-found'});},url,payload,{},15,100),e=>e.uncertain===true);assert.equal(sent.length,2);
// An unresponsive body is bounded too, even if fetch itself resolved already.
await assert.rejects(()=>warehouseRequest(async()=>({ok:true,status:200,text:()=>new Promise(()=>{})}),url,{},15),e=>e.uncertain===true);
await assert.rejects(()=>warehouseRequest(async()=>json({error:'庫存剛更新'},409),url,{},100),e=>e.status===409&&!e.uncertain&&e.message==='庫存剛更新');
await assert.rejects(()=>warehouseRequest(async()=>new Response('<html>error</html>',{status:502}),url,{},100),e=>e.uncertain===true);
assert.equal((await warehouseSubmit(async(address,options)=>options.method==='POST'?json({error:'uncertain'},503):json({status:'applied'}),url,payload,{},100,100)).ok,true);
let replays=[];const server=async(address,options)=>{if(options.method==='POST'){replays.push(JSON.parse(options.body).requestId);if(replays.length===1)throw Error('network');return json({ok:true,replayed:true});}return json({status:'not-found'});};
await assert.rejects(()=>warehouseSubmit(server,url,payload,{},100,100));assert.equal((await warehouseSubmit(server,url,payload,{},100,100)).replayed,true);assert.deepEqual(replays,[payload.requestId,payload.requestId]);
console.log('Passed: bounded POST/body waits, uncertain-save receipt recovery, not-found stays uncertain, safe 4xx/non-JSON handling and same-ID retry without another import.');
