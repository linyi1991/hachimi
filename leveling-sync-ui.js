const levelSourceKey=()=>auth||'guest';
let levelSyncMessage='',levelSyncError='',levelReloading=false;
const levelSyncModel=createVoyageProfileSync({
 loadGuest:readLevelProfiles,
 saveGuest:profiles=>localStorage.setItem(levelStorageKey,JSON.stringify(profiles)),
 readShared:async token=>{
  const r=await fetch(api('/api/voyage-profiles'),{headers:{Authorization:'Bearer '+token}}),b=await r.json();
  if(!r.ok)throw Error(b.error||'目前無法讀取共同航行配置。');return b;
 },
 writeShared:async (value,token)=>{
  const r=await fetch(api('/api/voyage-profiles'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(value)}),b=await r.json();
  if(!r.ok)throw Error(b.error||'儲存失敗，請保留畫面中的修改後重試。');return b;
 }
});
function levelSyncEnter(){
 const changed=levelSyncModel.enter(levelSourceKey());
 if(changed){levelProfiles=levelSyncModel.snapshot().profiles;levelDraftDirty=false;levelSyncMessage='';levelSyncError='';levelReloading=false;if($('#level-profile-form'))levelFillProfile();}
 return changed;
}
function levelSyncUpdate(){
 if(!$('#level-profile-form'))return;
 const s=levelSyncModel.snapshot(),shared=!!auth,blocked=s.saving||levelReloading||shared&&!s.ready;
 document.querySelectorAll('#level-profile-form input,#level-profile-form select,#level-profile-form button,[data-level-boat]').forEach(n=>n.disabled=blocked);
 $('#level-profile-form').setAttribute('aria-busy',String(blocked));
 const note=$('#level-storage-notice');
 if(note){note.className='level-storage-notice '+(shared?'shared':'guest');note.innerHTML=shared?'<strong>已登入：兩人共用的航行配置</strong><p>四艘 Rank、裝備代號、已做好零件與開圖進度，哈沁咪和浮光若水看到同一份。按儲存後可換裝置繼續；頁面開著時約每 15 秒檢查更新，回到頁面也會重新讀取。</p>':'<strong>遊客：只存在這個瀏覽器</strong><p>四艘配置與開圖進度只供你本機試算。登入後讀取共同設定，登出會回到這份遊客設定；兩份不會自動合併。</p>';}
 const status=$('#level-save-status');
 if(status){
  const time=s.updatedAt?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s.updatedAt)):'';
  if(s.saving)status.textContent='正在儲存…';
  else if(levelSyncError)status.textContent=levelSyncError;
  else if(levelReloading)status.textContent='正在重新讀取共同設定…';
  else if(s.remote)status.textContent=`${s.remote.updatedBy||'夥伴'}已更新共同配置；你的修改還在，請先讀取最新設定。`;
  else if(levelDraftDirty)status.textContent='尚未儲存；自動更新不會蓋掉正在填的內容。';
  else if(levelSyncMessage)status.textContent=levelSyncMessage;
  else if(!shared)status.textContent='遊客設定只儲存在這個瀏覽器';
  else if(!s.ready)status.textContent='正在讀取共同配置…';
  else status.textContent=s.revision?`共同設定已讀取・${s.updatedBy}・${time}（台灣時間）`:'共同設定尚未儲存，請填寫或帶入本機舊設定。';
 }
 const reload=$('#level-reload-shared');if(reload){reload.hidden=!shared;reload.disabled=s.saving||levelReloading;reload.textContent=levelDraftDirty?'捨棄未儲存內容，讀取最新共同設定':'重新讀取共同設定';}
 const importButton=$('#level-import-local');if(importButton){let hasLocal=false;try{hasLocal=!!localStorage.getItem(levelStorageKey);}catch{}importButton.hidden=!(shared&&s.ready&&s.revision===0&&hasLocal);importButton.disabled=s.saving;}
}
async function levelSyncRefresh(force=false){
 if(!$('#level-profile-form')||levelReloading)return;
 const key=levelSourceKey();levelSyncEnter();if(force)levelReloading=true;levelSyncUpdate();
 try{
  const s=await levelSyncModel.read(key,()=>levelDraftDirty&&!force);if(key!==levelSourceKey()||s.discarded)return;
  levelSyncError='';if(s.applied||force){levelProfiles=s.profiles;levelDraftDirty=false;levelSyncMessage='';levelFillProfile();}
 }catch(e){if(key===levelSourceKey())levelSyncError=e.message;}
 finally{if(key===levelSourceKey()){if(force)levelReloading=false;levelSyncUpdate();}}
}
const levelAdviceWithoutSync=levelRenderAdvice;
levelRenderAdvice=function(){
 if(auth&&!levelSyncModel.snapshot().ready){const root=$('#level-next-advice');if(root)root.innerHTML='<p class="guide-caption">讀取共同航行配置後，再顯示目前路線與下一步。</p>';document.querySelectorAll('.level-current,.level-next').forEach(n=>n.classList.remove('level-current','level-next'));return;}
 levelAdviceWithoutSync();
};
function levelBindSyncedProfile(){
 levelSyncEnter();levelFillProfile();
 const controls=document.createElement('div');controls.className='level-sync-controls guide-actions';controls.innerHTML='<button type="button" class="btn" id="level-reload-shared">重新讀取共同設定</button><button type="button" class="btn" id="level-import-local">帶入本機舊設定（先檢查再儲存）</button>';
 $('#level-storage-notice').after(controls);
 $('#level-profile-form').addEventListener('input',()=>{levelDraftDirty=true;levelSyncError='';levelSyncMessage='';levelSyncUpdate();});
 $('#level-profile-form').addEventListener('submit',async e=>{
  e.preventDefault();const key=levelSourceKey(),draft={registered:$('#level-registered').checked,rank:Number($('#level-rank').value),code:$('#level-code').value.trim()},progress=Number($('#level-progress').value),nextKnown=$('#level-next-known').checked;
  try{
   voyageGuideAdvice(DATA.voyageReference,DATA.levelingGuide,{...draft,progress,nextKnown});
   const next=structuredClone(levelProfiles);next.boats[levelSelection]=draft;next.progress=progress;next.nextKnown=nextKnown;
   const promise=levelSyncModel.save(key,next);levelSyncUpdate();const result=await promise;if(key!==levelSourceKey()||result.discarded)return;
   levelProfiles=result.profiles;levelDraftDirty=false;levelSyncError='';levelSyncMessage=auth?'已儲存到共同設定，另一位登入者也能看到。':'已儲存在這個瀏覽器';levelRenderAdvice();
  }catch(err){if(key===levelSourceKey())levelSyncError=err.message;}
  finally{if(key===levelSourceKey())levelSyncUpdate();}
 });
 document.querySelectorAll('[data-level-boat]').forEach(b=>b.onclick=()=>{if(levelDraftDirty){levelSyncError='請先儲存這艘的修改，再切換。';levelSyncUpdate();return;}levelSelection=Number(b.dataset.levelBoat);levelFillProfile();levelSyncMessage='';levelSyncUpdate();});
 $('#level-reload-shared').onclick=()=>levelSyncRefresh(true);
 $('#level-import-local').onclick=()=>{if(levelSyncModel.snapshot().revision!==0)return;levelProfiles=readLevelProfiles();levelDraftDirty=true;levelSyncError='';levelSyncMessage='';levelFillProfile();levelSyncUpdate();$('#level-save-status').textContent='已帶入本機四艘設定，還沒寫入共用；請逐艘檢查，再按儲存。';};
 levelSyncUpdate();void levelSyncRefresh();
}
const levelSharedRefresh=refresh;refresh=async function(){if($('#level-profile-form')){levelSyncEnter();levelSyncUpdate();}await levelSharedRefresh();await levelSyncRefresh();};
const levelClearMode=clearModeView;clearModeView=function(){levelClearMode();levelSyncEnter();levelSyncUpdate();};
for(const id of ['#unlock','#lock']){const prior=$(id).onclick;$(id).onclick=function(e){if(levelDraftDirty||levelSyncModel.snapshot().saving){toast('請先儲存航行配置的修改，再切換登入狀態。',true);return;}return prior?.call(this,e);};}
window.addEventListener('beforeunload',e=>{if(levelDraftDirty||levelSyncModel.snapshot().saving){e.preventDefault();e.returnValue='';}});
