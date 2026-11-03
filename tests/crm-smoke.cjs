const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const index=fs.readFileSync('index.html','utf8');
const api=fs.readFileSync('crm-api.js','utf8'),app=fs.readFileSync('crm-v3.js','utf8');
const html=index
 .replace(/<link[^>]+rel="stylesheet"[^>]*>/g,'')
 .replace(/<script src="\.\/crm-api\.js[^"]*"><\/script>/,()=>'<script>'+api+'</script>')
 .replace(/<script src="\.\/crm-v3\.js[^"]*"><\/script>/,()=>'<script>'+app+'</script>');
const state={
 leads:[{id:'l1',org_id:'o1',name:'Sample Lead',company:'Example Co',phone:'1234567',email:'lead@example.test',status:'new',owner:'Demo',source:'website',interest:'Support',notes:'',followup:null,created_at:'2026-11-03T00:00:00Z'}],
 clients:[],deals:[],tasks:[],jobs:[],documents:[],calendar_events:[],activities:[],payments:[],notifications:[],members:[],other:[]
};
let calls=[];
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})}
async function mockFetch(input,options={}){
 const url=new URL(typeof input==='string'?input:input.url,'https://crm.test');
 const path=url.pathname,method=(options.method||'GET').toUpperCase();calls.push({path,method});
 if(path==='/auth/v1/token')return json({access_token:'fake-access',refresh_token:'fake-refresh'});
 if(path==='/auth/v1/user')return json({id:'u1',email:'owner@example.test'});
 if(path==='/auth/v1/logout')return json({});
 if(path==='/rest/v1/crm_members')return json([{org_id:'o1',role:'owner'}]);
 if(path==='/rest/v1/crm_organizations')return json([{id:'o1',name:'NexaBridge Solutions'}]);
 if(path==='/functions/v1/nexabridge-team-admin')return json({members:[]});
 if(path.startsWith('/rest/v1/')){
  let kind=path.replace('/rest/v1/crm_',''),rows=state[kind]||state.other;
  if(method==='GET')return json(rows);
  if(method==='PATCH'){
   const match=url.searchParams.get('id')||'';
   const id=match.replace('eq.','');
   let row=rows.find(x=>x.id===id);
   if(!row)return json([]);
   Object.assign(row,JSON.parse(options.body||'{}'));
   return json([row]);
  }
  if(method==='POST'){
   const record=JSON.parse(options.body||'{}');
   const row={id:'created-'+(rows.length+1),created_at:new Date().toISOString(),...record};
   rows.unshift(row);return json([row],201);
  }
  if(method==='DELETE')return json([{id:'l1'}]);
 }
 return json({message:'mock route not found: '+path},404);
}
const errors=[];
const virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{
 url:'https://crm.test/',
 runScripts:'dangerously',
 pretendToBeVisual:true,
 virtualConsole,
 beforeParse(win){
  win.fetch=mockFetch;
  win.Response=Response;
  win.Headers=Headers;
  win.Request=Request;
  win.scrollTo=()=>{};
  win.confirm=()=>true;
  win.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  win.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new win.Event('close'))};
  Object.defineProperty(win.navigator,'clipboard',{value:{writeText:async()=>{}}});
 }
});
const document=dom.window.document;
const wait=async(condition,step)=>{for(let n=0;n<150;n++){if(condition())return;await new Promise(r=>setTimeout(r,20))}throw new Error('Timed out: '+step)};
(async()=>{
 await wait(()=>document.querySelector('#loginForm'),'show login');
 const form=document.querySelector('#loginForm');
 form.elements.username.value='owner@example.test';form.elements.password.value='test-password';
 form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>document.querySelector('.navbtn[data-page="leads"]'),'sign in and load workspace');
 assert.match(document.querySelector('#main').textContent,/Active leads/);
 document.querySelector('.navbtn[data-page="leads"]').click();
 await wait(()=>document.querySelector('#grid'),'open lead spreadsheet');
 assert.match(document.querySelector('#grid').textContent,/Sample Lead/);
 assert.equal(document.querySelectorAll('#grid tbody tr').length,1);
 document.querySelector('[data-action="open"][data-kind="leads"]').click();
 await wait(()=>document.querySelector('[data-action="back"]'),'lead detail');
 assert.match(document.querySelector('#main').textContent,/Example Co/);
 assert.equal(document.querySelectorAll('[data-action="back"]').length,2);
 document.querySelector('[data-action="back"]').click();
 await wait(()=>document.querySelector('#grid'),'back to lead list');
 const nameCell=document.querySelector('.gridcell[data-field="name"]');
 nameCell.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true}));
 const input=document.querySelector('#grid input.select');
 assert.ok(input,'Cell editor appears');
 input.value='Edited Lead';
 input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 await wait(()=>state.leads[0].name==='Edited Lead','cell saving through Supabase adapter');
 await wait(()=>document.querySelector('.gridcell[data-field="name"]'),'cell grid after save');
 assert.match(document.querySelector('#grid').textContent,/Edited Lead/);
 document.querySelector('[data-action="undo"]').click();
 await wait(()=>state.leads[0].name==='Sample Lead','undo persisted edit');
 document.querySelector('[data-action="new"][data-kind="leads"]').click();
 await wait(()=>document.querySelector('#entryForm'),'create new lead form');
 const add=document.querySelector('#entryForm');
 add.elements.name.value='Created Test Lead';
 add.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>state.leads.length===2,'new record API create');
 await wait(()=>document.querySelector('#grid')?.textContent.includes('Created Test Lead'),'rendered saved lead');
 await new Promise(resolve=>setTimeout(resolve,250));
 assert.ok(calls.some(x=>x.path==='/rest/v1/crm_leads'&&x.method==='POST'));

 document.querySelector('[data-action="paste"]').click();
 await wait(()=>document.querySelector('#pasteArea'),'paste spreadsheet dialog');
 document.querySelector('#pasteArea').value='name\tcompany\nImported Lead\tImported Co';
 document.querySelector('[data-action="previewPaste"]').click();
 await wait(()=>document.querySelector('[data-action="runImport"]'),'import preview');
 document.querySelector('[data-action="runImport"]').click();
 await wait(()=>state.leads.length===3,'CSV/TSV import');
 await wait(()=>document.querySelector('#grid')?.textContent.includes('Imported Lead'),'import rendered');
 await new Promise(resolve=>setTimeout(resolve,120));
 const search=document.querySelector('#globalSearch');
 search.value='Imported Lead';
 search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 await wait(()=>document.querySelector('#searchHits [data-action="open"]'),'cross-module search results');
 document.querySelector('#searchHits [data-action="open"]').click();
 await wait(()=>document.querySelector('.detailhero')?.textContent.includes('Imported Lead'),'global search open record');
 document.querySelector('[data-action="back"]').click();
 await wait(()=>document.querySelector('#grid'),'return to grid');
 const firstCompany=document.querySelector('.gridcell[data-field="company"]');
 firstCompany.focus();
 const paste=new dom.window.Event('paste',{bubbles:true,cancelable:true});
 Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'Changed Co'}});
 firstCompany.dispatchEvent(paste);
 await wait(()=>state.leads[0].company==='Changed Co','paste into an existing spreadsheet cell');
 await wait(()=>document.querySelector('#grid')?.textContent.includes('Changed Co'),'pasted cell rendered');
 document.querySelector('[data-action="findReplace"]').click();
 await wait(()=>document.querySelector('#replaceFind'),'find and replace modal');
 document.querySelector('#replaceFind').value='Changed';
 document.querySelector('#replaceWith').value='Updated';
 document.querySelector('#replaceField').value='company';
 document.querySelector('[data-action="replacePreview"]').click();
 assert.match(document.querySelector('#replacePreview').textContent,/1 matching record/);
 document.querySelector('[data-action="replaceRun"]').click();
 await wait(()=>state.leads[0].company==='Updated Co','replace in saved record');
 await wait(()=>document.querySelector('#grid')?.textContent.includes('Updated Co'),'replacement rendered');
 await new Promise(resolve=>setTimeout(resolve,150));

 assert.equal(errors.length,0,'No browser runtime errors: '+errors.join('\n'));
 console.log('PASS — Login, lead details and back, inline edit, undo, create, TSV import/paste, global search, find and replace');
 dom.window.close();
})().catch(error=>{console.error(error);if(errors.length)console.error('Browser errors:',errors);dom.window.close();process.exitCode=1});