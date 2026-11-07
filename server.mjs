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
  return json({items:r.results||[],schematics:schematics.results||[],calculation,messageCounts:counts.results||[],canEdit:!!account,username:account?.username||null,time:new Date().toISOString()});
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
