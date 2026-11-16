const warehousePlanner=plannerPage;plannerPage=function(){warehousePlanner();const b=document.createElement('button');b.className='btn';b.textContent='倉庫 CSV 覆蓋匯入';b.onclick=openWarehouseImport;$('#simple-stock .boardhead').append(b);};
let warehouseImportBusy=false;
window.addEventListener('beforeunload',e=>{if(warehouseImportBusy){e.preventDefault();e.returnValue='';}});
function warehouseDownload(data,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function openWarehouseImport(){
 if(!canManage()){toast('請先登入材料管理。',true);return;}
 if(Object.keys(drafts).length){toast('請先儲存正在修改的數量。',true);return;}
 const source=auth||'guest',pendingKey='hachimi-warehouse-pending-v1:'+(auth?currentUser:'guest'),before=structuredClone({items:state,schematics:schematicState});
 let prepared=null,busy=false,uncertain=false,needsPreview=false,completed=false,submitted=false,generation=0;
 openModal('部隊倉庫覆蓋匯入','先預覽，再一次更新',`<p>以倉庫目前數量覆蓋，不累加；HQ／NQ 與各堆疊會合併。潛水艇素材與雜項分開，金幣／公會戰績略過。</p><input type="file" id="warehouse-file" accept=".csv,text/csv"><label class="stock-visibility"><input type="checkbox" id="warehouse-complete">完整倉庫盤點：所有分頁都已讀取，未出現的潛水艇材料歸零</label><p class="simple-hint">支援「公會儲物櫃」和「部隊倉庫」匯出格式。已交付、認領、留言與保留設定不變；必留不足改列缺額。不扣額外製作原料。</p><div id="warehouse-preview"></div><p id="warehouse-status" class="warehouse-status" role="status" aria-live="polite">先選 CSV，確認差異後再匯入。</p><p class="missing" id="warehouse-error" role="alert"></p><div class="dialog-actions"><button class="btn" id="warehouse-backup">下載目前庫存備份</button><button class="btn primary" id="warehouse-apply" disabled>確認覆蓋匯入</button></div><details><summary>上次匯入／雜項紀錄</summary><div id="warehouse-last">正在讀取…</div></details>`);
 const modal=$('#modal'),close=$('#close'),file=$('#warehouse-file'),complete=$('#warehouse-complete'),button=$('#warehouse-apply'),preview=$('#warehouse-preview'),status=$('#warehouse-status'),error=$('#warehouse-error'),last=$('#warehouse-last');
 const alive=()=>file.isConnected&&$('#warehouse-file')===file,checkSource=()=>{if((auth||'guest')!==source)throw Object.assign(Error('登入狀態已改變，請回原本帳號再匯入；不會改到遊客資料。'),{uncertain:submitted||uncertain});};
 const headers={'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})};
 function remember(){try{sessionStorage.setItem(pendingKey,JSON.stringify(prepared));}catch{}}
 function forget(){try{sessionStorage.removeItem(pendingKey);}catch{}}
 function lock(value){busy=value;warehouseImportBusy=value;modeWrites+=value?1:-1;close.disabled=value;button.disabled=value;file.disabled=value||uncertain||completed;complete.disabled=value||uncertain||completed;button.setAttribute('aria-busy',String(value));}
 const preventClose=e=>{if(alive()&&busy&&(e.type==='cancel'||e.target===modal)){e.preventDefault();e.stopImmediatePropagation();}};
 modal.addEventListener('cancel',preventClose);modal.addEventListener('click',preventClose,true);modal.addEventListener('close',()=>{modal.removeEventListener('cancel',preventClose);modal.removeEventListener('click',preventClose,true);close.disabled=false;},{once:true});
 $('#warehouse-backup').onclick=()=>warehouseDownload(before,'倉庫匯入前備份.json');
 async function update(){
  const at=++generation;prepared=null;uncertain=false;needsPreview=false;button.disabled=true;error.textContent='';
  if(!file.files[0]){preview.innerHTML='';status.textContent='先選 CSV，確認差異後再匯入。';return;}
  try{
   checkSource();if(file.files[0].size>2000000)throw Error('檔案超過 2 MB，請只匯出部隊倉庫。');status.textContent='正在讀取 CSV…';
   const text=await file.files[0].text();if(!alive()||at!==generation)return;
   const p=parseWarehouseCsv(text,DATA,complete.checked),missing=[1,2,3,4,5].filter(n=>!p.locations.includes('第 '+n+' 頁'));
   prepared={items:p.items.map(n=>({...n,revision:state[n.id]?.revision||0})),misc:p.misc,complete:p.complete,requestId:'warehouse-'+crypto.randomUUID()};
   preview.innerHTML=`<h3>潛水艇用料 ${p.items.filter(n=>n.locations.length).length} 種・雜項 ${p.misc.length} 種</h3><p>覆蓋 ${p.items.length} 種網站素材；其中 ${p.items.filter(n=>(state[n.id]?.collected||0)-(state[n.id]?.delivered||0)!==n.physical).length} 種數量會變更。</p><p>讀取範圍：${p.locations.map(esc).join('、')}。略過 ${p.ignored} 筆貨幣。</p>${missing.length?`<p class="warehouse-coverage">檔案沒有第 ${missing.join('、')} 頁的物品，可能是空頁或還沒讀取。${p.complete?'你已勾完整盤點：檔案外的潛水艇材料會歸零，請確認所有頁都讀過。':'未勾完整盤點：檔案外的材料會保留原數量。'}</p>`:''}<details><summary>展開素材覆蓋前後差異</summary>${p.items.map(n=>`<div class="modal-line"><span>${esc(n.name)}</span><span>${num((state[n.id]?.collected||0)-(state[n.id]?.delivered||0))} → ${num(n.physical)}</span></div>`).join('')}</details><details><summary>雜項 ${p.misc.length} 種：不計潛水艇需求</summary>${p.misc.map(n=>`<div class="modal-line"><span>${esc(n.name)}</span><b>${num(n.physical)}</b></div>`).join('')}</details>`;
   status.textContent='預覽完成。確認後會一次覆蓋，不會累加數量。';button.textContent='確認覆蓋匯入';button.disabled=false;
  }catch(e){if(!alive()||at!==generation)return;prepared=null;error.textContent=e.message;status.textContent='尚未匯入，庫存沒有變更。';button.disabled=true;}
 }
 file.onchange=update;complete.onchange=update;
 try{const saved=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(saved&&/^warehouse-[0-9a-f-]{36}$/.test(saved.requestId)&&Array.isArray(saved.items)&&saved.items.length&&Array.isArray(saved.misc)){prepared=saved;uncertain=true;file.disabled=true;complete.disabled=true;complete.checked=!!saved.complete;status.textContent='上一筆匯入尚未確認。先查詢上次結果，避免重新建立另一筆。';button.textContent='確認上次匯入結果';button.disabled=false;}}catch{forget();}
 function success(){
  completed=true;uncertain=false;forget();error.textContent='';button.disabled=false;button.textContent='完成，回材料清單';
  status.innerHTML=`<strong>已儲存：覆蓋 ${prepared.items.length} 種潛水艇素材，${prepared.misc.length} 種雜項另存。</strong><span>正在讀取更新後的清單；認領、已交付與保留設定維持原樣。</span>`;
  toast('倉庫匯入已完成，正在更新材料清單。');
  void warehouseWait(refresh(),10000).then(()=>{if(alive())status.innerHTML=`<strong>匯入已完成。</strong><span>${online?'材料清單與缺額已重新計算。':'庫存已保存，清單目前無法讀取；請重新整理查看。'}</span>`;}).catch(()=>{if(alive())status.innerHTML='<strong>匯入已完成，庫存已保存。</strong><span>清單讀取較久，請重新整理查看，不用再匯入同一筆。</span>';});
 }
 button.onclick=async()=>{
  if(busy)return;if(completed){modal.close();return;}
  error.textContent='';lock(true);
  try{
   checkSource();
   if(needsPreview){status.textContent='正在重新讀取庫存與差異…';await warehouseWait(refresh(),10000);checkSource();if(!online)throw Error('無法讀取最新庫存，請稍後重新預覽。');await update();return;}
   if(!prepared)return;
   if(uncertain){button.textContent='正在確認上次結果…';status.textContent='正在核對上次匯入是否已儲存…';const result=await warehouseRequest(fetch,api('/api/warehouse-import')+'?requestId='+encodeURIComponent(prepared.requestId),{headers},7000);checkSource();if(result.status==='applied'){success();return;}}
   remember();submitted=true;button.textContent='匯入處理中…';status.textContent='正在一次覆蓋 '+prepared.items.length+' 種素材。請稍候，無須再按一次。';
   const result=await warehouseSubmit(fetch,api('/api/warehouse-import'),prepared,headers);checkSource();if(!result.ok)throw Object.assign(Error('尚未收到匯入完成確認。'),{uncertain:true});success();
  }catch(e){
   if(!alive())return;
   if(e.uncertain||uncertain&&![400,409,413,422].includes(e.status)){uncertain=true;remember();error.textContent='還無法確認是否已寫入。請按「確認結果／重試同一筆」，系統會先查紀錄；不會重複套用。';status.textContent=e.message;button.textContent='確認結果／重試同一筆';}
   else{forget();uncertain=false;submitted=false;needsPreview=true;error.textContent=e.message;status.textContent='這次未完成匯入，請重新讀取差異後再確認。';button.textContent='重新讀取庫存並預覽';}
  }finally{lock(false);if(alive())button.disabled=!completed&&!prepared&&!needsPreview;}
 };
 try{
  const b=await warehouseRequest(fetch,api('/api/warehouse-import'),{headers},7000);if(!alive())return;
  last.innerHTML=b.receipt?`<p>上次匯入 ${b.receipt.items.length} 種潛水艇素材；雜項 ${b.receipt.misc.length} 種。</p>${b.receipt.misc.map(n=>`<div class="modal-line"><span>${esc(n.name)}</span><b>${num(n.physical)}</b></div>`).join('')}<button class="btn" id="warehouse-old-backup">下載上次匯入前備份</button>`:'尚未匯入。';if(b.receipt)$('#warehouse-old-backup').onclick=()=>warehouseDownload(b.receipt.backup,'上次倉庫覆蓋前備份.json');
 }catch{if(alive())last.textContent='暫時無法讀取上次紀錄，不影響這次預覽。';}
}
