const levelMainIds=[2,5,10,14,15,19,20,25,26,27,28,30,32,33,34,37,38,39,42,51];
const levelFamily=['','鯊魚','甲鱟','鬚鯨','腔棘魚','希爾德拉'],levelSlots=['船體','船尾','船首','艦橋'];
const levelStorageKey='hachimi-personal-voyages-v1';
let levelSelection=0,levelDraftDirty=false;
function readLevelProfiles(){
 try{const v=JSON.parse(localStorage.getItem(levelStorageKey)||'null');if(v?.version===1&&Array.isArray(v.boats)&&v.boats.length===4&&v.boats.every(b=>b&&Number.isInteger(b.rank)&&b.rank>=1&&b.rank<=85&&/^[1-5]{4}$/.test(b.code))&&levelMainIds.includes(v.progress))return v;}catch{}
 return {version:1,progress:2,nextKnown:false,boats:Array.from({length:4},()=>({registered:false,rank:1,code:'1111'}))};
}
let levelProfiles=readLevelProfiles();
const levelSector=id=>DATA.voyageReference.sectors.find(s=>s.id===Number(id));
const levelSea=map=>map===1?'溺沒海':'灰海';
const levelTime=seconds=>{const minutes=Math.ceil(seconds/60);return Math.floor(minutes/60)+' 小時 '+String(minutes%60).padStart(2,'0')+' 分';};
function levelFocus(s){
 if(s.from===85)return '換普通 3124；溺沒海 O、J 已完成探索後開始收益。';
 if(s.from>=50)return '灰海尚未開：先留 3113 跑溺沒海 I→P→Q 練級，首艘繼續推 AD。灰海已開才換 1123。';
 if(s.to<20)return '首艘優先 B→E→J；15～19 級先留 1111，20 級再換。';
 if(s.from<25)return 'J 已發現就先探索 J，開第 2 艘；其他艇照本列練級。';
 return '首艘優先 J→N→O→S→T→Y→Z→AA→AB→AD，依 Rank 開船位與灰海；其他艇照本列練級。';
}
function levelingTable(){return `<section class="panel guide-chapter" id="leveling-table"><div class="level-section-title"><div><span class="eyebrow">由上往下照做</span><h2>1～85 級推薦航點</h2></div><span class="guide-tag">普通版・回港接續派航</span></div><p>先做下方「首艘開圖任務」，等級不夠或其他艇要練級時，照等級表跑。表內箭頭是<b>一趟實際選點順序</b>；所有航點都已開才使用。未開時，照該列的補圖鏈先跑前一點。</p><div class="level-table-wrap"><table class="level-table"><thead><tr><th>Rank／配置</th><th>推薦航點</th><th>預估航時／燃料</th><th>未開先補哪裡</th></tr></thead><tbody>${DATA.levelingGuide.stages.map(s=>`<tr id="level-stage-${s.from}" data-level-from="${s.from}" data-level-to="${s.to}"><td data-label="Rank／配置"><strong>${s.from===s.to?s.from:s.from+'～'+s.to} 級</strong><span class="level-build-code">${s.build}</span>${[20,25,50,85].includes(s.from)?'<small class="level-swap">留意換裝</small>':''}</td><td data-label="推薦航點"><span class="guide-tag">${levelSea(s.map)}</span><strong class="level-route">${s.points.join(' → ')}</strong><small>${s.names.map(esc).join(' → ')}</small></td><td data-label="航時與燃料"><span>${s.minSeconds===s.maxSeconds?levelTime(s.minSeconds):levelTime(s.minSeconds)+'～'+levelTime(s.maxSeconds)}</span><small>每艘每趟燃料 ${s.fuel} 個<br>起始等級航距 ${s.distance}／${s.range}</small></td><td data-label="未開先補哪裡">${s.unlockChains.filter(c=>c.length>1).map(c=>`<div class="level-unlock-chain">${levelSea(s.map)} ${c.join(' → ')}</div>`).join('')||'<span>起始 A、B 可跑。</span>'}<small>補圖鏈代表前置關係，逐點開；不是一次全選。</small><p class="level-row-focus">${levelFocus(s)}</p></td></tr>`).join('')}</tbody></table></div><p class="guide-caption">已逐級檢查 1～85 的部件等級、成本容量、最多 5 個航點及航距；航時採社群公式，含固定 12 小時，沒有卡 24／48 小時。練級組合依既有普通配件與保守經驗效率挑選；實際經驗加成、開圖機率會影響進度，不保證固定幾天畢業。表中 K、T 等代號一定搭配海域辨認。</p></section>`;}
function levelOpeningTasks(){return `<section class="panel guide-chapter" id="leveling-opening"><span class="eyebrow">首艘先照這段，其他艇同步練級</span><h2>主線還沒開齊，優先跑這裡。</h2><p>已發現下一區、而且 Rank 夠，就直接去下一區；尚未發現，就重跑前置。J／O／T 要完成探索才取得新船登記權限，拿到船位就先登記下一艘。</p><ol class="level-opening-list">${DATA.levelingGuide.opening.map(s=>`<li><strong>溺沒海 ${s.code}</strong><span>Rank ${s.rank} 起</span><p>${esc(s.goal)}</p></li>`).join('')}</ol><div class="guide-note"><strong>50 級但灰海還沒開？不用停等。</strong><p>首艘依序推 Z→AA→AB→AD；其他 Rank 50 以上的艇可先留 3113 跑溺沒海 I→P→Q。灰海 A 可去後換 1123。灰海再推 A→B→C→F→G→H→K→T；60 級 K 未開時先跑 A→C→F→G→H 去開 K；70 級 T 未開時先跑 A→C→G→K 去開 T。</p><p>支線 D 從灰海 C 發現；補圖後可用 54 級起的 B→A→C→D。升到 85 後回溺沒海 O→J，不必為這個目標繼續開後面的海域。</p></div></section>`;}
function levelUpgradeTree(){
 const labels=[['1111','Rank 1','四種鯊魚級各一件',''],['1121','建議 Rank 20','新做甲鱟船首','鯊魚船首留著'],['3113','Rank 25','新做鬚鯨船體、鬚鯨艦橋','船首換回鯊魚；甲鱟船首留著'],['1123','Rank 50 且灰海可去','鯊魚船體＋甲鱟船首換回','新增材料 0；鬚鯨船體留著'],['3124','Rank 85','新做腔棘魚艦橋，換回鬚鯨船體','普通版 O→J；鯊魚船尾一直沿用']];
 return `<section class="panel guide-chapter" id="leveling-tree"><span class="eyebrow">看圖就知道現在到哪裡</span><h2>換裝路線與海域解鎖樹</h2><div class="level-trees"><article><h3>零件換裝圖</h3><p id="level-gear-caption">下方可輸入配置，所在階段會亮起。</p><ol class="level-upgrade-tree">${labels.map(([code,rank,add,hold])=>`<li data-gear-node="${code}"><span class="level-tree-dot"></span><div><strong>${code}</strong><span>${rank}</span><p>${add}</p>${hold?`<small>${hold}</small>`:''}</div></li>`).join('')}</ol></article><article><h3>海域解鎖樹</h3><p id="level-sea-caption">連線是前置關係；一趟選點看上方等級表。</p><ul class="level-unlock-tree"><li>溺沒海 B → E<ul><li data-sea-node="10"><b>J・Rank 20</b><span>完成探索 → 登記第 2 艘</span><ul><li>N → <b>O・Rank 30</b><span>完成 O → 登記第 3 艘</span><ul><li>S → <b>T・Rank 40</b><span>完成 T → 登記第 4 艘</span><ul><li>Y → Z → AA → AB → AD<ul><li data-sea-node="32"><b>灰海 A・Rank 50</b><span>發現後才能前往</span><ul><li>B → C<ul><li>D 支線：54 級練級組合會用</li><li>F → G → H → K<ul><li data-sea-node="51">T・Rank 70，補齊後繼續練到 85</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></li></ul></article></div></section>`;
}
function levelCurrentPanel(){return `<section class="panel guide-chapter" id="leveling-current"><span class="eyebrow">先填你現在的狀況</span><h2>我現在在哪一步？</h2><div class="level-boat-tabs" role="group" aria-label="選擇潛水艇">${[0,1,2,3].map(i=>`<button class="btn ${levelSelection===i?'primary':''}" data-level-boat="${i}" aria-pressed="${levelSelection===i}">第 ${i+1} 艘</button>`).join('')}</div><form id="level-profile-form"><label class="level-registered"><input id="level-registered" type="checkbox">這艘已登記，可以出航</label><div class="level-input-grid"><label>這艘目前 Rank<input id="level-rank" type="number" min="1" max="85" step="1" required></label><label>目前裝備配置<input id="level-code" inputmode="numeric" maxlength="4" pattern="[1-5]{4}" placeholder="例如 1111、3124" required><small>船體・船尾・船首・艦橋；1 鯊魚／2 甲鱟／3 鬚鯨／4 腔棘魚／5 希爾德拉</small></label><label>部隊主線已完成探索到<select id="level-progress">${levelMainIds.map(id=>{const s=levelSector(id);return `<option value="${id}">${levelSea(s.map)} ${s.code}・${esc(s.name)}（Rank ${s.rank}）</option>`;}).join('')}</select><small>還沒出航可先選溺沒海 B；這欄只表示主線，不表示支線全開。</small></label></div><label class="level-registered"><input id="level-next-known" type="checkbox">下一個主線區域已發現，但還沒完成探索</label><div class="guide-actions"><button class="btn primary" type="submit">儲存配置，告訴我下一步</button><span class="guide-caption" id="level-save-status" role="status"></span></div></form><div id="level-storage-notice" class="level-storage-notice"></div><div id="level-next-advice" aria-live="polite"></div></section>`;}
function levelRenderAdvice(){
 const root=$('#level-next-advice');if(!root)return;
 root.innerHTML='';document.querySelectorAll('[data-gear-node],tr[data-level-from]').forEach(n=>n.classList.remove('level-current','level-next'));
 const boat=levelProfiles.boats[levelSelection];
 try{
  const a=voyageGuideAdvice(DATA.voyageReference,DATA.levelingGuide,{...boat,progress:levelProfiles.progress,nextKnown:levelProfiles.nextKnown});
  const swaps=[...a.target].flatMap((family,slot)=>family!==a.code[slot]?[`${levelSlots[slot]}：${levelFamily[a.code[slot]]} → ${levelFamily[family]}`]:[]);
  let body=!boat.registered?'<p>先做鯊魚級船體、船尾、船首、艦橋各一件，登記這艘 1111；新船從 Rank 1 開始。第 2／3／4 艘還要先由主線 J／O／T 開出船位。</p>':!a.valid?'<p>目前 Rank 不符合這套普通部件的裝備等級或成本容量。先核對輸入；下方不會把這套當成能出航。</p>':swaps.length?`<p>這個階段建議 <b>${a.target}</b>。${swaps.map(esc).join('；')}。</p><p>已做過的零件直接換回；拆下的留著。下一步先確認零件，換裝後再更新配置。</p>`:a.explore?`<p>先跑 <b>${levelSea(a.explore.map)} ${a.explore.code}・${esc(a.explore.name)}</b>，Rank ${a.explore.rank} 起可去。${levelProfiles.nextKnown?'完成這個已發現的主線區域。':'重複探索，直到發現 '+levelSea(a.goal.map)+' '+a.goal.code+'。'}</p>`:a.ojReady?'<p>普通 3124 已到 Rank 85，且主線已通過 O。確認 O、J 都完成探索後，開始跑 <b>溺沒海 O → J</b>。</p>':`<p>下一區需 Rank ${a.waitForRank||'更高'}，先照下面推薦組合練級，夠等再前進。</p>`;
  root.innerHTML=`<div class="level-advice"><span class="guide-tag">第 ${levelSelection+1} 艘・${boat.registered?'Rank '+a.rank+'／'+esc(a.code):'尚未登記'}</span><h3>${a.action}</h3>${body}${boat.registered&&a.valid?`<div class="level-advice-route"><b>練級／等待主線時的備用路線</b><strong>${levelSea(a.stage.map)} ${a.stage.points.join(' → ')}・建議配置 ${a.stage.build}</strong><p>航點都已開、且已換成建議配置才照跑。缺點先依補圖鏈處理；首艘主線任務優先。</p><a href="#level-stage-${a.stage.from}">看這一段航點與補圖鏈 ↓</a></div>`:''}${swaps.length?`<a href="${BASE_PATH}/guide#guide-parts">看新做／沿用／必留零件 →</a>`:''}</div>`;
  if(boat.registered&&a.valid)document.querySelector(`[data-gear-node="${a.code}"]`)?.classList.add('level-current');
  if(a.code!==a.target)document.querySelector(`[data-gear-node="${a.target}"]`)?.classList.add('level-next');
  $('#level-gear-caption').textContent=boat.registered?`目前 ${a.code} → 本階段建議 ${a.target}。綠色是目前配置，金色是建議換往。`:'尚未登記；先做 1111。';
  $('#level-sea-caption').textContent=`目前已完成：${levelSea(a.progress.map)} ${a.progress.code}。${a.goal?'下一主線目標：'+levelSea(a.goal.map)+' '+a.goal.code:'主線足夠，接著練到 85 跑 OJ'}。連線是解鎖前置，一趟選點看等級表。`;
  document.querySelector(`#level-stage-${a.stage.from}`)?.classList.add('level-current');
 }catch(e){root.innerHTML=`<p class="level-input-error">${esc(e.message)}</p>`;}
}
function levelFillProfile(){
 const boat=levelProfiles.boats[levelSelection];$('#level-registered').checked=!!boat.registered;$('#level-rank').value=boat.rank;$('#level-code').value=boat.code;$('#level-progress').value=levelProfiles.progress;$('#level-next-known').checked=!!levelProfiles.nextKnown;
 document.querySelectorAll('[data-level-boat]').forEach(b=>{b.classList.toggle('primary',Number(b.dataset.levelBoat)===levelSelection);b.setAttribute('aria-pressed',Number(b.dataset.levelBoat)===levelSelection);});
 levelRenderAdvice();
}
function levelBindProfile(){levelBindSyncedProfile();}
const levelPreviousGuide=guidePage;guidePage=function(){
 levelPreviousGuide();const holder=document.createElement('div');holder.className='level-teaching';holder.innerHTML=levelCurrentPanel()+levelUpgradeTree()+levelingTable()+levelOpeningTasks();$('.guide-overview').after(holder);
 $('.hero h1').textContent='從 1 到 85，照這份一路跑。';$('.hero p').innerHTML='輸入目前配置，看下一步；首艘先開圖，其他艇照等級表練級。<br>已排入普通過渡件，回港後接續派航，不用自己到英文網站試算。';
 $('.guide-jumps').insertAdjacentHTML('afterbegin','<a href="#leveling-current">我的下一步</a><a href="#leveling-table">1～85 航點表</a><a href="#leveling-tree">看路線樹</a>');levelBindProfile();
};
voyagesPage=function(){
 $('#content').innerHTML=hero('從零到普通 3124','看現在，知道下一趟去哪。','輸入四位配置與 Rank，標出目前階段和下一步。<br>回港接續派航；已列好普通過渡配置與 1～85 推薦航點。')+`<nav class="guide-jumps" aria-label="航行教學"><a href="#leveling-current">我的下一步</a><a href="#leveling-tree">換裝與解鎖樹</a><a href="#leveling-table">1～85 航點表</a><a href="#leveling-opening">首艘先開哪裡</a></nav>`+levelCurrentPanel()+levelUpgradeTree()+levelingTable()+levelOpeningTasks()+`<section class="panel guide-chapter"><h2>每一步用料，回原本清單就看得到。</h2><p>材料會標示供應 1111、1121、3113 或 3124 的哪一階段。1123 換回舊件，新增材料 0。預設只列缺料，想盤點時可顯示全部。</p>${guideMaterialsLink()}</section><section class="panel guide-chapter"><h2>85 級後怎麼接收益？</h2>${guideIncomeCopy()}</section>`+guideReferenceSection();levelBindProfile();
};

if(page==='voyages')document.title='哈沁咪@泰坦｜航線與練級';
