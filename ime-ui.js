// Keep IME pre-edit text in its original input until the user commits a character.
const composingInputs=new Set(),pendingComposition=new Set(),compositionTimers=new WeakMap();
function compositionActive(){for(const input of composingInputs)if(!input.isConnected)composingInputs.delete(input);return composingInputs.size>0||pendingComposition.size>0;}
document.addEventListener('compositionstart',e=>{clearTimeout(compositionTimers.get(e.target));pendingComposition.delete(e.target);composingInputs.add(e.target);},true);
document.addEventListener('compositionend',e=>{const input=e.target;composingInputs.delete(input);pendingComposition.add(input);clearTimeout(compositionTimers.get(input));compositionTimers.set(input,setTimeout(()=>{pendingComposition.delete(input);compositionTimers.delete(input);if(input.isConnected)input.dispatchEvent(new Event('input',{bubbles:true}));},0));},true);
document.addEventListener('input',e=>{if(e.isComposing||composingInputs.has(e.target)){e.stopImmediatePropagation();return;}clearTimeout(compositionTimers.get(e.target));compositionTimers.delete(e.target);pendingComposition.delete(e.target);},true);
// Enter confirms an IME candidate; it must not also submit/search/save.
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.isComposing||e.keyCode===229||composingInputs.has(e.target)))e.stopImmediatePropagation();},true);
