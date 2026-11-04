/* NexaBridge Sheets Studio offline draft queue.
   Explicit opt-in, IndexedDB-scoped by account/org/sheet and revision-safe replay.
   Not a substitute for an offline Supabase login or Google Sheets offline mode. */
(function(global){
 'use strict';
 let ctx=null,enabled=false,pending=new Map(),dbPromise=null,replaying=false,events=false;
 const $=s=>ctx?.state.root?.querySelector(s);
 const e=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
 const valid=/^[A-Z]{1,3}[1-9][0-9]{0,4}$/;
 const userKey=()=>{
  const u=ctx?.state.user;
  const org=global.nexaSheetsRealtimeCredentials?.()?.orgId||'org';
  return u?.id?org+':'+u.id:null;
 };
 const sheetKey=()=>ctx?.state.active?.id;
 const settingKey=()=>userKey()?'nexa-offline-optin:'+userKey():'';
 function openDB(){
  if(dbPromise)return dbPromise;
  if(!global.indexedDB)return Promise.reject(Error('Offline drafts require IndexedDB browser support'));
  dbPromise=new Promise((resolve,reject)=>{
   const req=global.indexedDB.open('NexaBridgeSheetsDrafts',1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('drafts'))req.result.createObjectStore('drafts',{keyPath:'key'})};
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||Error('Cannot open offline draft database'));
  }).catch(e=>{dbPromise=null;throw e});
  return dbPromise;
 }
 async function allDrafts(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
   const req=db.transaction('drafts','readonly').objectStore('drafts').getAll();
   req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
  });
 }
 async function put(item){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts','readwrite');
   tx.objectStore('drafts').put(item);tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
  });
 }
 async function del(key){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts','readwrite');
   tx.objectStore('drafts').delete(key);
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
 }
 function syncStatus(){
  if(!ctx)return;
  const label=$('#sfOfflineCount');
  if(label)label.textContent=enabled?'Offline drafts: '+pending.size:'Offline drafts off';
 }
 function toolbar(){
  return '<button class="btn" data-sheet-action="so-toggle">'+(enabled?'● Offline drafts on':'○ Enable offline drafts')+'</button>'+
   (pending.size?'<button class="btn" data-sheet-action="so-review"><span id="sfOfflineCount">'+pending.size+' unsynced</span></button>':'');
 }
 async function bind(context){
  ctx=context;pending=new Map();
  try{enabled=global.localStorage.getItem(settingKey())==='true'}catch(_){enabled=false}
  if(!events){events=true;global.addEventListener('online',()=>{if(ctx&&enabled)flush().catch(()=>{})})}
 }
 function leave(){ctx=null;pending.clear();enabled=false;replaying=false}
 async function afterOpen(){
  pending.clear();
  if(!enabled||!userKey()||!sheetKey())return;
  try{
   const drafts=await allDrafts(),prefix=userKey()+':'+sheetKey()+':';
   for(const item of drafts)if(item.key.startsWith(prefix))pending.set(item.address,item);
   overlay();syncStatus();
  }catch(e){ctx?.notice('Offline drafts unavailable: '+e.message,true)}
 }
 function overlay(){
  if(!ctx||!sheetKey())return;
  for(const item of pending.values()){
   const current=ctx.state.cells.get(item.address);
   ctx.state.cells.set(item.address,{...(current||{}),address:item.address,raw_value:item.value,
    revision:item.revision,offline:true});
  }
 }
 function canQueue(e){
  return enabled&&(!global.navigator.onLine||/network|failed to fetch|fetch failed|offline|networkerror|timeout/i.test(String(e?.message||'')));
 }
 async function queue(address,value,revision){
  if(!enabled)throw Error('Enable offline drafts first');
  const user=userKey(),sheet=sheetKey();
  if(!user||!sheet||!valid.test(address))throw Error('Offline save not available');
  const previous=pending.get(address);
  const item={key:user+':'+sheet+':'+address,account:user,sheet,address,
   value:String(value),revision:previous?.revision??revision,queued_at:new Date().toISOString(),conflict:false};
  if(item.value.length>4000)throw Error('Cell value exceeds 4000 characters');
  await put(item);
  pending.set(address,item);
  ctx.state.cells.set(address,{address,raw_value:item.value,revision:item.revision,offline:true});
  ctx.paint();ctx.notice('Saved local offline draft for '+address+'; not yet synchronized',true);
  return {queued:true,address,raw_value:item.value,revision:item.revision};
 }
 async function write(address,value,revision){
  if(enabled&&!global.navigator.onLine)return queue(address,value,revision);
  try{
   return await ctx.api('sheets/'+sheetKey()+'/cell',{method:'POST',body:{address,value,revision}});
  }catch(e){if(canQueue(e))return queue(address,value,revision);throw e}
 }
 async function flush(){
  if(replaying||!ctx||!enabled||!pending.size||!global.navigator.onLine)return;
  const key=sheetKey(),account=userKey();
  replaying=true;let done=0,conflicts=0;
  try{
   const remote=await ctx.api('sheets/'+key);
   if(!ctx||sheetKey()!==key||userKey()!==account)return;
   const latest=new Map((remote.cells||[]).map(x=>[x.address,x]));
   for(const item of [...pending.values()]){
    if(!ctx||sheetKey()!==key||userKey()!==account)break;
    const current=latest.get(item.address),revision=current?.revision||0;
    if(revision!==item.revision){
     item.conflict=true;pending.set(item.address,item);
     await put(item);conflicts++;continue;
    }
    try{
     const saved=await ctx.api('sheets/'+key+'/cell',{method:'POST',
      body:{address:item.address,value:item.value,revision:item.revision}});
     await del(item.key);pending.delete(item.address);ctx.state.cells.set(item.address,saved);
     latest.set(item.address,saved);done++;
    }catch(e){
     if(canQueue(e))break;
     item.conflict=true;pending.set(item.address,item);await put(item);conflicts++;
    }
   }
   overlay();ctx.paint();
   ctx.notice('Synced '+done+' offline changes'+(conflicts?' · '+conflicts+' require review':''),conflicts>0);
  }catch(e){ctx?.notice('Offline sync postponed: '+e.message,true)}
  finally{replaying=false;syncStatus()}
 }
 async function review(){
  if(!ctx)return;
  const list=[...pending.values()];
  ctx.showModal('<h2>Offline drafts</h2><p>Offline drafts remain on this device until safely synced or explicitly discarded. You can copy any draft before removing it.</p>'+
   '<div class="sf-offline-list">'+(list.length?list.map(item=>
    '<div class="sf-offline-item"><div><strong>'+e(item.address)+'</strong><small>'+e(item.queued_at)+' · '+(item.conflict?'CONFLICT':'Pending sync')+'</small><pre>'+e(item.value)+'</pre></div>'+
    '<div class="actions"><button class="btn small" data-sheet-action="so-copy" data-address="'+e(item.address)+'">Copy</button>'+
    '<button class="btn small danger" data-sheet-action="so-discard" data-address="'+e(item.address)+'">Discard</button></div></div>').join(''):'<p>No pending drafts.</p>')+'</div>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Close</button>'+
   '<button class="btn primary" data-sheet-action="so-sync">Sync drafts</button></div>');
 }
 async function action(name,el){
  if(name==='so-toggle'){
   if(!enabled){
    if(!global.confirm('Enable offline drafts on this device? Unsynced cell contents are stored in browser IndexedDB without encryption. Do not enable on shared computers.'))return true;
    await openDB();
   }else if(pending.size){
    ctx.notice('Synchronize or explicitly discard offline drafts before disabling offline support',true);return true;
   }
   enabled=!enabled;
   try{global.localStorage.setItem(settingKey(),String(enabled))}catch(_){}
   if(enabled)await afterOpen();
   ctx.paint();ctx.notice(enabled?'Offline drafts enabled on this device':'Offline drafts disabled');
   return true;
  }
  if(name==='so-review'){await review();return true}
  if(name==='so-sync'){ctx.state.root.querySelector('.studio-modal-layer')?.remove();await flush();return true}
  if(name==='so-copy'){
   const item=pending.get(el.dataset.address);
   if(!item)throw Error('Offline draft unavailable');
   if(!navigator.clipboard?.writeText)throw Error('Clipboard not available');
   await navigator.clipboard.writeText(item.value);ctx.notice('Draft copied');return true;
  }
  if(name==='so-discard'){
   const item=pending.get(el.dataset.address);
   if(!item)return true;
   if(!global.confirm('Discard the local unsynced value for '+item.address+'? This cannot be undone.'))return true;
   await del(item.key);pending.delete(item.address);
   try{const data=await ctx.api('sheets/'+sheetKey());ctx.state.cells=new Map(data.cells.map(x=>[x.address,x]));overlay()}catch(_){}
   await review();ctx.paint();ctx.notice('Draft discarded');return true;
  }
  return false;
 }
 global.NexaSheetOffline={bind,afterOpen,leave,overlay,toolbar,write,flush,action,pending:()=>pending,enabled:()=>enabled};
})(window);
