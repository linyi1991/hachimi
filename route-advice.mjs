import {voyageBuild} from './voyage-reference.mjs';
export function levelingBuildFor(rank,grayOpen=false){return rank>=85?'3124':rank>=50&&grayOpen?'1123':rank>=25?'3113':rank>=20?'1121':'1111';}
export function voyageGuideAdvice(reference,guide,input){
 const rank=Number(input.rank),code=String(input.code||'');
 if(!Number.isInteger(rank)||rank<1||rank>85)throw Error('請填 1～85 的 Rank。');
 if(!/^[1-5]{4}$/.test(code))throw Error('配置請填四位代號，每位 1～5，例如 1111、3124。改裝版不在這份普通版教學內。');
 const build=voyageBuild(reference,rank,code),progress=reference.sectors.find(s=>s.id===Number(input.progress));
 if(!progress||progress.start)throw Error('請選擇有效的開圖進度。');
 const grayOpen=progress.map===2||input.progress===30&&input.nextKnown===true;
 const target=levelingBuildFor(rank,grayOpen),stage=guide.stages.find(s=>rank>=s.from&&rank<=s.to);
 const main=[2,5,10,14,15,19,20,25,26,27,28,30,32,33,34,37,38,39,42,51],index=main.indexOf(progress.id);
 if(index<0)throw Error('請選主線進度。');
 const next=reference.sectors.find(s=>s.id===main[index+1]);
 // After reaching 85, complete the O/J prerequisites rather than continuing deeper maps.
 const goal=rank>=85&&index>=4?null:next;
 const explore=goal&&input.nextKnown?goal:goal?progress:null;
 let action=!input.registered?'登記潛水艇':!build.valid?'目前配置尚不能裝備':code!==target?'先換裝':goal&&explore.rank<=rank?'先開圖／完成探索':rank>=85?'開始 OJ 收益航線':'繼續練級';
 const fallback=guide.stages.find(s=>s.from===34);
 const route=rank>=50&&!grayOpen&&rank<85?fallback:stage;
 return {rank,code,target,valid:build.valid,grayOpen,action,stage:route,progress,goal,explore:explore&&explore.rank<=rank?explore:null,waitForRank:goal&&goal.rank>rank?goal.rank:null,ojReady:rank>=85&&index>=4};
}
