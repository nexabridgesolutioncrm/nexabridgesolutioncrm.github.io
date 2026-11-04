/* NexaBridge CRM: offline static-shell cache only, never caches Supabase/CRM API data.
   Sheet data/drafts are separately opt-in through IndexedDB in Sheets Studio. */
const VERSION='nexa-crm-shell-4.4.1';
const ASSETS=['./','./index.html','./crm-v3.css','./crm-api.js','./crm-v3.js',
 './crm-formulas.js','./crm-sheet-features.js','./crm-sheet-offline.js','./crm-sheet-studio.js'];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  await Promise.all(ASSETS.map(async path=>{
   try{const response=await fetch(new Request(path,{cache:'reload'}));if(response.ok)await cache.put(path,response)}catch(_){}
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('nexa-crm-shell-')&&key!==VERSION)await caches.delete(key);
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.includes('/api/')||url.pathname.includes('/functions/')||url.pathname.includes('/auth/'))return;
 const path=url.pathname.split('/').pop()||'index.html';
 if(!/^(index\.html|crm-v3\.css|crm-api\.js|crm-v3\.js|crm-formulas\.js|crm-sheet-features\.js|crm-sheet-offline\.js|crm-sheet-studio\.js)$/.test(path))return;
 event.respondWith((async()=>{
  const cache=await caches.open(VERSION);
  try{
   const response=await fetch(request);
   if(response.ok)cache.put(request,response.clone()).catch(()=>{});
   return response;
  }catch(_){
   return await cache.match(request,{ignoreSearch:true})||
    await cache.match('./'+path)||new Response('Offline asset unavailable',{status:503});
  }
 })());
});
