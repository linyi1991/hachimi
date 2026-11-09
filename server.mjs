const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...common,'Content-Type':'application/json; charset=utf-8'}});}
async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');}
function same(a,b){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function unb64(s){return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
async function signingKey(env){return crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function accounts(env){try{const a=JSON.parse(env.EDIT_ACCOUNTS||'[]');return Array.isArray(a)?a:[];}catch{return [];}}
async function passwordMatches(password,account){
 if(typeof password!=='string'||!password||password.length>200||!account)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(account.salt),iterations:100000},key,256);
 return same(b64url(new Uint8Array(bits)),account.hash);
}
async function issueSession(env,account){const payload=b64url(new TextEncoder().encode(JSON.stringify({role:'edit',sub:account.username,credential:account.hash,exp:Date.now()+8*3600000,nonce:crypto.randomUUID()})));const sig=await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode(payload));return 's.'+payload+'.'+b64url(new Uint8Array(sig));}
async function sessionAccount(req,env){try{if(!env.SESSION_SECRET)return null;const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';if(token.length>2048)return null;const [prefix,payload,sig,...extra]=token.split('.');if(prefix!=='s'||!payload||!sig||extra.length)return null;if(!await crypto.subtle.verify('HMAC',await signingKey(env),unb64(sig),new TextEncoder().encode(payload)))return null;const claim=JSON.parse(new TextDecoder().decode(unb64(payload)));if(claim.role!=='edit'||!Number.isSafeInteger(claim.exp)||claim.exp<=Date.now())return null;return accounts(env).find(a=>a.username===claim.sub&&same(a.hash,claim.credential))||null;}catch{return null;}}
async function authorized(req,env){return !!await sessionAccount(req,env);}
async function passAttempt(req,env){const ip=await digest(req.headers.get('CF-Connecting-IP')||'local'),bucket=Math.floor(Date.now()/900000);const row=await env.DB.prepare('INSERT INTO unlock_attempts(ip_hash,bucket,attempts) VALUES (?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN unlock_attempts.bucket=excluded.bucket THEN unlock_attempts.attempts+1 ELSE 1 END,bucket=excluded.bucket RETURNING attempts').bind(ip,bucket).first();return {ip,allowed:row.attempts<=8};}
async function handle(req,env){
 try{
 const u=new URL(req.url);
 if(u.pathname==='/api/unlock')return json({error:'已改用帳號密碼，請重新整理並按登入。'},410);
 if(u.pathname==='/api/login'&&req.method==='POST'){
  const configured=accounts(env);
  if(!configured.length||!env.SESSION_SECRET)return json({error:'登入尚未設定。'},503);
  const attempt=await passAttempt(req,env);
  if(!attempt.allowed)return json({error:'嘗試次數過多，請於 15 分鐘後再試。'},429);
  const raw=await req.text();if(raw.length>2048)return json({error:'登入資料格式不正確。'},400);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'登入資料格式不正確。'},400);}
  const account=typeof body.username==='string'&&body.username.length<=80?configured.find(a=>a.username===body.username.trim()):null;
  const valid=await passwordMatches(body.password,account||configured[0]);
  if(!account||!valid)return json({error:'帳號或密碼不正確。'},403);
  await env.DB.prepare('DELETE FROM unlock_attempts WHERE ip_hash=?').bind(attempt.ip).run();
  return json({session:await issueSession(env,account),username:account.username,expiresIn:28800});
 }
 if(u.pathname==='/api/schematic'&&req.method==='POST'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入才能記錄解鎖。'},403);
  const raw=await req.text();if(raw.length>4096)return json({error:'內容過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  const schematic=(DATA.schematics||[]).find(s=>s.id===b.id);if(!schematic||!['existing','pay','reset'].includes(b.action)||!Number.isSafeInteger(b.revision)||b.revision<0)return json({error:'請選擇有效設計圖及操作。'},400);
  const materials=Object.entries(schematic.materials).map(([name,quantity])=>({...DATA.inventoryNodes.find(n=>n.name===name),quantity}));
  if(materials.some(n=>!n.id))return json({error:'設計圖資料尚未完成。'},503);
  const conditions=["COALESCE((SELECT revision FROM schematic_progress WHERE schematic_id=?),0)=?", b.action==='reset'?"COALESCE((SELECT status FROM schematic_progress WHERE schematic_id=?),'pending') IN ('known','paid')":"COALESCE((SELECT status FROM schematic_progress WHERE schematic_id=?),'pending')='pending'"];
  const guardValues=[b.id,b.revision,b.id];
  if(b.action==='pay')for(const n of materials){const revision=b.stockRevisions?.[n.id];if(!Number.isSafeInteger(revision)||revision<0)return json({error:'請重新讀取材料庫存後再確認繳交。'},400);
   conditions.push('EXISTS(SELECT 1 FROM progress WHERE item_id=? AND revision=? AND collected>=?+MAX(?,delivered) AND collected-?>=partner_done)');guardValues.push(n.id,revision,n.quantity,n.direct?n.total:0,n.quantity);
  }
  const eventId=crypto.randomUUID(),now=new Date().toISOString(),receipt=b.action==='pay'?materials.map(n=>({id:n.id,name:n.name,quantity:n.quantity})):[];
  const statements=[env.DB.prepare('INSERT INTO schematic_events(id,schematic_id,action,actor,materials_json,created_at) SELECT ?,?,?,?,?,? WHERE '+conditions.join(' AND ')).bind(eventId,b.id,b.action,account.username,JSON.stringify(receipt),now,...guardValues)];
  if(b.action==='pay')for(const n of materials)statements.push(env.DB.prepare('UPDATE progress SET collected=collected-?,revision=revision+1,updated_at=? WHERE item_id=? AND EXISTS(SELECT 1 FROM schematic_events WHERE id=?)').bind(n.quantity,now,n.id,eventId));
  const status=b.action==='existing'?'known':b.action==='pay'?'paid':'pending';
  statements.push(env.DB.prepare('INSERT INTO schematic_progress(schematic_id,status,revision,updated_by,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM schematic_events WHERE id=?) ON CONFLICT(schematic_id) DO UPDATE SET status=excluded.status,revision=schematic_progress.revision+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(b.id,status,b.revision+1,account.username,now,eventId));
  const result=await env.DB.batch(statements);if(!(result[0]?.meta?.changes??result[0]?.changes))return json({error:'材料不足、已經解鎖，或其他人剛更新了紀錄。請重新整理；本次未扣任何材料。'},409);
  return json({ok:true,action:b.action,receipt});
 }
 if(u.pathname==='/api/warehouse-import'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入。'},403);
  if(req.method==='GET'){const event=await env.DB.prepare("SELECT materials_json FROM history_events WHERE before_step='warehouse-import' ORDER BY created_at DESC LIMIT 1").first();return json({receipt:event?JSON.parse(event.materials_json):null});}
  if(req.method!=='POST')return json({error:'操作無效。'},405);
  const raw=await req.text();if(raw.length>100000)return json({error:'檔案內容過大。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式錯誤。'},400);}
  if(!/^warehouse-[0-9a-f-]{36}$/.test(b.requestId||'')||!Array.isArray(b.items)||!b.items.length||b.items.length>DATA.inventoryNodes.length||!Array.isArray(b.misc)||b.misc.length>1000||new Set(b.items.map(n=>n.id)).size!==b.items.length||b.items.some(n=>!DATA.inventoryNodes.some(d=>d.id===n.id)||!Number.isSafeInteger(n.physical)||n.physical<0||n.physical>1000000||!Number.isSafeInteger(n.revision)||n.revision<0)||b.misc.some(n=>typeof n.name!=='string'||n.name.length>100||!Number.isSafeInteger(n.physical)||n.physical<0||n.physical>1000000)||b.complete&&b.items.length!==DATA.inventoryNodes.length)return json({error:'匯入資料不完整或數量無效。'},400);
  const oldEvent=await env.DB.prepare('SELECT * FROM history_events WHERE id=?').bind(b.requestId).first();if(oldEvent){const old=JSON.parse(oldEvent.materials_json);if(oldEvent.actor===account.username&&JSON.stringify(old.items)===JSON.stringify(b.items)&&JSON.stringify(old.misc)===JSON.stringify(b.misc))return json({ok:true,replayed:true});return json({error:'匯入編號已使用。'},409);}
  const all=await env.DB.prepare('SELECT * FROM progress').all(),stock=Object.fromEntries(all.results.map(n=>[n.item_id,n]));if(b.items.some(n=>(stock[n.id]?.revision||0)!==n.revision||(stock[n.id]?.delivered||0)+n.physical>1000000))return json({error:'庫存剛更新，請關閉視窗，重新預覽再匯入。'},409);
  const now=new Date().toISOString(),receipt=JSON.stringify({items:b.items,misc:b.misc,complete:!!b.complete,backup:all.results,attempt:crypto.randomUUID()}),guard='EXISTS(SELECT 1 FROM history_events WHERE id=? AND materials_json=?)';
  const statements=[env.DB.prepare("INSERT OR IGNORE INTO history_events(id,actor,fleet,before_step,materials_json,created_at) SELECT ?,?,1,'warehouse-import',?,? WHERE NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN progress p ON p.item_id=json_extract(e.value,'$.id') WHERE COALESCE(p.revision,0)!=json_extract(e.value,'$.revision'))").bind(b.requestId,account.username,receipt,now,JSON.stringify(b.items))];
  statements.push(env.DB.prepare("INSERT INTO progress(item_id,collected,revision,updated_at) SELECT json_extract(e.value,'$.id'),json_extract(e.value,'$.physical'),1,? FROM json_each(?) e WHERE "+guard+" ON CONFLICT(item_id) DO UPDATE SET collected=progress.delivered+excluded.collected,partner_done=MIN(progress.partner_done,excluded.collected),revision=progress.revision+1,updated_at=excluded.updated_at").bind(now,JSON.stringify(b.items),b.requestId,receipt));
  const results=await env.DB.batch(statements);if(!(results[0]?.meta?.changes??results[0]?.changes)){const prior=await env.DB.prepare('SELECT actor,materials_json FROM history_events WHERE id=?').bind(b.requestId).first();if(prior&&prior.actor===account.username&&JSON.stringify(JSON.parse(prior.materials_json).items)===JSON.stringify(b.items))return json({ok:true,replayed:true});return json({error:'其他人剛更新庫存，請重新預覽；沒有部分匯入。'},409);}return json({ok:true});
 }
 if(u.pathname==='/api/inventory-correction'&&req.method==='POST'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入。'},403);
  const raw=await req.text();if(raw.length>1024)return json({error:'內容過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式錯誤。'},400);}
  if(!DATA.inventoryNodes.some(n=>n.id===b.id)||!Number.isSafeInteger(b.physical)||b.physical<0||b.physical>1000000||!Number.isSafeInteger(b.revision)||b.revision<0)return json({error:'請填實際現有數量。'},400);
  const old=await env.DB.prepare('SELECT * FROM progress WHERE item_id=?').bind(b.id).first()||{collected:0,delivered:0,revision:0};if(old.revision!==b.revision||old.delivered+b.physical>1000000)return json({error:'紀錄已更新，請重新讀取。'},409);
  const id=crypto.randomUUID(),now=new Date().toISOString(),receipt=JSON.stringify({action:'inventory-correction',item:b.id,before:old.collected-old.delivered,after:b.physical});
  const result=await env.DB.batch([env.DB.prepare('INSERT INTO history_events(id,actor,fleet,before_step,materials_json,created_at) SELECT ?,?,1,?,?,? WHERE COALESCE((SELECT revision FROM progress WHERE item_id=?),0)=?').bind(id,account.username,'inventory-correction',receipt,now,b.id,b.revision),env.DB.prepare('INSERT INTO progress(item_id,collected,revision,updated_at) SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM history_events WHERE id=?) ON CONFLICT(item_id) DO UPDATE SET collected=progress.delivered+?,partner_done=MIN(progress.partner_done,?),revision=progress.revision+1,updated_at=excluded.updated_at').bind(b.id,b.physical,now,id,b.physical,b.physical)]);
  if(!(result[0]?.meta?.changes??result[0]?.changes))return json({error:'其他人剛更新；沒有更正任何數量。'},409);return json({ok:true});
 }
 if(u.pathname==='/api/material-claim'&&req.method==='POST'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入才能認領材料。'},403);
  const raw=await req.text();if(raw.length>1024)return json({error:'內容過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  const item=DATA.inventoryNodes.find(n=>n.id===b.id);if(!item||item.direct||!['claim','release'].includes(b.action)||!Number.isSafeInteger(b.revision)||b.revision<0)return json({error:'請選底材或半成品；工房成品請到分工表認領。'},400);
  const owner=b.action==='claim'?account.username:'',condition=b.action==='claim'?"COALESCE((SELECT owner FROM progress WHERE item_id=?),'') IN ('',?)":"EXISTS(SELECT 1 FROM progress WHERE item_id=? AND owner=?)";
  const row=await env.DB.prepare('INSERT INTO progress(item_id,owner,revision,updated_at) SELECT ?,?,1,? WHERE COALESCE((SELECT revision FROM progress WHERE item_id=?),0)=? AND '+condition+' ON CONFLICT(item_id) DO UPDATE SET owner=excluded.owner,revision=progress.revision+1,updated_at=excluded.updated_at RETURNING *').bind(b.id,owner,new Date().toISOString(),b.id,b.revision,b.id,account.username).first();
  if(!row)return json({error:'紀錄剛更新或已有其他人負責；請重新讀取。只有本人能取消認領。'},409);
  return json({item:row});
 }
 if(u.pathname==='/api/craft-complete'&&req.method==='POST'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入才能記錄製作。'},403);
  const raw=await req.text();if(raw.length>20000)return json({error:'內容過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  if(typeof b.requestId!=='string'||!/^craft-[0-9a-f-]{36}$/.test(b.requestId)||typeof b.personalCrystals!=='boolean')return json({error:'請重新開啟製作視窗。'},400);
  const request={id:b.id,quantity:b.quantity,personalCrystals:b.personalCrystals},sameRequest=event=>event.actor===account.username&&event.before_step==='craft'&&JSON.stringify(JSON.parse(event.materials_json).request)===JSON.stringify(request);
  const old=await env.DB.prepare('SELECT * FROM history_events WHERE id=?').bind(b.requestId).first();if(old)return sameRequest(old)?json({ok:true,replayed:true,receipt:JSON.parse(old.materials_json).receipt}):json({error:'這筆製作編號已使用，請重新開啟視窗。'},409);
  const items=await env.DB.prepare('SELECT * FROM progress').all(),plans=await env.DB.prepare('SELECT * FROM schematic_progress').all(),stock=Object.fromEntries(items.results.map(n=>[n.item_id,n])),schematics=Object.fromEntries(plans.results.map(n=>[n.schematic_id,n]));
  let receipt;try{receipt=completionPlan(DATA,stock,schematics,b.id,b.quantity,b.personalCrystals);}catch(e){return json({error:e.message},400);}
  if(!receipt.ok)return json({error:'可用材料不足；必留量不能扣。本次沒有增加成品或扣材料。',missing:receipt.inputs.filter(n=>n.short)},422);
  const snapshots=DATA.inventoryNodes.map(n=>({id:n.id,revision:stock[n.id]?.revision||0})),planSnapshots=DATA.schematics.map(n=>({id:n.id,revision:schematics[n.id]?.revision||0}));
  if(snapshots.some(n=>!Number.isSafeInteger(b.revisions?.[n.id])||b.revisions[n.id]!==n.revision)||planSnapshots.some(n=>!Number.isSafeInteger(b.schematicRevisions?.[n.id])||b.schematicRevisions[n.id]!==n.revision))return json({error:'庫存或必留設定剛更新，請重新計算後再記錄；本次沒有扣料。'},409);
  const now=new Date().toISOString(),payload=JSON.stringify({request,receipt,attempt:crypto.randomUUID()}),guard='EXISTS(SELECT 1 FROM history_events WHERE id=? AND materials_json=?)';
  const stale="NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN progress p ON p.item_id=json_extract(e.value,'$.id') WHERE COALESCE(p.revision,0)!=json_extract(e.value,'$.revision')) AND NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN schematic_progress p ON p.schematic_id=json_extract(e.value,'$.id') WHERE COALESCE(p.revision,0)!=json_extract(e.value,'$.revision'))";
  const statements=[env.DB.prepare('INSERT OR IGNORE INTO history_events(id,actor,fleet,before_step,materials_json,created_at) SELECT ?,?,1,?,?,? WHERE '+stale).bind(b.requestId,account.username,'craft',payload,now,JSON.stringify(snapshots),JSON.stringify(planSnapshots))];
  for(const n of receipt.inputs.filter(n=>!n.personal))statements.push(env.DB.prepare('UPDATE progress SET collected=collected-?,partner_done=MIN(partner_done,MAX(0,collected-?-history_delivered)),revision=revision+1,updated_at=? WHERE item_id=? AND '+guard).bind(n.amount,n.amount,now,n.id,b.requestId,payload));
  const output=DATA.inventoryNodes.find(n=>n.id===b.id),secondary=stock[b.id]?.owner||'浮光若水',partnerAdded=output.direct&&account.username===secondary?b.quantity:0;
  statements.push(env.DB.prepare('INSERT INTO progress(item_id,collected,partner_done,revision,updated_at) SELECT ?,?,?,1,? WHERE '+guard+' ON CONFLICT(item_id) DO UPDATE SET collected=progress.collected+excluded.collected,partner_done=progress.partner_done+excluded.partner_done,revision=progress.revision+1,updated_at=excluded.updated_at').bind(b.id,b.quantity,partnerAdded,now,b.requestId,payload));
  const result=await env.DB.batch(statements);if(!(result[0]?.meta?.changes??result[0]?.changes)){const prior=await env.DB.prepare('SELECT * FROM history_events WHERE id=?').bind(b.requestId).first();if(prior&&sameRequest(prior))return json({ok:true,replayed:true,receipt:JSON.parse(prior.materials_json).receipt});return json({error:'有人同時更新庫存，請重新計算；沒有扣任何材料。'},409);}
  return json({ok:true,receipt});
 }
 if(u.pathname==='/api/history'&&req.method==='POST'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入才能補記已完成階段。'},403);
  const raw=await req.text();if(raw.length>8192)return json({error:'內容過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  const delivery=b.action==='deliver',index=DATA.route.steps.findIndex(s=>s.id===b.before);if(index<(delivery?0:1)||!Number.isInteger(b.fleet)||b.fleet<1||b.fleet>4)return json({error:'請選有效的已完成階段與船數。'},400);
  const prior=DATA.route.steps.slice(0,index+(delivery?1:0)).map(s=>s.id),rows=DATA.items.map(i=>({...i,target:prior.reduce((n,id)=>n+(i.stepNeeds[id]||0),0)*b.fleet/4})).filter(i=>i.target>0),conditions=[],values=[];
  for(const i of rows){const rev=b.revisions?.[i.id];if(!Number.isSafeInteger(rev)||rev<0)return json({error:'請重新讀取材料紀錄。'},400);}
  const expected=JSON.stringify(rows.map(i=>({id:i.id,target:i.target,revision:b.revisions[i.id]}))),event=crypto.randomUUID(),now=new Date().toISOString();
  const stale="NOT EXISTS (SELECT 1 FROM json_each(?) e LEFT JOIN progress p ON p.item_id=json_extract(e.value,'$.id') WHERE COALESCE(p.revision,0)!=json_extract(e.value,'$.revision') OR COALESCE(p.collected,0)+MAX(0,json_extract(e.value,'$.target')-COALESCE(p.delivered,0))>1000000 OR (?=1 AND COALESCE(p.collected,0)<json_extract(e.value,'$.target')))";
  const statements=[env.DB.prepare('INSERT INTO history_events(id,actor,fleet,before_step,materials_json,created_at) SELECT ?,?,?,?,?,? WHERE '+stale).bind(event,account.username,b.fleet,b.before,JSON.stringify({action:delivery?'deliver':'existing',items:rows.map(i=>({id:i.id,target:i.target}))}),now,expected,delivery?1:0)];
  for(const i of rows)if(delivery)statements.push(env.DB.prepare('UPDATE progress SET delivered=MAX(delivered,?),revision=revision+1,updated_at=? WHERE item_id=? AND EXISTS(SELECT 1 FROM history_events WHERE id=?)').bind(i.target,now,i.id,event));else statements.push(env.DB.prepare('INSERT INTO progress(item_id,collected,delivered,history_delivered,revision,updated_at) SELECT ?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM history_events WHERE id=?) ON CONFLICT(item_id) DO UPDATE SET collected=progress.collected+MAX(0,?-progress.delivered),history_delivered=progress.history_delivered+MAX(0,?-progress.delivered),partner_target=MIN(progress.partner_target,MAX(0,?-(progress.history_delivered+MAX(0,?-progress.delivered)))),delivered=MAX(progress.delivered,?),revision=progress.revision+1,updated_at=excluded.updated_at').bind(i.id,i.target,i.target,i.target,now,event,i.target,i.target,i.total,i.target,i.target));
  const result=await env.DB.batch(statements);if(!(result[0]?.meta?.changes??result[0]?.changes))return json({error:'成品不足或紀錄剛更新，請重新整理確認；沒有更動任何材料。'},409);
  return json({ok:true});
 }
 // Personal material order; deliberately isolated from physical inventory.
 if(u.pathname==='/api/gather-allocation'&&req.method==='POST'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入，才能安排共同採集分工。'},403);
  const raw=await req.text();if(raw.length>24000)return json({error:'清單過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  if(!Number.isSafeInteger(b.revision)||b.revision<0||!['analyze','adjust','cancel'].includes(b.action))return json({error:'請選有效的分工操作。'},400);
  const all=await env.DB.prepare('SELECT * FROM progress').all(),plans=await env.DB.prepare('SELECT * FROM schematic_progress').all(),stock=Object.fromEntries(all.results.map(n=>[n.item_id,n])),schematics=Object.fromEntries(plans.results.map(n=>[n.schematic_id,n]));
  let plan;try{if(b.action==='analyze'){if(!Number.isInteger(b.fleet)||b.fleet<1||b.fleet>4||!['all','start','upgrade','to1121','to3113','to1123','to3124'].includes(b.stage))throw Error('請選有效船數與階段');plan=recommendAllocation(DATA,stock,schematics,b.fleet,b.stage);}else {if(b.fingerprint!==allocationFingerprint(DATA,stock,schematics))return json({error:'庫存已更新，請重新分析分工。'},409);plan={fleet:b.fleet,stage:b.stage,lines:b.action==='cancel'?[]:b.lines,fingerprint:b.fingerprint};validateAllocation(DATA,stock,schematics,plan);}}catch(e){return json({error:e.message},400);}
  plan={...plan,revision:b.revision+1,updatedBy:account.username,updatedAt:new Date().toISOString()};
  const versions=DATA.inventoryNodes.map(n=>({id:n.id,revision:stock[n.id]?.revision||0})),unlockVersions=DATA.schematics.map(n=>({id:n.id,revision:schematics[n.id]?.revision||0}));
  const guard="NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN progress p ON p.item_id=json_extract(e.value,'$.id') WHERE COALESCE(p.revision,0)!=json_extract(e.value,'$.revision')) AND NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN schematic_progress p ON p.schematic_id=json_extract(e.value,'$.id') WHERE COALESCE(p.revision,0)!=json_extract(e.value,'$.revision'))";
  const row=await env.DB.prepare("INSERT INTO history_events(id,actor,fleet,before_step,materials_json,created_at) SELECT 'shared-gather-allocation',?,?,'gather-allocation',?,? WHERE ( ?=0 OR EXISTS(SELECT 1 FROM history_events WHERE id='shared-gather-allocation')) AND "+guard+" ON CONFLICT(id) DO UPDATE SET actor=excluded.actor,fleet=excluded.fleet,materials_json=excluded.materials_json,created_at=excluded.created_at WHERE json_extract(history_events.materials_json,'$.revision')=? RETURNING materials_json").bind(account.username,plan.fleet,JSON.stringify(plan),plan.updatedAt,b.revision,JSON.stringify(versions),JSON.stringify(unlockVersions),b.revision).first();
  if(!row)return json({error:'庫存或另一位夥伴的分工已更新，請重新讀取後再分析。'},409);return json({plan:JSON.parse(row.materials_json)});
 }
 if(u.pathname==='/api/retainer-plan'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入，才能儲存或讀取僱員清單。'},403);
  const key='retainer-plan:'+account.username;
  if(req.method==='GET'){const row=await env.DB.prepare('SELECT materials_json FROM history_events WHERE id=? AND actor=?').bind(key,account.username).first();return json({plan:row?JSON.parse(row.materials_json):{revision:0,lines:[]}});}
  if(req.method!=='POST')return json({error:'不支援此操作。'},405);
  const raw=await req.text();if(raw.length>16000)return json({error:'清單過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'清單格式不正確。'},400);}
  if(!Number.isSafeInteger(b.revision)||b.revision<0||b.revision>1000000)return json({error:'版本不正確。'},400);
  let lines;try{lines=retainerOrder(DATA,b.lines).map(({id,quantity})=>({id,quantity}));}catch(e){return json({error:e.message},400);}
  const plan={revision:b.revision+1,lines,updatedAt:new Date().toISOString()};
  const row=await env.DB.prepare("INSERT INTO history_events(id,actor,fleet,before_step,materials_json,created_at) SELECT ?,?,1,'retainer-plan',?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM history_events WHERE id=?) ON CONFLICT(id) DO UPDATE SET materials_json=excluded.materials_json,created_at=excluded.created_at WHERE history_events.actor=? AND json_extract(history_events.materials_json,'$.revision')=? RETURNING materials_json").bind(key,account.username,JSON.stringify(plan),plan.updatedAt,b.revision,key,account.username,b.revision).first();
  if(!row)return json({error:'另一個分頁已更新僱員清單。請先複製目前清單，再重新讀取。'},409);return json({plan:JSON.parse(row.materials_json)});
 }
 if(u.pathname==='/api/calculation'&&req.method==='POST'){
  const account=await sessionAccount(req,env);if(!account)return json({error:'請先登入，才能保存在帳號。'},403);
  const raw=await req.text();if(raw.length>1024)return json({error:'內容過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  if(!Number.isInteger(b.fleet)||b.fleet<1||b.fleet>4||!['all','start','upgrade','to1121','to3113','to1123','to3124'].includes(b.stage)||!Number.isSafeInteger(b.revision)||b.revision<0)return json({error:'請選擇 1～4 艘及有效階段。'},400);
  const row=await env.DB.prepare('INSERT INTO calculation_views(account_name,fleet,stage,revision,updated_at) SELECT ?,?,?,1,? WHERE COALESCE((SELECT revision FROM calculation_views WHERE account_name=?),0)=? ON CONFLICT(account_name) DO UPDATE SET fleet=excluded.fleet,stage=excluded.stage,revision=calculation_views.revision+1,updated_at=excluded.updated_at RETURNING *').bind(account.username,b.fleet,b.stage,new Date().toISOString(),account.username,b.revision).first();
  if(!row)return json({error:'另一個分頁已儲存過計算，請重新整理再儲存。'},409);return json({view:row});
 }
 if(u.pathname==='/api/search'&&req.method==='GET'){
  const q=u.searchParams.get('q')||'';if(q.length>200)return json({error:'關鍵字太長。'},400);
  const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/第四/g,'第4').replace(/第三/g,'第3').replace(/第二/g,'第2').replace(/第一/g,'第1').replace(/第五/g,'第5').replace(/仓/g,'倉').replace(/页/g,'頁').replace(/\s/g,'');
  const tokens=q.trim().split(/\s+/).filter(Boolean).slice(0,8).map(normalize);if(!tokens.length)return json({items:[]});
  const progress=await env.DB.prepare('SELECT * FROM progress').all(),messages=await env.DB.prepare('SELECT item_id,author,quantity,location,body,created_at FROM messages ORDER BY created_at DESC').all(),byId=Object.fromEntries((progress.results||[]).map(s=>[s.item_id,s])),byMessage={};
  for(const m of messages.results||[])(byMessage[m.item_id]||=[]).push(m);
  const items=[];for(const n of DATA.inventoryNodes){const s=byId[n.id]||{},notes=byMessage[n.id]||[],plans=(DATA.schematics||[]).filter(p=>p.materials[n.name]),where=(n.direct||plans.length)?'部隊倉庫第'+(s.reserve_tab||4)+'頁':'',people=n.direct?['哈沁咪',s.owner||'浮光若水'].join(' '):s.owner||'',text=[n.name,n.en,s.note,people,where,...plans.map(p=>p.name),...(DATA.acquisition[n.name]?.exchanges||[]).map(e=>[e.kind==='gc'?'軍票':'友好部落',e.tribe,e.vendor,e.method,e.location].join(' ')),...notes.map(m=>[m.author,m.location,m.body].join(' '))].join(' ');if(!tokens.every(t=>normalize(text).includes(t)))continue;
   const matched=notes.filter(m=>tokens.some(t=>normalize([m.author,m.location,m.body].join(' ')).includes(t))).slice(0,3);
   items.push({id:n.id,name:n.name,en:n.en,direct:n.direct,location:where,note:s.note||'',schematics:plans.map(p=>p.name),messages:matched,commentCount:notes.length});
  }return json({items});
 }
 if(u.pathname==='/api/state'&&req.method==='GET'){
  const r=await env.DB.prepare('SELECT * FROM progress').all();
  const counts=await env.DB.prepare('SELECT item_id,COUNT(*) AS count FROM messages GROUP BY item_id').all();
  const schematics=await env.DB.prepare('SELECT * FROM schematic_progress').all();
  const account=await sessionAccount(req,env),calculation=account?await env.DB.prepare('SELECT * FROM calculation_views WHERE account_name=?').bind(account.username).first():null;
  const dispatchRow=await env.DB.prepare("SELECT materials_json FROM history_events WHERE id='shared-gather-allocation'").first();
  return json({dispatch:dispatchRow?JSON.parse(dispatchRow.materials_json):{revision:0,lines:[]},items:r.results||[],schematics:schematics.results||[],calculation,messageCounts:counts.results||[],canEdit:!!account,username:account?.username||null,time:new Date().toISOString()});
 }
 if(u.pathname==='/api/comments'&&req.method==='GET'){
  const id=u.searchParams.get('item');if(!DATA.inventoryNodes.some(i=>i.id===id))return json({error:'找不到材料。'},404);
  const rows=await env.DB.prepare('SELECT * FROM messages WHERE item_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(id).all();return json({messages:rows.results||[]});
 }
 if(u.pathname==='/api/comments'&&req.method==='POST'){
  if(!await authorized(req,env))return json({error:'請先登入才能編輯。'},403);
  const raw=await req.text();if(raw.length>4096)return json({error:'留言過長。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  if(!DATA.inventoryNodes.some(i=>i.id===b.item)||typeof b.author!=='string'||!b.author.trim()||b.author.length>40||!Number.isSafeInteger(b.quantity)||b.quantity<0||b.quantity>1000000||typeof b.location!=='string'||b.location.length>80||typeof b.body!=='string'||b.body.length>500||(!b.body.trim()&&!b.location.trim()))return json({error:'請填留言人，以及放置位置或留言內容。'},400);
  const m={id:crypto.randomUUID(),item_id:b.item,author:b.author.trim(),quantity:b.quantity,location:b.location.trim(),body:b.body.trim(),created_at:new Date().toISOString()};
  await env.DB.prepare('INSERT INTO messages(id,item_id,author,quantity,location,body,created_at) VALUES (?,?,?,?,?,?,?)').bind(m.id,m.item_id,m.author,m.quantity,m.location,m.body,m.created_at).run();return json({message:m});
 }
 if(u.pathname==='/api/reserve'&&req.method==='POST'){
  if(!await authorized(req,env))return json({error:'請先登入才能編輯。'},403);
  const raw=await req.text();if(raw.length>2048)return json({error:'格式不正確。'},413);let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  if(!DATA.items.some(i=>i.id===b.id)||!Number.isInteger(b.tab)||b.tab<1||b.tab>5||typeof b.locked!=='boolean'||!Number.isSafeInteger(b.revision)||b.revision<0)return json({error:'請選擇第 1 至第 5 頁。'},400);
  const attempt=await passAttempt(req,env);if(!attempt.allowed)return json({error:'嘗試次數過多，請於 15 分鐘後再試。'},429);
  if(!await passwordMatches(b.password,await sessionAccount(req,env)))return json({error:'變更保留位置需重新輸入目前帳號的正確密碼。'},403);
  await env.DB.prepare('DELETE FROM unlock_attempts WHERE ip_hash=?').bind(attempt.ip).run();
  await env.DB.prepare('INSERT OR IGNORE INTO progress(item_id) VALUES (?)').bind(b.id).run();
  const row=await env.DB.prepare('UPDATE progress SET reserve_tab=?,reserve_locked=?,revision=revision+1,updated_at=? WHERE item_id=? AND revision=? RETURNING *').bind(b.tab,b.locked?1:0,new Date().toISOString(),b.id,b.revision).first();if(!row)return json({error:'其他人已修改，請重新載入再設定。'},409);return json({item:row});
 }
 if(u.pathname==='/api/item'&&req.method==='PATCH'){
  if(!await authorized(req,env))return json({error:'請先登入才能編輯。'},403);
  if(Number(req.headers.get('content-length')||0)>4096)return json({error:'內容過長。'},413);
  const raw=await req.text();if(raw.length>4096)return json({error:'內容過長。'},413);
  let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  const item=DATA.inventoryNodes.find(i=>i.id===b.id);if(!item)return json({error:'找不到這項材料。'},404);
  if(b.self_claimed!==undefined&&![0,1].includes(b.self_claimed))return json({error:'請確認是否認領剩餘工作。'},400);
  if(b.partner_target===undefined)b.partner_target=0;if(b.partner_done===undefined)b.partner_done=0;
  if(!Number.isSafeInteger(b.collected)||b.collected<0||b.collected>1000000||!Number.isSafeInteger(b.delivered)||b.delivered<0||b.delivered>item.total||b.delivered>b.collected||!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.owner!=='string'||b.owner.length>40||typeof b.note!=='string'||b.note.length>200)return json({error:'數量須為非負整數；已交付不能超過已備妥及需求。'},400);
  if(!Number.isSafeInteger(b.partner_target)||b.partner_target<0||b.partner_target>item.total||!Number.isSafeInteger(b.partner_done)||b.partner_done<0||b.partner_done>b.collected||(!item.direct&&b.partner_done!==0))return json({error:'請檢查夥伴的認領量與已完成量。'},400);
  const allStock=await env.DB.prepare('SELECT * FROM progress').all(),allPlans=await env.DB.prepare('SELECT * FROM schematic_progress').all(),stockMap=Object.fromEntries((allStock.results||[]).map(x=>[x.item_id,x])),plans=Object.fromEntries((allPlans.results||[]).map(x=>[x.schematic_id,x])),current=stockMap[b.id]||{collected:0,delivered:0};
  const reserved=unlockReservation(DATA,stockMap,plans).held[item.name]||0,partHeld=item.direct?Math.min(Math.max(0,current.collected-current.delivered),Math.max(0,item.total-current.delivered)):0,handed=Math.max(0,b.delivered-current.delivered),minimum=reserved+Math.max(0,partHeld-handed);
  if(b.collected-b.delivered<minimum)return json({error:'此材料已有 '+minimum+' 個列為必留，禁止挪用或當作其他製作耗用扣除。實際繳交請使用對應繳交紀錄。'},422);
  await env.DB.prepare('INSERT OR IGNORE INTO progress(item_id) VALUES (?)').bind(b.id).run();
  // Snapshot only reservation dependencies, so an unlock/parent-stock change cannot race this write.
  const dependencies=new Set(),planDependencies=[];
  function protects(name,seen=new Set()){if(name===item.name)return true;if(seen.has(name))return false;seen.add(name);const children=Object.keys(DATA.recipes[name]?.items||{});const matched=children.filter(n=>protects(n,new Set(seen)));if(matched.length)dependencies.add(name);return matched.length>0;}
  for(const p of DATA.schematics||[])if(Object.keys(p.materials).some(name=>protects(name)))planDependencies.push(p.id);
  const guards=[],guardValues=[];
  for(const name of dependencies){const n=DATA.inventoryNodes.find(n=>n.name===name);if(n.id===item.id)continue;guards.push('COALESCE((SELECT revision FROM progress WHERE item_id=?),0)=?');guardValues.push(n.id,stockMap[n.id]?.revision||0);}
  for(const id of planDependencies){guards.push('COALESCE((SELECT revision FROM schematic_progress WHERE schematic_id=?),0)=?');guardValues.push(id,plans[id]?.revision||0);}
  const row=await env.DB.prepare('UPDATE progress SET collected=?,delivered=?,owner=?,note=?,partner_target=?,partner_done=?,self_claimed=COALESCE(?,self_claimed),revision=revision+1,updated_at=? WHERE item_id=? AND revision=?'+(guards.length?' AND '+guards.join(' AND '):'')+' RETURNING *').bind(b.collected,b.delivered,b.owner.trim(),b.note.trim(),b.partner_target,b.partner_done,b.self_claimed??null,new Date().toISOString(),b.id,b.revision,...guardValues).first();
  if(!row)return json({error:'其他人已更新這項材料。請先重新載入該列，再套用你的數量。'},409);
  return json({item:row});
 }
 if(u.pathname==='/download.xlsx'&&req.method==='GET')return new Response(Uint8Array.from(atob(XLSX),c=>c.charCodeAt(0)),{headers:{...common,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Hachimi-4subs-1111-3124.xlsx"'}});
 if(['/','/index.html','/guide','/parts','/voyages','/sources','/lookup','/planner','/compare'].includes(u.pathname)&&req.method==='GET')return new Response(HTML,{headers:{...common,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://linyi1991.github.io; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
 return json({error:'找不到頁面。'},404);
 }catch{return json({error:'暫時無法儲存或讀取，請稍後重試。'},503);}
}
export default {async fetch(req,env){
 const origin=req.headers.get('Origin');
 const allowed=origin==='https://linyi1991.github.io'||origin===new URL(req.url).origin;
 if(req.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}:common});
 const response=await handle(req,env);
 if(allowed&&new URL(req.url).pathname.startsWith('/api/')){const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');return new Response(response.body,{status:response.status,headers});}
 return response;
}};
