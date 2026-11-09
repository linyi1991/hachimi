// A material order is a gathering request, never a receipt or a stock movement.
export function retainerOrder(data,lines){
 if(!Array.isArray(lines)||lines.length>data.inventoryNodes.length)throw Error('清單項目過多');
 const totals=new Map();for(const line of lines){const n=data.inventoryNodes.find(n=>n.id===line.id);if(!n||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>1000000)throw Error('請選有效材料，數量填 1～1,000,000 的整數');const quantity=(totals.get(n.id)||0)+line.quantity;if(quantity>1000000)throw Error('同一材料合計不可超過 1,000,000');totals.set(n.id,quantity);}
 return [...totals].map(([id,quantity])=>({id,quantity,name:data.inventoryNodes.find(n=>n.id===id).name}));
}
export function retainerText(data,lines){return retainerOrder(data,lines).map(n=>n.name+':'+n.quantity).join('\n');}
