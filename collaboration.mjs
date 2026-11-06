// Existing partner fields keep their identity; the second participant owns the remainder.
export function collaboration(i,s){
 const secondary=s.owner||'浮光若水',primary=secondary==='哈沁咪'?'浮光若水':'哈沁咪';
 const total=s.collected||0,history=Math.min(i.total,s.history_delivered||0),secondDone=s.partner_done||0,secondTarget=Math.min(s.partner_target||0,Math.max(0,i.total-history));
 const remaining=Math.max(0,i.total-total),partner=Math.min(remaining,Math.max(0,secondTarget-secondDone));
 return {remaining,partner,mine:remaining-partner,total,history,people:[{name:primary,target:i.total-history-secondTarget,done:total-history-secondDone,left:remaining-partner},{name:secondary,target:secondTarget,done:secondDone,left:partner}]};
}

export function fleetRequired(i,fleet=4,stage='all'){
 if(!Number.isInteger(fleet)||fleet<1||fleet>4)throw Error('艘數必須為 1 至 4');
 return (stage==='start'?i.start:stage==='upgrade'?i.upgrade:i.stepNeeds?.[stage]??i.total)*fleet/4;
}

export function stepOffset(i,stage){if(stage==='all'||stage==='start')return 0;if(stage==='upgrade')return i.start;let total=0;for(const[id,q]of Object.entries(i.stepNeeds||{})){if(id===stage)return total;total+=q;}return 0;}
