import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const listeners={},timers=new Map();let sequence=0,calls=0,submits=0;
const document={addEventListener(type,fn){(listeners[type]||=[]).push(fn);}};
const input={isConnected:true,value:'',dispatchEvent(event){fire(event.type,this);}};
const context=vm.createContext({document,Event,Set,WeakMap,setTimeout(fn){const id=++sequence;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});vm.runInContext(await fs.readFile('ime-ui.js','utf8'),context);
function fire(type,target=input,props={}){let stopped=false;const event={type,target,...props,stopImmediatePropagation(){stopped=true;}};for(const fn of listeners[type]||[]){fn(event);if(stopped)return;}if(type==='input')calls++;if(type==='keydown'&&event.key==='Enter')submits++;}
function active(){return vm.runInContext('compositionActive()',context);}function flush(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}}
fire('compositionstart');input.value='ㄏㄨ';fire('input',input,{isComposing:true});fire('keydown',input,{key:'Enter',isComposing:true,keyCode:229});assert.equal(calls,0);assert.equal(submits,0);assert(active());
input.value='胡';fire('compositionend');assert(active());fire('input',input,{isComposing:false});flush();assert.equal(calls,1,'native commit processes once');assert(!active());
fire('compositionstart');input.value='胡桃';fire('input',input,{isComposing:true});fire('compositionend');flush();assert.equal(calls,2,'compositionend fallback commits if browser omits final input');assert(!active());
fire('input');assert.equal(calls,3,'normal editing stays immediate');fire('keydown',input,{key:'Enter',isComposing:false,keyCode:13});assert.equal(submits,1);
fire('compositionstart');input.isConnected=false;assert(!active(),'detached inputs cannot freeze refresh');
console.log('Passed: IME pre-edit is deferred, native/fallback Chinese commits process once, candidate Enter does not submit, normal text remains immediate, and refresh is protected.');
