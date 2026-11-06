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
 if(u.pathname==='/api/state'&&req.method==='GET'){
  const r=await env.DB.prepare('SELECT * FROM progress').all();
  const counts=await env.DB.prepare('SELECT item_id,COUNT(*) AS count FROM messages GROUP BY item_id').all();
  return json({items:r.results||[],messageCounts:counts.results||[],canEdit:await authorized(req,env),username:(await sessionAccount(req,env))?.username||null,time:new Date().toISOString()});
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
  if(b.partner_target===undefined)b.partner_target=0;if(b.partner_done===undefined)b.partner_done=0;
  if(!Number.isSafeInteger(b.collected)||b.collected<0||b.collected>1000000||!Number.isSafeInteger(b.delivered)||b.delivered<0||b.delivered>item.total||b.delivered>b.collected||!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.owner!=='string'||b.owner.length>40||typeof b.note!=='string'||b.note.length>200)return json({error:'數量須為非負整數；已交付不能超過已備妥及需求。'},400);
  if(!Number.isSafeInteger(b.partner_target)||b.partner_target<0||b.partner_target>item.total||!Number.isSafeInteger(b.partner_done)||b.partner_done<0||b.partner_done>b.collected||(!item.direct&&b.partner_done!==0))return json({error:'請檢查夥伴的認領量與已完成量。'},400);
  await env.DB.prepare('INSERT OR IGNORE INTO progress(item_id) VALUES (?)').bind(b.id).run();
  const row=await env.DB.prepare('UPDATE progress SET collected=?,delivered=?,owner=?,note=?,partner_target=?,partner_done=?,revision=revision+1,updated_at=? WHERE item_id=? AND revision=? RETURNING *').bind(b.collected,b.delivered,b.owner.trim(),b.note.trim(),b.partner_target,b.partner_done,new Date().toISOString(),b.id,b.revision).first();
  if(!row)return json({error:'其他人已更新這項材料。請先重新載入該列，再套用你的數量。'},409);
  return json({item:row});
 }
 if(u.pathname==='/download.xlsx'&&req.method==='GET')return new Response(Uint8Array.from(atob(XLSX),c=>c.charCodeAt(0)),{headers:{...common,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Hachimi-4subs-1111-3124.xlsx"'}});
 if(['/','/index.html','/guide','/parts','/voyages','/sources','/lookup','/planner'].includes(u.pathname)&&req.method==='GET')return new Response(HTML,{headers:{...common,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://linyi1991.github.io; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
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
