// Put the preparation requirement next to the physical stock, using saved project scope.
const stockNeedsPage=plannerPage;plannerPage=function(){stockNeedsPage();const note=document.createElement('div');note.id='stock-needs-scope';note.className='stock-needs-scope';$('#simple-stock .boardhead').after(note);renderStockNeeds();};
const stockNeedsPlan=renderPlan;renderPlan=function(){stockNeedsPlan();renderStockNeeds();};
function renderStockNeeds(){
 const root=$('#simple-stock-rows'),note=$('#stock-needs-scope');if(page!=='planner'||!root)return;
 const header=$('.simple-stock-table thead tr');if(!header.querySelector('[data-need-heading]')){const th=document.createElement('th');th.dataset.needHeading='1';th.textContent='目前需用';header.children[1].before(th);const lack=document.createElement('th');lack.dataset.needHeading='1';lack.textContent='還缺';header.children[3].before(lack);}
 if(loading||!online){root.querySelector('[colspan]')?.setAttribute('colspan','5');return;}
 const fleet=savedCalculation?.fleet||fleetCount,scope=savedCalculation?.stage||'all',label=scope==='all'?'從零 1111 → 3124 全程（含過渡）':scope==='upgrade'?'所有升級材料（不含第一套）':DATA.route.steps.find(s=>s.id===scope)?.label||scope;
 const plan=Object.fromEntries(preparationPlan(DATA,state,fleet,scope,schematicState).map(n=>[n.id,n])),locked=unlockReservation(DATA,state,schematicState);
 if(note)note.innerHTML=`<strong>計算目標：${fleet} 艘・${esc(label)}</strong><p>「目前需用」是扣掉已備妥成品、半成品後，自製剩餘成品所需的數量；含另外必留的解鎖用料。「還缺」已扣可用庫存。原料與它能做出的半成品是同一條製作鏈，不能把兩層再相加。</p><p>數量依已儲存庫存計算；製作後請同步更新原料和產出品。<a href="${BASE_PATH}/">調整船數／階段並儲存 →</a></p>`;
 root.querySelectorAll('[data-stock-need]').forEach(cell=>cell.remove());
 root.querySelectorAll('tr[data-id]').forEach(row=>{const n=plan[row.dataset.id];if(!n)return;const hold=locked.required[n.name]||0,need=n.need+hold,short=n.short+(locked.short[n.name]||0),ignored=ignoreCrystals&&/碎晶|水晶|晶簇/.test(n.name);const cell=document.createElement('td');cell.dataset.stockNeed='1';cell.className='stock-needs-value';cell.dataset.label='目前需用';cell.innerHTML=`<strong>${num(need)}</strong>${hold?`<div class="stock-must-keep">含必留 ${num(hold)}・禁止挪用</div>`:''}${n.direct?'<div class="tiny">剩餘需交工房的量</div>':''}`;row.children[1].before(cell);const lack=document.createElement('td');lack.dataset.stockNeed='1';lack.dataset.label='還缺';lack.className='stock-needs-value '+(short?'missing':'done');lack.innerHTML=ignored?'<span class="tiny">個人自備</span>':`<strong>${num(short)}</strong>${need===0?'<div class="tiny">本次不用再準備</div>':''}`;row.children[3].before(lack);row.children[2].dataset.label='現有數量';});
 root.querySelector('[colspan]')?.setAttribute('colspan','5');
}
