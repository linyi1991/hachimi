// Existing partner fields keep their identity; the second participant owns the remainder.
export function collaboration(i,s){
 const secondary=s.owner||'浮光若水',primary=secondary==='哈沁咪'?'浮光若水':'哈沁咪';
 const total=s.collected||0,secondDone=s.partner_done||0,secondTarget=s.partner_target||0;
 const remaining=Math.max(0,i.total-total),partner=Math.min(remaining,Math.max(0,secondTarget-secondDone));
 return {remaining,partner,mine:remaining-partner,total,people:[{name:primary,target:i.total-secondTarget,done:total-secondDone,left:remaining-partner},{name:secondary,target:secondTarget,done:secondDone,left:partner}]};
}
