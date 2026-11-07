import {fleetRequired,fleetSummary} from './collaboration.mjs';
export function routeComparison(data,state,fleet=4){
 const rows=data.items.map(i=>{const start=fleetRequired(i,fleet,'start'),full=fleetRequired(i,fleet,'all'),prepared=Math.max(0,state[i.id]?.collected||0);return {...i,startNeed:start,fullNeed:full,startLack:Math.max(0,start-prepared),fullLack:Math.max(0,full-prepared)};});
 return {rows,start:fleetSummary(data,state,fleet,'start'),full:fleetSummary(data,state,fleet,'all')};
}
