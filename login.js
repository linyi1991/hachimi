$('#unlock').onclick=()=>{
 openModal('編輯登入','PRIVATE WORKSHOP',`<p class="plan-notes">請使用工房負責人提供的私人編輯連結與通關密語。登入後可編輯共用進度，有效 8 小時。</p><label class="field">私人編輯連結${key?'（已載入，可留空）':''}<input id="login-link" type="password" autocomplete="off" maxlength="600" placeholder="${key?'已載入私人連結；需更換時再貼上':'貼上完整的私人編輯網址'}"></label><label class="field">通關密語<input id="passphrase" type="password" autocomplete="off" maxlength="200" placeholder="輸入通關密語"></label><div class="dialog-actions"><button class="btn primary" id="confirm-unlock">登入並解鎖編輯</button></div><p class="plan-notes">一般網址與資料來源頁都可以從右上角登入。知道一般網址或只有密語，都無法取得編輯權限。</p>`);
 $('#confirm-unlock').onclick=async()=>{
  const raw=$('#login-link').value.trim();let candidate=key;
  if(raw){try{candidate=new URLSearchParams(new URL(raw).hash.slice(1)).get('edit')||'';}catch{candidate=raw;}}
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(candidate)){toast('請貼上負責人提供的完整私人編輯連結。',true);return;}
  const passphrase=$('#passphrase').value;if(!passphrase){toast('請輸入通關密語。',true);return;}
  $('#confirm-unlock').disabled=true;
  try{const r=await fetch(api('/api/unlock'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+candidate},body:JSON.stringify({passphrase})});const b=await r.json();if(!r.ok)throw Error(b.error||'登入失敗');key=candidate;auth=b.session;sessionStorage.setItem('hachimi-edit',key);sessionStorage.setItem('hachimi-session',auth);$('#modal').close();await refresh();toast('已登入編輯模式，8 小時後自動鎖定。');}
  catch(e){toast(e.message,true);if($('#confirm-unlock'))$('#confirm-unlock').disabled=false;}
 };
 $('#passphrase').onkeydown=e=>{if(e.key==='Enter')$('#confirm-unlock').click();};
};
