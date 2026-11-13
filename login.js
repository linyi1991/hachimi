$('#unlock').onclick=()=>{
 if(modeWrites){toast('正在儲存，等一下再切換登入狀態。',true);return;}
 if(Object.keys(drafts).length){toast('先儲存剛填的數量，再切換登入狀態。',true);return;}
 if(auth&&canEdit){openModal('已登入','',`<p class="simple-hint">目前帳號：<strong>${esc(currentUser)}</strong></p><div class="dialog-actions"><button class="btn" id="account-logout">登出</button></div>`);$('#account-logout').onclick=()=>{if(Object.keys(drafts).length){toast('請先儲存剛填的數量。',true);return;}$('#modal').close();$('#lock').click();};return;}
 openModal('登入工房','WORKSHOP LOGIN',`<p class="plan-notes">登入後會讀取兩人共用的材料與航行設定。遊客試算會留在這台裝置，不會覆蓋共用資料。</p><form id="login-form"><label class="field">帳號<input id="login-user" name="username" autocomplete="username" required maxlength="80" placeholder="輸入帳號"></label><label class="field">密碼<input id="login-password" name="password" type="password" autocomplete="current-password" required maxlength="200" placeholder="輸入密碼"></label><div class="dialog-actions"><button class="btn primary" type="submit" id="confirm-login">登入</button></div></form><p class="plan-notes">沒有帳號也能使用：關掉這個視窗，就能繼續本機試算。帳號由負責人提供。</p>`);
 $('#login-form').onsubmit=async e=>{
  e.preventDefault();const username=$('#login-user').value.trim(),password=$('#login-password').value;
  if(!username||!password){toast('請填寫帳號與密碼。',true);return;}
  $('#confirm-login').disabled=true;
  try{const r=await fetch(api('/api/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const b=await r.json();if(!r.ok)throw Error(b.error||'登入失敗');clearModeView();auth=b.session;sessionStorage.setItem('hachimi-session',auth);$('#modal').close();await refresh();toast('已登入：'+b.username+'，8 小時後自動登出。');}
  catch(e){toast(e.message,true);if($('#confirm-login'))$('#confirm-login').disabled=false;}
 };
 $('#login-user').focus();
};
