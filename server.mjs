const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...common,'Content-Type':'application/json; charset=utf-8'}});}
async function keyAuthorized(req,env){
 const key=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
 if(!key||!env.EDIT_KEY_HASH)return false;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash.length!==env.EDIT_KEY_HASH.length)return false;
 let diff=0;for(let i=0;i<hash.length;i++)diff|=hash.charCodeAt(i)^env.EDIT_KEY_HASH.charCodeAt(i);return diff===0;
}
async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');}
function same(a,b){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function unb64(s){return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
async function signingKey(env){return crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function issueSession(env){const payload=b64url(new TextEncoder().encode(JSON.stringify({role:'edit',exp:Date.now()+8*3600000,nonce:crypto.randomUUID()})));const sig=await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode(payload));return 's.'+payload+'.'+b64url(new Uint8Array(sig));}
async function authorized(req,env){try{if(!env.SESSION_SECRET)return false;const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';if(token.length>2048)return false;const [prefix,payload,sig,...extra]=token.split('.');if(prefix!=='s'||!payload||!sig||extra.length)return false;if(!await crypto.subtle.verify('HMAC',await signingKey(env),unb64(sig),new TextEncoder().encode(payload)))return false;const claim=JSON.parse(new TextDecoder().decode(unb64(payload)));return claim.role==='edit'&&Number.isSafeInteger(claim.exp)&&claim.exp>Date.now();}catch{return false;}}
async function handle(req,env){
 try{
 const u=new URL(req.url);
 if(u.pathname==='/api/unlock'&&req.method==='POST'){
  if(!await keyAuthorized(req,env))return json({error:'私人編輯連結無效。'},403);
  if(!env.EDIT_PASSPHRASE_HASH||!env.SESSION_SECRET)return json({error:'編輯保護尚未設定。'},503);
  const ip=await digest(req.headers.get('CF-Connecting-IP')||'local');const bucket=Math.floor(Date.now()/900000);
  const attempts=await env.DB.prepare('INSERT INTO unlock_attempts(ip_hash,bucket,attempts) VALUES (?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN unlock_attempts.bucket=excluded.bucket THEN unlock_attempts.attempts+1 ELSE 1 END,bucket=excluded.bucket RETURNING attempts').bind(ip,bucket).first();
  if(attempts.attempts>8)return json({error:'嘗試次數過多，請於 15 分鐘後再試。'},429);
  const raw=await req.text();if(raw.length>1024)return json({error:'密語格式不正確。'},400);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'密語格式不正確。'},400);}
  if(typeof body.passphrase!=='string'||body.passphrase.length>200||!same(await digest(body.passphrase),env.EDIT_PASSPHRASE_HASH))return json({error:'通關密語不正確。'},403);
  await env.DB.prepare('DELETE FROM unlock_attempts WHERE ip_hash=?').bind(ip).run();
  return json({session:await issueSession(env),expiresIn:28800});
 }
 if(u.pathname==='/api/state'&&req.method==='GET'){
  const r=await env.DB.prepare('SELECT * FROM progress').all();
  return json({items:r.results||[],canEdit:await authorized(req,env),time:new Date().toISOString()});
 }
 if(u.pathname==='/api/item'&&req.method==='PATCH'){
  if(!await authorized(req,env))return json({error:'需要有效的私人編輯連結。'},403);
  if(Number(req.headers.get('content-length')||0)>4096)return json({error:'內容過長。'},413);
  const raw=await req.text();if(raw.length>4096)return json({error:'內容過長。'},413);
  let b;try{b=JSON.parse(raw);}catch{return json({error:'格式不正確。'},400);}
  const item=DATA.items.find(i=>i.id===b.id);if(!item)return json({error:'找不到這項材料。'},404);
  if(!Number.isSafeInteger(b.collected)||b.collected<0||b.collected>1000000||!Number.isSafeInteger(b.delivered)||b.delivered<0||b.delivered>item.total||b.delivered>b.collected||!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.owner!=='string'||b.owner.length>40||typeof b.note!=='string'||b.note.length>200)return json({error:'數量須為非負整數；已交付不能超過已備妥及需求。'},400);
  await env.DB.prepare('INSERT OR IGNORE INTO progress(item_id) VALUES (?)').bind(b.id).run();
  const row=await env.DB.prepare('UPDATE progress SET collected=?,delivered=?,owner=?,note=?,revision=revision+1,updated_at=? WHERE item_id=? AND revision=? RETURNING *').bind(b.collected,b.delivered,b.owner.trim(),b.note.trim(),new Date().toISOString(),b.id,b.revision).first();
  if(!row)return json({error:'其他人已更新這項材料。請先重新載入該列，再套用你的數量。'},409);
  return json({item:row});
 }
 if(u.pathname==='/download.xlsx'&&req.method==='GET')return new Response(Uint8Array.from(atob(XLSX),c=>c.charCodeAt(0)),{headers:{...common,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Hachimi-4subs-1111-3124.xlsx"'}});
 if(['/','/index.html','/guide','/parts','/voyages','/sources','/lookup'].includes(u.pathname)&&req.method==='GET')return new Response(HTML,{headers:{...common,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
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
