// Unassigned work stays unclaimed until someone explicitly takes the remainder.
export function collaboration(i,s){
 const secondary=s.owner||'浮光若水',primary=secondary==='哈沁咪'?'浮光若水':'哈沁咪';
 const total=s.collected||0,history=Math.min(i.total,s.history_delivered||0),secondDone=s.partner_done||0,secondTarget=Math.min(s.partner_target||0,Math.max(0,i.total-history));
 const firstDone=Math.max(0,total-history-secondDone),firstTarget=s.self_claimed===1?Math.max(0,i.total-history-secondTarget):0,unclaimed=Math.max(0,i.total-history-firstTarget-secondTarget),remaining=Math.max(0,i.total-total);
 // Extra completed stock offsets other outstanding targets once, including unclaimed work.
 let spare=Math.max(0,firstDone-firstTarget)+Math.max(0,secondDone-secondTarget);
 const take=amount=>{const left=Math.max(0,amount-spare);spare=Math.max(0,spare-amount);return left;};
 const partner=take(Math.max(0,secondTarget-secondDone)),mine=take(Math.max(0,firstTarget-firstDone)),unclaimedLeft=take(unclaimed);
 return {remaining,partner,mine,total,history,unclaimed,unclaimedLeft,people:[{name:primary,target:firstTarget,done:firstDone,left:mine},{name:secondary,target:secondTarget,done:secondDone,left:partner}]};
}

export function fleetRequired(i,fleet=4,stage='all'){
 if(!Number.isInteger(fleet)||fleet<1||fleet>4)throw Error('艘數必須為 1 至 4');
 return (stage==='start'?i.start:stage==='upgrade'?i.upgrade:i.stepNeeds?.[stage]??i.total)*fleet/4;
}

export function stepOffset(i,stage){if(stage==='all'||stage==='start')return 0;if(stage==='upgrade')return i.start;let total=0;for(const[id,q]of Object.entries(i.stepNeeds||{})){if(id===stage)return total;total+=q;}return 0;}
