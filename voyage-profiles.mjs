export function defaultVoyageProfiles(){return {version:1,progress:2,nextKnown:false,boats:Array.from({length:4},()=>({registered:false,rank:1,code:'1111'}))};}
export function validateVoyageProfiles(value){
 const main=[2,5,10,14,15,19,20,25,26,27,28,30,32,33,34,37,38,39,42,51];
 if(!value||value.version!==1||!main.includes(value.progress)||typeof value.nextKnown!=='boolean'||!Array.isArray(value.boats)||value.boats.length!==4)throw Error('請填有效的四艘配置與主線進度。');
 const boats=value.boats.map(b=>{
  if(!b||typeof b.registered!=='boolean'||!Number.isInteger(b.rank)||b.rank<1||b.rank>85||typeof b.code!=='string'||!/^[1-5]{4}$/.test(b.code))throw Error('每艘請填 1～85 的 Rank 與四位普通配置代號（1～5）。');
  return {registered:b.registered,rank:b.rank,code:b.code};
 });
 let completedParts;if(value.completedParts!==undefined){if(!value.completedParts||typeof value.completedParts!=='object'||Array.isArray(value.completedParts)||Object.keys(value.completedParts).length>20)throw Error('已做好零件格式不正確。');completedParts={};for(const [id,q]of Object.entries(value.completedParts)){if(!/^(?:[1-9]|1[0-9]|20)$/.test(id)||!Number.isSafeInteger(q)||q<0||q>40)throw Error('零件數量請填 0～40 的整數。');completedParts[id]=q;}}
 return {version:1,progress:value.progress,nextKnown:value.nextKnown,boats,...(completedParts?{completedParts}:{})};
}
// Track the total number of completed parts, including equipped and stored old parts.
export function voyageEquippedParts(profiles){const counts={};for(const b of profiles.boats)if(b.registered)for(const [slot,f]of [...b.code].entries()){const id=4*(Number(f)-1)+[3,4,1,2][slot];counts[id]=(counts[id]||0)+1;}return counts;}
export function retainVoyageParts(value,previous=defaultVoyageProfiles(),correct=false){
 const next=validateVoyageProfiles(value),old=validateVoyageProfiles(previous),equipped=voyageEquippedParts(next),parts=correct?{...(next.completedParts||{})}:{...(old.completedParts||{})};
 if(!correct)for(const source of [voyageEquippedParts(old),next.completedParts||{},equipped])for(const [id,q]of Object.entries(source))parts[id]=Math.max(parts[id]||0,q);
 if(correct&&Object.entries(equipped).some(([id,q])=>(parts[id]||0)<q))throw Error('零件總數不能少於目前裝在四艘船上的數量。');
 next.completedParts=parts;return next;
}
// Source selection and stale-response guards are independent of the DOM and inventory.
export function createVoyageProfileSync({loadGuest,saveGuest,readShared,writeShared}){
 let key=null,epoch=0,readSequence=0,profiles=defaultVoyageProfiles(),revision=0,ready=false,saving=false,remote=null,updatedBy='',updatedAt='';
 const snapshot=()=>({profiles:structuredClone(profiles),revision,ready,saving,remote:remote?{...remote}:null,updatedBy,updatedAt,shared:key!=='guest'});
 function enter(nextKey){
  if(nextKey===key)return false;
  key=nextKey;epoch++;readSequence++;revision=0;ready=nextKey==='guest';saving=false;remote=null;updatedBy='';updatedAt='';profiles=defaultVoyageProfiles();
  if(ready)try{profiles=validateVoyageProfiles(loadGuest());}catch{}
  return true;
 }
 function install(data){const next=validateVoyageProfiles(data.profiles);if(!Number.isSafeInteger(data.revision)||data.revision<0)throw Error('共同配置版本無效，請重新讀取。');profiles=next;revision=data.revision;updatedBy=data.updatedBy||'';updatedAt=data.updatedAt||'';ready=true;remote=null;}
 async function read(nextKey,dirty=false){
  const switched=enter(nextKey);
  if(saving)return {applied:false,switched,...snapshot()};
  if(key==='guest'){
   let next;try{next=validateVoyageProfiles(loadGuest());}catch{next=defaultVoyageProfiles();}
   const editing=typeof dirty==='function'?dirty():dirty,applied=!editing&&JSON.stringify(next)!==JSON.stringify(profiles);if(applied)profiles=next;
   return {applied:switched||applied,switched,...snapshot()};
  }
  const at=epoch,sequence=++readSequence,data=await readShared(nextKey);
  if(at!==epoch||sequence!==readSequence||saving)return {applied:false,discarded:true,...snapshot()};
  const editing=typeof dirty==='function'?dirty():dirty;
  if(editing&&ready){if(data.revision!==revision)remote={revision:data.revision,updatedBy:data.updatedBy||'',updatedAt:data.updatedAt||''};return {applied:false,...snapshot()};}
  const applied=!ready||data.revision!==revision;if(applied)install(data);
  return {applied,switched,...snapshot()};
 }
 async function save(nextKey,value,correctParts=false){
  if(nextKey!==key||!ready)throw Error('請先讀取目前的共同配置，再儲存。');
  if(saving)throw Error('正在儲存，請稍候。');
  const next=retainVoyageParts(value,profiles,correctParts),at=epoch;readSequence++;saving=true;
  try{
   if(key==='guest'){await saveGuest(next);if(at!==epoch)return {discarded:true,...snapshot()};profiles=next;remote=null;return snapshot();}
   const data=await writeShared({profiles:next,revision,correctParts},nextKey);if(at!==epoch)return {discarded:true,...snapshot()};install(data);return snapshot();
  }finally{if(at===epoch)saving=false;}
 }
 return {enter,snapshot,read,save};
}
