$('#unlock').onclick=()=>{
 openModal('登入工房','WORKSHOP LOGIN',`<p class="plan-notes">請輸入負責人提供的帳號與密碼。登入後可編輯共用進度，有效 8 小時。</p><form id="login-form"><label class="field">帳號<input id="login-user" name="username" autocomplete="username" required maxlength="80" placeholder="輸入帳號"></label><label class="field">密碼<input id="login-password" name="password" type="password" autocomplete="current-password" required maxlength="200" placeholder="輸入密碼"></label><div class="dialog-actions"><button class="btn primary" type="submit" id="confirm-login">登入</button></div></form><p class="plan-notes">帳號由負責人提供，本站不開放自行註冊。未登入仍可查看材料與攻略。</p>`);
 $('#login-form').onsubmit=async e=>{
  e.preventDefault();const username=$('#login-user').value.trim(),password=$('#login-password').value;
  if(!username||!password){toast('請填寫帳號與密碼。',true);return;}
  $('#confirm-login').disabled=true;
  try{const r=await fetch(api('/api/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const b=await r.json();if(!r.ok)throw Error(b.error||'登入失敗');auth=b.session;sessionStorage.setItem('hachimi-session',auth);$('#modal').close();await refresh();toast('已登入：'+b.username+'，8 小時後自動登出。');}
  catch(e){toast(e.message,true);if($('#confirm-login'))$('#confirm-login').disabled=false;}
 };
 $('#login-user').focus();
};
