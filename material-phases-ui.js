function renderMaterialPhaseTags(root,fleet,scope){
 if(!root||loading||!online)return;
 const uses=materialPhaseUses(DATA,state,fleet,scope,schematicState);
 root.querySelectorAll('.material-phase-tags').forEach(n=>n.remove());
 root.querySelectorAll('tr[data-id]').forEach(row=>{const node=DATA.inventoryNodes.find(n=>n.id===row.dataset.id),entries=node?uses[node.name]||[]:[];if(!entries.length)return;const group=document.createElement('div');group.className='material-phase-tags';group.innerHTML='<span>用在</span>'+entries.map(e=>`<a class="phase-use ${e.kind}" href="${BASE_PATH}/guide#${e.kind==='unlock'?'guide-reserves':'guide-stage-'+e.id}">${esc(e.label)}</a>`).join('');row.firstElementChild.append(group);});
}
const phaseRows=renderRows;renderRows=function(){phaseRows();if(page==='workshop')renderMaterialPhaseTags($('#rows'),fleetCount,stage);};
const phasePlan=renderPlan;renderPlan=function(){phasePlan();if(page==='planner')renderMaterialPhaseTags($('#simple-stock-rows'),savedCalculation?.fleet||fleetCount,savedCalculation?.stage||stage);};
