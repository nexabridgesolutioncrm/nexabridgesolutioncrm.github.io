/* NexaBridge Sheets Studio v4.0.
   A separate business spreadsheet area. Does not change existing CRM entity rows. */
(function(global){
 'use strict';
 const F=global.NexaFormula;
 const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
 const uid=()=>Math.random().toString(36).slice(2,10);
 const state={root:null,api:null,user:null,list:[],active:null,cells:new Map(),selected:'A1',anchor:'A1',range:false,editing:null,rowStart:0,
  channel:null,client:null,timer:null,generation:0,serial:0,busy:false,pending:[],realtime:false,presence:[],status:'',lastRemote:null,conflictDraft:null,modal:null,undoStack:[],redoStack:[],historyReplay:false,googleLinks:[],googleLoaded:false,googleError:''};
 const canCreate=()=>['owner','admin','agent'].includes(state.user?.role);
 const canManage=()=>['owner','admin'].includes(state.user?.role);
 const validAddress=v=>/^[A-Z]{1,3}[1-9][0-9]{0,4}$/.test(v);
 const display=v=>typeof v==='boolean'?(v?'TRUE':'FALSE'):v==null?'':String(v);
 const api=(path,opts)=>state.api(path,opts||{});
 function notice(message,error=false){state.status=String(message||'');const label=state.root?.querySelector('#sheetStatus');if(label){label.textContent=state.status;label.classList.toggle('bad',error)}}
 function dataCell(addr){return state.cells.get(addr)||{address:addr,raw_value:'',revision:0}}
 function engine(){return new F.FormulaEngine(state.cells,global.NexaSheetFeatures?.external?.()||new Map())}
 function cellText(addr,formula){return display(formula.displayCell(addr))}
 function setCells(rows){state.cells=new Map((rows||[]).map(x=>[x.address,x]))}
 function escapeAttr(v){return esc(v)}
 function removeRemote(){
  if(state.timer){clearInterval(state.timer);state.timer=null}
  if(state.channel){try{state.client?.removeChannel(state.channel)}catch(_){}state.channel=null}
  state.client=null;state.realtime=false;state.presence=[];
 }
 function leave(){
  global.NexaSheetOffline?.leave?.();global.NexaSheetFeatures?.reset?.();
  state.generation++;removeRemote();
  state.root=null;state.user=null;state.api=null;state.list=[];state.active=null;state.googleLinks=[];state.googleLoaded=false;state.googleError='';
  state.cells.clear();state.selected='A1';state.anchor='A1';state.range=false;
  state.rowStart=0;state.editing=null;state.pending=[];state.busy=false;
  state.status='';state.lastRemote=null;state.conflictDraft=null;state.importBook=null;state.modal=null;state.undoStack=[];state.redoStack=[];
 }
 function header(){
  return '<div class="sheet-studio-head"><div><div class="studio-eyebrow">NEXABRIDGE / LIVE DATA WORKSPACE</div><h1>Sheets Studio</h1><p>Spreadsheet formulas, shared cells, Excel imports and data-driven charts.</p></div>'+
   '<div class="studio-head-actions"><span id="sheetStatus" aria-live="polite">'+esc(state.status)+'</span>'+(state.active?'<span class="studio-peer-status" id="studioPeerStatus">'+(state.realtime?'● Live':'○ Sync')+'</span>':'')+
   (state.active?'<button class="btn" data-sheet-action="back">← All sheets</button>':'')+
   '<button class="btn" data-sheet-action="googleCreate">Google Sheets ↗</button><button class="btn" data-sheet-action="script">Apps Script ↗</button></div></div>';
 }

 function googleSection(){
  const links=state.googleLinks||[];
  return '<section class="nexa-google-sheets"><div class="nexa-google-title">'+
   '<div><span class="studio-eyebrow">GOOGLE WORKSPACE</span><h2>Full Google Sheets editor</h2>'+
   '<p>Open the official Google Sheets editor for all Google features. Google sign-in and file sharing remain managed by Google. NexaBridge stores only links.</p></div>'+
   '<div class="actions"><button class="btn primary" data-sheet-action="googleCreate">＋ New in Google Sheets ↗</button>'+
   (canCreate()?'<button class="btn" data-sheet-action="googleLink">Link existing file</button>':'')+
   '<button class="btn" data-sheet-action="googleReload" title="Refresh linked files">↻</button></div></div>'+
   (state.googleError?'<p class="sheet-hint">Linked files unavailable: '+esc(state.googleError)+'</p>':'')+
   '<div class="nexa-google-links">'+(links.length?links.map(item=>
    '<div class="nexa-google-file"><div><strong>'+esc(item.title)+'</strong>'+
    '<small>Google sharing permissions apply · linked '+esc(String(item.createdAt||'').slice(0,10))+'</small></div>'+
    '<div class="actions"><button class="btn primary" data-sheet-action="googleOpen" data-id="'+esc(item.id)+'">Open in Google ↗</button>'+
    (canManage()||item.addedBy===state.user?.id?'<button class="btn danger" data-sheet-action="googleUnlink" data-id="'+esc(item.id)+'">Unlink</button>':'')+
    '</div></div>').join(''):'<p class="sheet-hint">No Google files linked yet. Create a Google Sheet, copy its URL, then select “Link existing file”.</p>')+'</div></section>';
 }
 async function refreshGoogleLinks(){
  const generation=state.generation;
  try{
   const list=await api('google-sheets');
   if(generation!==state.generation||!state.root)return;
   state.googleLinks=Array.isArray(list)?list:[];state.googleLoaded=true;state.googleError='';
  }catch(err){
   if(generation!==state.generation||!state.root)return;
   state.googleError=err.message||'Could not load linked Google Sheets';state.googleLoaded=true;
  }
  if(!state.active)paint();
 }
 function googleLinkDialog(){
  if(!canCreate())throw Error('Your account cannot link files');
  showModal('<h2>Link Google Sheet</h2><p>Create or open your spreadsheet in Google Sheets, copy its address, and link it here. This does not copy the file or change Google sharing permissions.</p>'+
   '<label class="studio-input-label">Display name</label><input id="googleLinkTitle" class="select" maxlength="120" placeholder="e.g. Sales planning" required>'+
   '<label class="studio-input-label">Google Sheets URL</label><input id="googleLinkURL" class="select" type="url" placeholder="https://docs.google.com/spreadsheets/d/.../edit" required>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Cancel</button><button class="btn primary" data-sheet-action="googleSave">Save link</button></div>');
 }
 async function saveGoogleLink(){
  const title=state.root?.querySelector('#googleLinkTitle')?.value?.trim()||'';
  const url=state.root?.querySelector('#googleLinkURL')?.value?.trim()||'';
  if(!title||!url)throw Error('Enter a name and a Google Sheets URL');
  await api('google-sheets',{method:'POST',body:{title,url}});
  state.root.querySelector('.studio-modal-layer')?.remove();
  await refreshGoogleLinks();
  notice('Google Sheets link added. Access still depends on Google file sharing.');
 }
 function openOfficialGoogle(url){
  if(!/^https:\/\/docs\.google\.com\/spreadsheets\/(?:create|d\/[A-Za-z0-9_-]{20,150}\/edit)$/.test(url))throw Error('Invalid official Google Sheets URL');
  global.open(url,'_blank','noopener,noreferrer');
 }
 async function unlinkGoogle(id){
  const item=state.googleLinks.find(x=>x.id===id);
  if(!item)throw Error('Link not found');
  if(!canManage()&&item.addedBy!==state.user?.id)throw Error('Only an administrator or link owner can unlink this file');
  if(!global.confirm('Remove this Google Sheets shortcut from NexaBridge? The Google file will NOT be deleted.'))return;
  await api('google-sheets/'+encodeURIComponent(id),{method:'DELETE'});
  await refreshGoogleLinks();notice('Shortcut removed; Google file unchanged.');
 }

 function listView(){
  const sheets=(state.list||[]).filter(x=>!x.parent_id);
  return header()+googleSection()+'<div class="sheet-action-row">'+
   (canCreate()?'<button class="btn primary" data-sheet-action="new">＋ Create spreadsheet</button>':'')+
   (canCreate()?'<button class="btn" data-sheet-action="import">↑ Import Excel (.xlsx)</button>':'')+
   '<span class="sheet-hint">'+(canCreate()?'Only authorized NexaBridge members can access these sheets.':'Read-only access · contact an administrator to create or edit spreadsheets.')+'</span></div>'+
   '<div class="sheet-studio-cards">'+(sheets.length?sheets.map(sheet=>
    '<div class="card sheet-studio-tile"><span class="studio-file-icon">▦</span><strong>'+esc(sheet.name)+'</strong>'+
    '<small>Updated '+esc(String(sheet.updated_at||'').slice(0,10))+'</small>'+
    '<div class="actions"><button class="btn primary" data-sheet-action="open" data-id="'+escapeAttr(sheet.id)+'">Open sheet</button>'+
    (canManage()?'<button class="btn danger" data-sheet-action="remove" data-id="'+escapeAttr(sheet.id)+'">Delete</button>':'')+'</div></div>'
   ).join(''):'<div class="card sheet-studio-empty"><h3>No spreadsheets yet</h3><p>'+(canCreate()?'Create your first sheet or import an Excel workbook.':'Your account can view existing spreadsheets but cannot create them.')+'</p>'+(canCreate()?'<button class="btn primary" data-sheet-action="new">Create new sheet</button>':'')+'</div>')+'</div>';
 }
 function tabBar(){
  if(!state.active)return '';
  const root=state.active.parent_id||state.active.id;
  const siblings=(state.list||[]).filter(x=>x.id===root||x.parent_id===root);
  if(!siblings.some(x=>x.id===state.active.id))siblings.push(state.active);
  siblings.sort((a,b)=>(a.id===root?-1:b.id===root?1:String(a.created_at||'').localeCompare(String(b.created_at||''))));
  return '<div class="sheet-tab-bar" role="tablist" aria-label="Workbook tabs">'+
   siblings.map(x=>'<button class="sheet-tab'+(x.id===state.active.id?' active':'')+'" data-sheet-action="tabSwitch" data-id="'+esc(x.id)+'" role="tab" aria-selected="'+(x.id===state.active.id?'true':'false')+'">'+esc(x.name)+'</button>').join('')+
   (canCreate()?'<button class="btn small" data-sheet-action="tabCreate" title="Add workbook tab">＋ Tab</button>':'')+
   (canManage()?'<button class="btn small" data-sheet-action="tabRename">Rename</button>':'')+
   (canManage()&&state.active.parent_id?'<button class="btn small danger" data-sheet-action="tabRemove">Delete tab</button>':'')+
   '</div>';
 }
 async function createTab(){
  if(!canCreate()||!state.active)throw Error('No active spreadsheet or edit permission');
  const title=global.prompt('New worksheet tab name','Sheet '+((state.list||[]).length+1));
  if(title===null)return;if(!title.trim())throw Error('Enter a tab name');
  const parentId=state.active.parent_id||state.active.id;
  const created=await api('sheets',{method:'POST',body:{name:title.trim().slice(0,120),parentId}});
  await listRefresh();await openSheet(created.id);
 }
 async function renameTab(){
  if(!canManage()||!state.active)throw Error('Only Owner/Admin can rename tabs');
  const title=global.prompt('Rename worksheet',state.active.name);
  if(title===null)return;if(!title.trim())throw Error('Enter a tab name');
  const saved=await api('sheets/'+state.active.id,{method:'PATCH',body:{name:title.trim().slice(0,120)}});
  state.active={...state.active,...saved};
  await listRefresh();notice('Tab renamed');
 }
 async function removeTab(){
  if(!canManage()||!state.active?.parent_id)throw Error('Cannot remove the main tab here');
  const root=state.active.parent_id;
  if(!global.confirm('Permanently delete this worksheet tab and its cells?'))return;
  await api('sheets/'+state.active.id,{method:'DELETE'});
  await listRefresh();await openSheet(root);notice('Worksheet tab removed');
 }

 function grid(){
  const page=global.NexaSheetTools?.view?.(state.rowStart,50)||{rows:Array.from({length:50},(_,i)=>state.rowStart+i),total:10000};
  const rows=page.rows.length,cols=26,calc=engine(),name=state.active?.name||'Spreadsheet',selected=state.selected;
  const head='<thead><tr><th class="sheet-grid-corner">#</th>'+Array.from({length:cols},(_,c)=>
   '<th class="sheet-grid-column">'+F.colName(c)+'</th>').join('')+'</tr></thead>';
  const body='<tbody>'+Array.from({length:rows},(_,r)=>{
   const actualRow=page.rows[r];
   return '<tr><th class="sheet-grid-row-head">'+(actualRow+1)+'</th>'+
    Array.from({length:cols},(_,c)=>{
     const address=F.address(actualRow,c),entry=dataCell(address),value=cellText(address,calc);
     const decor=global.NexaSheetFeatures?.cellDecoration?.(address,value)||{className:'',style:''};
     const css=(global.NexaSheetTools?.style?.(address)||'')+String(decor.style||'').replace(/^ style="/,'').replace(/"$/,'');
     const formatted=global.NexaSheetTools?.format?.(address,value)??value;
     return '<td data-sheet-address="'+address+'" tabindex="0" class="sheet-studio-cell'+
      (address===selected?' selected':'')+(rangeIncludes(address)?' range-selected':'')+
      (state.presence.some(p=>p.cell===address&&p.id!==state.user?.id)?' peer-active':'')+
      (String(entry.raw_value||'').startsWith('=')?' formula':'')+decor.className+
      (entry.offline?' offline-draft':'')+'"'+(css?' style="'+css+'"':'')+'><span>'+
      esc(formatted).slice(0,800)+'</span></td>';
    }).join('')+'</tr>';
  }).join('')+'</tbody>';
  return header()+tabBar()+'<section class="sheet-studio-toolbar">'+
   '<div class="sheet-studio-title"><strong>▦ '+esc(name)+'</strong><small>'+state.cells.size+' saved cells</small></div>'+
   '<div class="actions"><button class="btn" data-sheet-action="refresh">↻ Refresh</button>'+(canCreate()?'<button class="btn" data-sheet-action="undo" title="Undo Ctrl+Z">↶ Undo</button><button class="btn" data-sheet-action="redo" title="Redo Ctrl+Y">↷ Redo</button><button class="btn" data-sheet-action="clear" title="Clear selected cells">Clear</button><button class="btn" data-sheet-action="fillDown" title="Fill selected range down">Fill down</button>':'')+(global.NexaSheetOffline?.toolbar?.()||'')+(global.NexaSheetFeatures?.toolbar?.()||'')+(global.NexaSheetTools?.toolbar?.()||'')+'<button class="btn" data-sheet-action="find">Find / Replace</button><button class="btn" data-sheet-action="copyCells">Copy range</button>'+(canCreate()?'<button class="btn" data-sheet-action="pasteCells">Paste cells</button>':'')+
   (canManage()?'<button class="btn" data-sheet-action="chart">＋ New chart</button>':'')+
   '<button class="btn" data-sheet-action="export">↓ Export CSV</button>'+'<button class="btn" data-sheet-action="exportXLSX">↓ Export XLSX</button>'+
   (canCreate()?'<button class="btn" data-sheet-action="import">↑ Import XLSX</button>':'')+'</div></section>'+
   (global.NexaSheetFeatures?.banner?.()||'')+'<div class="sheet-formula-bar"><span id="studioNameBox">'+esc(selected)+'</span>'+
   '<span class="sheet-fx">ƒx</span><input id="studioFormulaBar" aria-label="Cell formula or value" '+(canCreate()?'':'readonly ')+'value="'+escapeAttr(dataCell(selected).raw_value)+'" placeholder="'+(canCreate()?'Enter text or =SUM(A1:A10)':'Read-only cell · select to inspect')+'">'+
   (canCreate()?'<button class="btn" data-sheet-action="edit">Edit cell</button><button class="btn primary" data-sheet-action="save">Save cell</button>':'<span class="sheet-readonly-note">Read-only workspace</span>')+'</div>'+
   '<div class="sheet-grid-scroller'+(global.NexaSheetTools?.settings?.().freezeRows?' sx-freeze-rows':'')+(global.NexaSheetTools?.settings?.().freezeColumns?' sx-freeze-cols':'')+'"><table id="studioGrid" class="sheet-grid">'+head+body+'</table></div>'+ '<div class="sheet-rowpager"><span>'+(page.total?'Rows '+(state.rowStart+1)+'–'+Math.min(page.total,state.rowStart+50):'No matching rows')+' of '+page.total+' · 26 columns</span><div class="actions"><button class="btn small" data-sheet-action="rowPrev" '+(state.rowStart===0?'disabled':'')+'>← Previous 50</button><button class="btn small" data-sheet-action="rowNext" '+(state.rowStart+50>=page.total?'disabled':'')+'>Next 50 →</button></div></div>'+
   '<p class="sheet-studio-instructions">'+(canCreate()?'Select any cell, then type in the formula bar or double-click it. Formulas begin with =. Updates are saved with revision checks, so conflicting edits cannot overwrite silently.':'This account can browse, calculate and export cells. Only authorized members can edit.')+'</p>'+
   '<div class="sheet-chart-section"><div class="sheet-section-title"><h2>Charts</h2><span>Live calculations from the sheet</span></div>'+
   '<div class="sheet-chart-grid" id="sheetCharts">'+chartsHTML()+'</div></div>'+(global.NexaSheetFeatures?.panels?.()||'')+
   '<div id="studioModalHost"></div>';
 }
 function chartsHTML(){
  const defs=Array.isArray(state.active?.charts)?state.active.charts:[];
  return defs.length?defs.map((d,i)=>chartCard(d,i)).join(''):'<div class="sheet-chart-empty">No charts yet. Use New chart to build a data visualization from spreadsheet columns.</div>';
 }
 function chartCard(def,index){
  const populated=Math.max(50,...[...state.cells.keys()].map(key=>(F.coordinates(key)?.row||0)+1));
  const rows=Math.min(10000,populated,Math.max(10,Math.floor(Number(def.maxRows)||500)));
  const category=F.colIndex(def.category),value=F.colIndex(def.measure);
  if(category<0||category>25||value<0||value>25)return '';
  const calc=engine(),groups=new Map();
  for(let row=1;row<rows;row++){
   const label=String(cellText(F.address(row,category),calc)||'').trim();
   if(!label||label.startsWith('#'))continue;
   const raw=Number(cellText(F.address(row,value),calc));
   if(def.aggregate!=='count'&&!Number.isFinite(raw))continue;
   const key=label.slice(0,45),entry=groups.get(key)||{sum:0,count:0};
   entry.sum+=Number.isFinite(raw)?raw:0;entry.count++;groups.set(key,entry);
  }
  const data=[...groups].slice(0,12).map(([name,v])=>({
   name,value:def.aggregate==='count'?v.count:def.aggregate==='average'?(v.count?v.sum/v.count:0):v.sum
  }));
  const palette=['#8268e8','#56b9a0','#73a7ec','#edb86f','#df859e','#8a85da','#75c9cf','#b7a2ef','#e0a4bf','#85b59c','#b7a4c8','#94b1ed'];
  if(/^#[0-9a-f]{6}$/i.test(def.color||''))palette[0]=def.color;
  const numericLabel=(v)=>Number(v.toFixed(1));
  let inner='<text x="320" y="125" text-anchor="middle" fill="#7d88a0" font-size="15">Add category and numeric values to see the chart</text>';
  if(data.length){
   const lo=Math.min(0,...data.map(d=>d.value)),hi=Math.max(0,...data.map(d=>d.value));
   const span=Math.max(1,hi-lo),position=v=>210-(v-lo)/span*150,zero=position(0);
   const width=510/Math.max(1,data.length),x=i=>83+(i+.5)*width;
   const labels=data.map((d,i)=>'<text x="'+x(i)+'" y="238" font-size="9.5" fill="currentColor" text-anchor="middle">'+esc(d.name.slice(0,9))+'</text>').join('');
   if(def.type==='pie'||def.type==='doughnut'){
    const positive=data.map(d=>Math.max(0,d.value)),total=positive.reduce((a,b)=>a+b,0);
    let acc=0;
    if(total>0){
     inner=data.map((d,i)=>{const fraction=positive[i]/total,from=acc;acc+=fraction;
      return '<circle cx="225" cy="137" r="88" fill="none" stroke="'+palette[i%palette.length]+'" stroke-width="'+(def.type==='pie'?88:36)+'" stroke-dasharray="'+(fraction*552.92)+' '+552.92+'" stroke-dashoffset="'+(-from*552.92)+'" transform="rotate(-90 225 137)"/>';
     }).join('')+
     data.map((d,i)=>'<rect x="372" y="'+(18+i*20)+'" width="10" height="10" fill="'+palette[i%palette.length]+'"/>'+
      '<text x="388" y="'+(28+i*20)+'" font-size="10.5" fill="currentColor">'+esc(d.name.slice(0,15))+' ('+esc(numericLabel(d.value))+')</text>').join('');
    }
   }else if(def.type==='horizontal'){
    const max=Math.max(1,...data.map(d=>Math.abs(d.value))),rowHeight=Math.min(22,220/Math.max(1,data.length));
    inner=data.map((d,i)=>'<text x="8" y="'+(18+i*rowHeight+rowHeight/2)+'" font-size="10" fill="currentColor">'+esc(d.name.slice(0,15))+'</text>'+
     '<rect x="125" y="'+(12+i*rowHeight)+'" width="'+(400*Math.abs(d.value)/max)+'" height="'+(rowHeight-4)+'" rx="3" fill="'+palette[i%palette.length]+'"/>'+
     (def.showValues?'<text x="'+(130+400*Math.abs(d.value)/max)+'" y="'+(20+i*rowHeight)+'" font-size="10" fill="currentColor">'+esc(numericLabel(d.value))+'</text>':'')).join('');
   }else{
    inner='<line x1="64" y1="'+zero+'" x2="619" y2="'+zero+'" stroke="#9ba5ba" stroke-width="1"/>';
    const pts=data.map((d,i)=>x(i)+','+position(d.value));
    if(def.type==='area'){
     inner+='<polygon points="'+x(0)+','+zero+' '+pts.join(' ')+' '+x(data.length-1)+','+zero+'" fill="'+palette[0]+'" opacity="0.2"/>';
    }
    if(def.type==='line'||def.type==='area'){
     inner+='<polyline fill="none" stroke="'+palette[0]+'" stroke-width="3" stroke-linejoin="round" points="'+pts.join(' ')+'"/>';
    }
    inner+=data.map((d,i)=>{
     const y=position(d.value),xx=x(i);
     const shape=(def.type==='line'||def.type==='area'||def.type==='scatter')?
      '<circle cx="'+xx+'" cy="'+y+'" r="'+(def.type==='scatter'?6:4)+'" fill="'+palette[i%palette.length]+'"/>':
      '<rect x="'+(xx-width*.32)+'" y="'+Math.min(y,zero)+'" width="'+Math.max(7,width*.64)+'" height="'+Math.abs(y-zero)+'" rx="3" fill="'+palette[i%palette.length]+'"/>';
     return shape+(def.showValues?'<text x="'+xx+'" y="'+(y-8)+'" font-size="9.5" text-anchor="middle" fill="currentColor">'+esc(numericLabel(d.value))+'</text>':'');
    }).join('')+labels;
   }
  }
  return '<div class="card sheet-chart"><div class="sheet-chart-header"><div><strong>'+esc(def.title||'Chart')+'</strong>'+
   '<small>'+esc(def.type)+' · '+esc(def.aggregate)+' · '+esc(def.category)+' / '+esc(def.measure)+'</small></div>'+
   (canManage()?'<div class="actions"><button class="btn small" data-sheet-action="editChart" data-index="'+index+'">Edit</button>'+
   '<button class="btn small danger" data-sheet-action="deleteChart" data-index="'+index+'">Remove</button></div>':'')+'</div>'+
   '<svg viewBox="0 0 640 270" role="img" aria-label="'+esc(def.title||'Data chart')+'" class="sheet-chart-svg">'+inner+'</svg></div>';
 }
 function paint(){
  if(!state.root)return;
  const focused=state.root.querySelector('#studioFormulaBar');
  const preserve=focused&&document.activeElement===focused?{value:focused.value,start:focused.selectionStart,end:focused.selectionEnd}:null;
  state.root.innerHTML=state.active?grid():listView();
  if(preserve){const input=state.root.querySelector('#studioFormulaBar');if(input){input.value=preserve.value;input.focus();try{input.setSelectionRange(preserve.start,preserve.end)}catch(_){}}}
  state.root.dataset.sheetReady='true';
  notice(state.status);
 }
 function listRefresh(){
  const generation=state.generation;
  return api('sheets').then(list=>{
   if(generation!==state.generation)return [];
   state.list=list||[];paint();return list;
  });
 }
 async function mount(element,transport,user){
  if(!element||!transport||!user)return;
  const isNew=element!==state.root;
  state.root=element;state.api=transport;state.user=user;
  const extensions={state,F,api:(path,opts)=>transport(path,opts),showModal,paint,notice};
  global.NexaSheetFeatures?.bind?.(extensions);
  global.NexaSheetOffline?.bind?.(extensions);
  global.NexaSheetTools?.bind?.(extensions);
  if(isNew){
   element.addEventListener('click',onClick);
   element.addEventListener('dblclick',onDouble);
   element.addEventListener('keydown',onKey);
   element.addEventListener('paste',onPaste);
   element.addEventListener('change',onChange);
  }
  if(!state.list.length){
   try{await listRefresh()}catch(e){state.status='Unable to load spreadsheets: '+e.message;paint()}
  }else paint();
  if(!state.googleLoaded)await refreshGoogleLinks();
 }
 async function openSheet(id){
  removeRemote();const generation=state.generation;
  const data=await api('sheets/'+encodeURIComponent(id));
  if(generation!==state.generation)return;
  global.NexaSheetTools?.reset?.();
  state.active=data.sheet;state.selected='A1';state.anchor='A1';state.range=false;state.rowStart=0;state.undoStack=[];state.redoStack=[];setCells(data.cells);
  await global.NexaSheetOffline?.afterOpen?.();
  paint();await global.NexaSheetFeatures?.afterOpen?.();await connect();
 }
 async function back(){
  removeRemote();state.active=null;state.cells.clear();state.undoStack=[];state.redoStack=[];state.selected='A1';state.anchor='A1';state.range=false;state.rowStart=0;
  await global.NexaSheetOffline?.afterOpen?.();
  await global.NexaSheetFeatures?.afterOpen?.();await listRefresh();
 }
 function remember(changes){if(!changes.length||state.historyReplay)return;state.undoStack.push(changes);if(state.undoStack.length>70)state.undoStack.shift();state.redoStack=[]}
 async function saveCell(address,value,rememberEdit=true){
  const generation=state.generation,sheetId=state.active?.id;
  if(!sheetId)return;
  if(!canCreate()){notice('Read-only account cannot save cells',true);return}
  if(global.NexaSheetFeatures?.lock?.(address)){notice('Protected range — administrator access required',true);return}
  const validationError=global.NexaSheetTools?.validate?.(address,value);if(validationError){notice(validationError,true);return false}
  if(state.busy){
   state.pending=state.pending.filter(item=>item.address!==address);
   state.pending.push({address,value});
   notice('Saving in order · '+state.pending.length+' queued');
   return;
  }
  const previous=dataCell(address);
  if(previous.raw_value===value)return true;
  if(String(value).length>4000){notice('Cell values cannot exceed 4,000 characters',true);return}
  state.busy=true;notice('Saving '+address+'…');
  try{
   const saved=global.NexaSheetOffline?.write?await global.NexaSheetOffline.write(address,value,previous.revision||0):await api('sheets/'+state.active.id+'/cell',{method:'POST',body:{address,value,revision:previous.revision||0}});
   if(generation!==state.generation||state.active?.id!==sheetId)return;
   state.conflictDraft=null;state.cells.set(address,saved);if(rememberEdit&&!saved.queued)remember([{address,before:previous.raw_value,after:value}]);paint();notice(saved.queued?'Offline draft saved (not synchronized)':'Saved '+address,!!saved.queued);return true;
  }catch(e){
   if(generation!==state.generation||state.active?.id!==sheetId)return false;
   notice(e.message,true);
   if(/another session|conflict|revision|409/i.test(e.message)){
    const draft={address,value,reason:String(e.message||'Revision conflict')};
    try{await refreshSheet(true)}catch(_){}
    if(generation===state.generation&&state.active?.id===sheetId){
     state.conflictDraft=draft;
     showModal('<h2>Cell edit conflict · '+esc(address)+'</h2>'+
      '<p>Another user updated this cell before your changes could be saved. We loaded the latest version; your unsaved edit is preserved below.</p>'+
      '<label class="studio-input-label" for="studioConflictDraft">Your unsaved value</label>'+
      '<textarea id="studioConflictDraft" class="select studio-paste-area" rows="5" readonly>'+esc(value)+'</textarea>'+
      '<div class="studio-modal-foot"><button class="btn" data-sheet-action="copyDraft">Copy my changes</button><button class="btn primary" data-sheet-action="dismiss">Close and review</button></div>');
     notice('Conflict in '+address+' · your unsaved value has been preserved',true);
    }
   }
   return false;
  }finally{
   state.busy=false;
   if(generation!==state.generation||state.active?.id!==sheetId)return;
   const next=state.pending.shift();if(next&&state.active)Promise.resolve().then(()=>saveCell(next.address,next.value));
  }
 }
 
 function rangeLimits(){
  const a=F.coordinates(state.anchor),b=F.coordinates(state.selected);
  return a&&b?{top:Math.min(a.row,b.row),bottom:Math.max(a.row,b.row),left:Math.min(a.col,b.col),right:Math.max(a.col,b.col)}:null;
 }
 function rangeIncludes(address){
  if(!state.range)return false;const c=F.coordinates(address),r=rangeLimits();
  return !!(c&&r&&c.row>=r.top&&c.row<=r.bottom&&c.col>=r.left&&c.col<=r.right);
 }
 function selectCell(address,extend=false){
  if(!validAddress(address))return;
  if(!extend){state.anchor=address;state.range=false}else state.range=true;
  state.selected=address;
  state.root.querySelectorAll('.sheet-studio-cell.selected,.sheet-studio-cell.range-selected').forEach(el=>el.classList.remove('selected','range-selected'));
  if(state.range){const r=rangeLimits();if(r)state.root.querySelectorAll('[data-sheet-address]').forEach(el=>{const p=F.coordinates(el.dataset.sheetAddress);if(p&&p.row>=r.top&&p.row<=r.bottom&&p.col>=r.left&&p.col<=r.right)el.classList.add('range-selected')})}
  const cell=state.root.querySelector('[data-sheet-address="'+address+'"]');cell?.classList.add('selected');
  const box=state.root.querySelector('#studioNameBox'),input=state.root.querySelector('#studioFormulaBar');
  if(box)box.textContent=address;if(input)input.value=dataCell(address).raw_value;
  trackPresence();
 }
 async function refreshSheet(quiet){
  if(!state.active)return;
  const generation=state.generation,sheetId=state.active.id;
  const data=await api('sheets/'+sheetId);
  if(generation!==state.generation||state.active?.id!==sheetId)return;
  state.active=data.sheet;setCells(data.cells);global.NexaSheetOffline?.overlay?.();
  if(!state.editing)paint();
  if(!quiet)notice('Sheet refreshed');
 }
 async function editCell(address,initialValue){
  if(!canCreate())return;
  if(global.NexaSheetFeatures?.lock?.(address))return notice('Protected range — administrator access required',true);
  const node=state.root?.querySelector('[data-sheet-address="'+address+'"]');
  if(!node||state.editing)return;
  selectCell(address);state.editing=address;
  const input=document.createElement('input');
  input.className='studio-in-cell-editor';input.value=initialValue===undefined?dataCell(address).raw_value:initialValue;input.setAttribute('aria-label','Edit cell '+address);
  const choices=global.NexaSheetTools?.choices?.(address)||[];
  if(choices.length){
   const list=document.createElement('datalist');
   list.id='studioChoices-'+address;
   for(const value of choices){const option=document.createElement('option');option.value=value;list.appendChild(option)}
   input.setAttribute('list',list.id);node.replaceChildren(input,list);
  }else node.replaceChildren(input);
  input.focus();if(initialValue===undefined)input.select();else input.setSelectionRange(input.value.length,input.value.length);
  let finished=false;
  async function finish(save){
   if(finished)return;finished=true;
   const value=input.value;
   state.editing=null;
   if(save){await saveCell(address,value);if(state.active&&state.root?.contains(node))paint()}
   else paint();
  }
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true)}if(e.key==='Escape'){e.preventDefault();finish(false)}});
  input.addEventListener('blur',()=>finish(true),{once:true});
 }
 async function createSheet(){
  if(!canCreate())throw Error('Only an authorized staff member can create a spreadsheet');
  const name=global.prompt('Name your spreadsheet','Untitled sheet');
  if(name==null)return;const title=name.trim().slice(0,120);if(!title){notice('Enter a sheet name',true);return}
  const saved=await api('sheets',{method:'POST',body:{name:title}});
  await listRefresh();await openSheet(saved.id);
 }
 function showModal(body){
  const root=state.root;if(!root)return;
  root.querySelector('.studio-modal-layer')?.remove();
  const host=document.createElement('div');host.className='studio-modal-layer';
  host.innerHTML='<div class="studio-modal card" role="dialog" aria-modal="true"><button class="studio-close" data-sheet-action="dismiss" title="Close">✕</button>'+body+'</div>';
  root.appendChild(host);
 }
 async function importFile(file){
  if(!canCreate())throw Error('Read-only account cannot import files');
  if(!file)return;
  if(!global.XLSX){notice('Excel reader is unavailable. Check your connection and reload.',true);return}
  if(file.size>3*1024*1024){notice('Excel files are limited to 3 MB per import',true);return}
  const bytes=await file.arrayBuffer();
  const book=global.XLSX.read(bytes,{type:'array',cellFormula:true,cellDates:true,cellNF:false,cellStyles:false});
  if(!book.SheetNames?.length)throw Error('The Excel file has no worksheets');
  state.importBook=book;
  showModal('<h2>Import Excel workbook</h2><p>Choose a worksheet to import as a new, editable CRM spreadsheet. Existing CRM records remain unchanged.</p>'+
   '<label class="studio-input-label">Worksheet</label><select id="studioImportSheet" class="select">'+book.SheetNames.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('')+'</select>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Cancel</button><button class="btn primary" data-sheet-action="runImport">Import worksheet</button></div>');
 }
 function parseWorkbookSheet(book,name){
  const sheet=book.Sheets[name],range=global.XLSX.utils.decode_range(sheet['!ref']||'A1');
  const cells=[];
  for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){
   if(r>=10000||c>=26)continue;
   const addr=global.XLSX.utils.encode_cell({r,c}),entry=sheet[addr];
   if(!entry)continue;
   const raw=entry.f?'='+entry.f:entry.v instanceof Date?entry.v.toISOString().slice(0,10):String(entry.v??'');
   if(raw.trim()){if(raw.length>4000)throw Error('Cell '+addr+' exceeds 4,000 characters');cells.push({address:addr,value:raw})}
   if(cells.length>2000)throw Error('Limit 2,000 nonempty cells per import. Split larger workbooks.');
  }
  return cells;
 }
 async function runImport(){
  if(!canCreate())throw Error('Read-only account cannot import files');
  const name=state.root.querySelector('#studioImportSheet')?.value;
  if(!state.importBook||!name)return;
  const cells=parseWorkbookSheet(state.importBook,name);
  if(!cells.length)throw Error('This worksheet has no data in columns A–Z.');
  if(!global.confirm('Create a new sheet with '+cells.length+' cells from "'+name+'"?'))return;
  const saved=await api('sheets',{method:'POST',body:{name:name.slice(0,120)}});
  let n=0;
  try{
   for(let i=0;i<cells.length;i+=300){
    const result=await api('sheets/'+saved.id+'/bulk',{method:'POST',body:{cells:cells.slice(i,i+300)}});
    n+=result.inserted;notice('Imported '+n+' / '+cells.length+' cells');
   }
  }catch(e){notice('Imported '+n+' cells, but stopped: '+e.message,true);throw e}
  state.importBook=null;state.root.querySelector('.studio-modal-layer')?.remove();
  await listRefresh();await openSheet(saved.id);notice('Imported '+n+' cells from Excel');
 }
 function chartEditor(index=-1){
  if(!canManage())return notice('Only Owner or Admin can modify chart definitions',true);
  const def=index<0?{title:'Sales overview',type:'bar',category:'A',measure:'B',aggregate:'sum',color:'#8268e8',showValues:false,maxRows:500}:state.active?.charts[index];
  if(!def)return;
  const opts=(values,current)=>values.map(v=>'<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v[0].toUpperCase()+v.slice(1))+'</option>').join('');
  showModal('<h2>'+((index<0)?'New chart':'Edit chart')+'</h2><p>Build charts from up to 10,000 rows; choose categories, aggregations, labels, and a color.</p>'+
   '<div class="studio-chart-fields"><label>Chart name<input class="select" id="studioChartTitle" maxlength="80" value="'+esc(def.title)+'"></label>'+
   '<label>Chart type<select class="select" id="studioChartType">'+opts(['bar','line','area','scatter','horizontal','pie','doughnut'],def.type)+'</select></label>'+
   '<label>Category column<select class="select" id="studioChartCategory">'+opts(Array.from({length:26},(_,i)=>F.colName(i)),def.category)+'</select></label>'+
   '<label>Value column<select class="select" id="studioChartMeasure">'+opts(Array.from({length:26},(_,i)=>F.colName(i)),def.measure)+'</select></label>'+
   '<label>Aggregate<select class="select" id="studioChartAggregate">'+opts(['sum','average','count'],def.aggregate)+'</select></label>'+ '<label>Accent color<input type="color" class="select" id="studioChartColor" value="'+esc(/^#[0-9a-f]{6}$/i.test(def.color||'')?def.color:'#8268e8')+'"></label>'+ '<label>Maximum source rows<input class="select" id="studioChartRows" type="number" min="10" max="10000" value="'+esc(def.maxRows||500)+'"></label>'+ '<label class="studio-chart-check"><input type="checkbox" id="studioChartLabels" '+(def.showValues?'checked':'')+'>Show values on chart</label></div>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Cancel</button>'+
   '<button class="btn primary" data-sheet-action="saveChart" data-index="'+index+'">Save chart</button></div>');
 }
 async function saveChart(index){
  if(!canManage())throw Error('Only Owner or Admin can save chart settings');
  const $=selector=>state.root.querySelector(selector);
  const config={id:uid(),title:$('#studioChartTitle').value.trim()||'Chart',type:$('#studioChartType').value,
   category:$('#studioChartCategory').value,measure:$('#studioChartMeasure').value,aggregate:$('#studioChartAggregate').value,color:$('#studioChartColor').value,showValues:$('#studioChartLabels').checked,maxRows:Math.min(10000,Math.max(10,Number($('#studioChartRows').value)||500))};
  const charts=[...(state.active.charts||[])];
  if(index>=0){config.id=charts[index]?.id||config.id;charts[index]=config}else charts.push(config);
  if(charts.length>30)throw Error('Maximum 30 charts per sheet');
  const result=await api('sheets/'+state.active.id,{method:'PATCH',body:{charts}});
  state.active=result;paint();notice('Chart saved');
 }
 async function removeChart(index){
  if(!canManage())throw Error('Only Owner or Admin can remove charts');
  if(!global.confirm('Remove this chart? Sheet cells are preserved.'))return;
  const charts=(state.active.charts||[]).filter((_,i)=>i!==index);
  state.active=await api('sheets/'+state.active.id,{method:'PATCH',body:{charts}});
  paint();notice('Chart removed');
 }
 function exportCSV(){
  const protectCSV=value=>{const raw=String(value??'');return /^[\s]*[=+@\-\t\r]/.test(raw)?"'"+raw:raw};
  const formula=engine(),rows=[];
  for(let r=0;r<Math.min(10000,Math.max(50,...[...state.cells.keys()].map(key=>(F.coordinates(key)?.row||0)+1)));r++){
   const values=[];for(let c=0;c<26;c++)values.push(cellText(F.address(r,c),formula));
   rows.push(values.map(x=>'"'+protectCSV(x).replaceAll('"','""')+'"').join(','));
  }
  const blob=new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
  link.download='NexaBridge_'+String(state.active.name||'Sheet').replace(/[^a-z0-9_-]/gi,'_')+'.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

 function exportXLSX(){
  if(!global.XLSX)throw Error('Excel export library unavailable. Check internet connection and reload.');
  const rows=Math.min(10000,Math.max(50,...[...state.cells.keys()].map(key=>(F.coordinates(key)?.row||0)+1)));
  const values=[];
  for(let row=0;row<rows;row++){
   const line=[];
   for(let col=0;col<26;col++){
    const cell=dataCell(F.address(row,col)),raw=String(cell.raw_value||'');
    if(raw.startsWith('='))line.push({t:'n',f:raw.slice(1)});
    else if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw.trim()))line.push(Number(raw));
    else line.push(raw);
   }
   values.push(line);
  }
  const sheet=global.XLSX.utils.aoa_to_sheet(values);
  const workbook=global.XLSX.utils.book_new();
  const title=String(state.active?.name||'Sheet').replace(/[^a-z0-9 _-]/gi,' ').slice(0,31)||'Sheet';
  global.XLSX.utils.book_append_sheet(workbook,sheet,title);
  global.XLSX.writeFile(workbook,'NexaBridge_'+String(state.active?.name||'Sheet').replace(/[^a-z0-9_-]/gi,'_')+'.xlsx');
 }
 function trackPresence(){
  if(!state.channel||!state.realtime||!state.user)return;
  try{Promise.resolve(state.channel.track({id:state.user.id,username:String(state.user.username||'Team member').slice(0,80),cell:state.selected,at:Date.now()})).catch(()=>{})}catch(_){}
 }
 function updatePresence(){
  if(!state.channel)return;
  const map=state.channel.presenceState();state.presence=Object.values(map).flat().filter(x=>x.id&&x.cell);
  if(!state.editing)paint();
  const label=state.root?.querySelector('#studioPeerStatus');if(label)label.textContent='● '+state.presence.length+' online';
 }
 async function connect(){
  if(!state.active)return;
  removeRemote();
  const creds=global.nexaSheetsRealtimeCredentials?.();
  if(global.supabase?.createClient&&creds){
   try{
    const id=state.active.id;
    const client=global.supabase.createClient(creds.url,creds.key,{
     auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
     realtime:{params:{eventsPerSecond:8}}
    });
    client.realtime.setAuth(creds.token);
    const channel=client.channel('nexa-sheets-'+id,{config:{private:true,presence:{key:String(state.user?.id||'member')}}}).on('presence',{event:'sync'},()=>updatePresence()).on('postgres_changes',
     {event:'*',schema:'public',table:'crm_sheet_cells',filter:'sheet_id=eq.'+id},
     payload=>{
      if(state.active?.id!==id)return;
      const row=payload.new;
      if(!row?.address)return;
      const old=dataCell(row.address);
      if(old.revision>=row.revision)return;
      state.cells.set(row.address,row);global.NexaSheetOffline?.overlay?.();state.lastRemote=row.updated_by;
      if(state.editing===row.address||state.busy||state.root?.querySelector('.studio-modal-layer')){notice('Remote change received; reload after finishing your edit.',true);return}
      state.status='Live update received';
      paint();
     }).on('postgres_changes',
      {event:'*',schema:'public',table:'crm_sheet_comments',filter:'sheet_id=eq.'+id},
      ()=>{if(state.active?.id===id)global.NexaSheetFeatures?.refreshComments?.().catch(()=>{})}
     ).on('postgres_changes',
      {event:'UPDATE',schema:'public',table:'crm_spreadsheets',filter:'id=eq.'+id},
      payload=>{
       if(state.active?.id!==id||!payload.new?.id)return;
       state.active={...state.active,...payload.new};
       if(!state.editing&&!state.busy&&!state.root?.querySelector('.studio-modal-layer')&&document.activeElement?.id!=='studioFormulaBar'){
        paint();global.NexaSheetFeatures?.refreshComments?.().catch(()=>{});
       }else notice('Spreadsheet settings changed by a colleague; review after your edit');
      });
    state.client=client;state.channel=channel;
    channel.subscribe(status=>{if(status==='SUBSCRIBED'){state.realtime=true;trackPresence();notice('Live collaboration connected')}
     if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){state.realtime=false;notice('Live connection interrupted; fallback sync active',true)}});
   }catch(e){notice('Live connection unavailable; fallback sync active',true)}
  }
  state.timer=setInterval(async()=>{
   if(global.navigator.onLine&&global.NexaSheetOffline?.pending?.().size)await global.NexaSheetOffline?.flush?.();
   if(!state.active||state.editing||state.busy||document.hidden||state.root?.querySelector('.studio-modal-layer')||document.activeElement?.id==='studioFormulaBar')return;
   try{await refreshSheet(true)}catch(_){}
  },15000);
 }

 function copiedRange(){
  const p=F.coordinates(state.selected),bounds=state.range?rangeLimits():{top:p.row,bottom:p.row,left:p.col,right:p.col};
  if(!bounds)throw Error('Choose a cell first');
  if((bounds.bottom-bounds.top+1)*(bounds.right-bounds.left+1)>3000)throw Error('Copy is limited to 3,000 cells');
  const calc=engine(),result=[];
  for(let row=bounds.top;row<=bounds.bottom;row++){
   const line=[];for(let col=bounds.left;col<=bounds.right;col++)line.push(String(cellText(F.address(row,col),calc)).replaceAll('\t',' ').replaceAll('\n',' '));
   result.push(line.join('\t'));
  }
  return result.join('\n');
 }
 async function copyCells(){
  if(!navigator.clipboard?.writeText)throw Error('Clipboard needs HTTPS browser permission');
  await navigator.clipboard.writeText(copiedRange());notice('Spreadsheet range copied');
 }
 function pasteCellsDialog(){
  showModal('<h2>Paste cells</h2><p>Paste tab-separated values from Excel or Google Sheets, preserving conflict checks for existing cells.</p>'+
   '<label class="studio-input-label">Start cell</label><input id="studioPasteStart" class="select" value="'+esc(state.selected)+'">'+
   '<label class="studio-input-label">Values</label><textarea id="studioPasteData" class="select studio-paste-area" rows="8" placeholder="Paste TSV values here"></textarea>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Cancel</button><button class="btn primary" data-sheet-action="pasteSave">Save cells</button></div>');
 }
 async function pasteCellsSave(){
  if(!canCreate())throw Error('Read-only account cannot paste cells');
  const start=F.coordinates(state.root.querySelector('#studioPasteStart')?.value?.toUpperCase()),text=state.root.querySelector('#studioPasteData')?.value||'';
  if(!start||!text.trim())throw Error('Enter a valid start address and data');
  const entries=[];
  for(const [i,line] of text.trimEnd().replaceAll('\r\n','\n').split('\n').entries()){
   if(i>=100)throw Error('Maximum 100 rows per paste');
   for(const [j,value] of line.split('\t').entries()){
    if(j>=26)throw Error('Maximum 26 columns');
    if(start.row+i<10000&&start.col+j<26)entries.push({address:F.address(start.row+i,start.col+j),value});
   }
  }
  if(entries.length>500)throw Error('Limit 500 cells per paste');
  if(entries.length>1&&!global.confirm('Update '+entries.length+' spreadsheet cells?'))return;
  if(state.busy)throw Error('Save in progress, retry after completion');
  state.busy=true;let saved=0,errors=[],changes=[];
  try{
   for(const x of entries){
    const previous=dataCell(x.address);
    if(x.value===previous.raw_value)continue;
    try{
     const error=global.NexaSheetTools?.validate?.(x.address,x.value);if(error)throw Error(error);
     if(global.NexaSheetFeatures?.lock?.(x.address))throw Error('Protected cell');
     const row=global.NexaSheetOffline?.write?await global.NexaSheetOffline.write(x.address,x.value,previous.revision||0):await api('sheets/'+state.active.id+'/cell',{method:'POST',body:{address:x.address,value:x.value,revision:previous.revision||0}});
     state.cells.set(x.address,row);saved++;if(!row.queued)changes.push({address:x.address,before:previous.raw_value,after:x.value});
    }catch(e){errors.push(x.address+': '+e.message)}
   }
  }finally{state.busy=false}
  remember(changes);state.root.querySelector('.studio-modal-layer')?.remove();paint();
  notice('Saved '+saved+' cells'+(errors.length?', '+errors.length+' conflicts/errors':''),errors.length>0);
  if(errors.length)global.alert('Some cells were not saved:\n'+errors.slice(0,10).join('\n'));
 }

 function showScriptInfo(){
  showModal('<h2>Google Apps Script connector</h2>'+
   '<p>The OAuth-secured server connector is deployed. To activate it for your Google account, install the linked script in a Google Sheet and approve its requested access.</p>'+
   '<div class="notice"><strong>Ready for Google authorization — not yet connected to your account</strong>'+
   '<p>The connector verifies the Google account email against an authorized NexaBridge CRM member. It stores no shared secret in this public site.</p></div>'+
   '<p><a href="https://github.com/nexabridgesolutioncrm/nexabridgesolutioncrm.github.io/blob/main/integrations/SheetsStudioAppsScript.gs" target="_blank" rel="noopener noreferrer">View installation-ready Apps Script code ↗</a></p>'+
   '<p><a href="https://github.com/nexabridgesolutioncrm/nexabridgesolutioncrm.github.io/blob/main/integrations/SheetsStudioAppsScript.appsscript.json" target="_blank" rel="noopener noreferrer">View required OAuth manifest ↗</a></p>'+
   '<p>Installation: open a Google Sheet → Extensions → Apps Script → paste the connector and manifest → authorize → NexaBridge CRM menu → Connect → Pull / Push.</p>'+
   '<div class="studio-modal-foot"><button class="btn primary" data-sheet-action="dismiss">Close</button></div>');
 }
 async function onClick(ev){
  const el=ev.target.closest('[data-sheet-action]');
  if(el){ev.preventDefault();const action=el.dataset.sheetAction;
   try{
    if(action==='googleCreate')openOfficialGoogle('https://docs.google.com/spreadsheets/create');
    else if(action==='googleLink')googleLinkDialog();
    else if(action==='googleSave')await saveGoogleLink();
    else if(action==='googleReload')await refreshGoogleLinks();
    else if(action==='googleOpen'){
     const target=state.googleLinks.find(x=>x.id===el.dataset.id);
     if(!target)throw Error('Google spreadsheet link not found');
     openOfficialGoogle(target.url);
    }
    else if(action==='googleUnlink')await unlinkGoogle(el.dataset.id);
    else if(action==='open')await openSheet(el.dataset.id);
    else if(action==='tabSwitch')await openSheet(el.dataset.id);
    else if(action==='tabCreate')await createTab();
    else if(action==='tabRename')await renameTab();
    else if(action==='tabRemove')await removeTab();
    else if(action==='new')await createSheet();
    else if(action==='back')await back();
    else if(action==='refresh'){await refreshSheet();await global.NexaSheetFeatures?.preloadLinks?.();await global.NexaSheetOffline?.flush?.()}
    else if(action.startsWith('sf-'))await global.NexaSheetFeatures?.action?.(action,el);
    else if(action.startsWith('sx-'))await global.NexaSheetTools?.action?.(action,el);
    else if(action.startsWith('so-'))await global.NexaSheetOffline?.action?.(action,el);
    else if(action==='copyCells')await copyCells();
    else if(action==='copyDraft'){
     if(!state.conflictDraft)throw Error('No draft to copy');
     if(!navigator.clipboard?.writeText)throw Error('Select the draft text and copy it manually');
     await navigator.clipboard.writeText(state.conflictDraft.value);notice('Unsaved cell value copied');
    }
    else if(action==='pasteCells')pasteCellsDialog();
    else if(action==='pasteSave')await pasteCellsSave();
    else if(action==='rowPrev'){state.rowStart=Math.max(0,state.rowStart-50);paint();const row=global.NexaSheetTools?.view?.(state.rowStart,1)?.rows?.[0];if(row!==undefined)selectCell(F.address(row,0))}
    else if(action==='rowNext'){const total=global.NexaSheetTools?.view?.(0,0)?.total||10000;state.rowStart=Math.min(Math.floor((Math.max(1,total)-1)/50)*50,state.rowStart+50);paint();const row=global.NexaSheetTools?.view?.(state.rowStart,1)?.rows?.[0];if(row!==undefined)selectCell(F.address(row,0))}
    else if(action==='edit')await editCell(state.selected);
    else if(action==='undo')await replayHistory(false);
    else if(action==='redo')await replayHistory(true);
    else if(action==='clear')await clearSelection();
    else if(action==='fillDown')await fillDown();
    else if(action==='find')findDialog();
    else if(action==='findNext')findNext();
    else if(action==='replaceAll')await replaceAll();
    else if(action==='save')await saveCell(state.selected,state.root.querySelector('#studioFormulaBar').value);
    else if(action==='chart')chartEditor();
    else if(action==='editChart')chartEditor(Number(el.dataset.index));
    else if(action==='saveChart')await saveChart(Number(el.dataset.index));
    else if(action==='deleteChart')await removeChart(Number(el.dataset.index));
    else if(action==='import'){const input=document.createElement('input');input.type='file';input.accept='.xlsx,.xls,.xlsm';
     input.onchange=async()=>{try{await importFile(input.files?.[0])}catch(e){notice(e.message,true)}};input.click();}
    else if(action==='runImport')await runImport();
    else if(action==='dismiss'){state.root.querySelector('.studio-modal-layer')?.remove();}
    else if(action==='script')showScriptInfo();
    else if(action==='export')exportCSV();
    else if(action==='exportXLSX')exportXLSX();
    else if(action==='remove'){
     if(!canManage())throw Error('Only Owner or Admin can delete spreadsheets');
     if(global.confirm('Permanently delete this spreadsheet and its cells?')){
      await api('sheets/'+el.dataset.id,{method:'DELETE'});await listRefresh();notice('Spreadsheet deleted');
     }
    }
   }catch(e){notice(e.message||'Operation failed',true)}
   return;
  }
  const cell=ev.target.closest('[data-sheet-address]');
  if(cell&&state.active){
   const address=cell.dataset.sheetAddress;
   if(ev.target.closest('.studio-in-cell-editor'))return;
   if(state.selected===address&&canCreate()&&!ev.shiftKey&&!state.editing){editCell(address);return}
   selectCell(address,ev.shiftKey);
  }
 }

 function displayRowIndex(address){
  const p=F.coordinates(address);if(!p)return null;
  const view=global.NexaSheetTools?.view?.(0,10000);
  if(!view||view.total===10000&&!global.NexaSheetTools?.settings?.().sort&&!global.NexaSheetTools?.settings?.().filter)return p.row;
  const index=view.rows.indexOf(p.row);
  return index>=0?index:null;
 }
 function visibleCell(address){
  const p=F.coordinates(address);if(!p)return;
  const index=displayRowIndex(address);
  const start=Math.floor((index==null?p.row:index)/50)*50;
  if(start!==state.rowStart){state.rowStart=start;paint()}
  selectCell(address);
  state.root?.querySelector('[data-sheet-address="'+address+'"]')?.focus({preventScroll:true});
 }
 function moveSelection(dx,dy,extend=false){
  const p=F.coordinates(state.selected);if(!p)return;
  const currentView=global.NexaSheetTools?.view?.(0,10000);
  const displayed=currentView?.rows||Array.from({length:10000},(_,i)=>i);
  const at=displayed.indexOf(p.row);
  const nextIndex=Math.min(Math.max(0,at+dy),Math.max(0,displayed.length-1));
  const row=dy&&at>=0?displayed[nextIndex]:p.row;
  const target=F.address(row,Math.max(0,Math.min(25,p.col+dx)));
  if(!target)return;
  const targetPage=Math.floor((dy&&at>=0?nextIndex:Math.max(0,displayed.indexOf(row)))/50)*50;
  if(targetPage!==state.rowStart){state.rowStart=targetPage;paint()}
  selectCell(target,extend);state.root?.querySelector('[data-sheet-address="'+target+'"]')?.focus({preventScroll:true});
 }
 function selectionAddresses(){
  const p=F.coordinates(state.selected);if(!p)return [];
  const r=state.range?rangeLimits():{top:p.row,bottom:p.row,left:p.col,right:p.col};
  if(!r||(r.bottom-r.top+1)*(r.right-r.left+1)>500)throw Error('Select up to 500 cells');
  const out=[];
  for(let row=r.top;row<=r.bottom;row++)for(let col=r.left;col<=r.right;col++)out.push(F.address(row,col));
  return out;
 }
 async function applyValues(entries,label){
  if(!canCreate())throw Error('Read-only account');if(state.busy)throw Error('Save in progress');
  state.busy=true;const changes=[];const errors=[];
  try{
   for(const x of entries){
    const previous=dataCell(x.address);
    if(previous.raw_value===x.value)continue;
    if(global.NexaSheetFeatures?.lock?.(x.address)){errors.push(x.address+' protected');continue}
    const validationError=global.NexaSheetTools?.validate?.(x.address,x.value);if(validationError){errors.push(validationError);continue}
    try{
     const row=await (global.NexaSheetOffline?.write?global.NexaSheetOffline.write(x.address,x.value,previous.revision||0):api('sheets/'+state.active.id+'/cell',{method:'POST',body:{address:x.address,value:x.value,revision:previous.revision||0}}));
     state.cells.set(x.address,row);
     if(!row.queued)changes.push({address:x.address,before:previous.raw_value,after:x.value});
    }catch(e){errors.push(x.address+': '+e.message)}
   }
  }finally{state.busy=false}
  remember(changes);paint();
  notice(label+': '+changes.length+' saved'+(errors.length?', '+errors.length+' errors':''),!!errors.length);
  if(errors.length)global.alert('Some changes were not saved:\n'+errors.slice(0,10).join('\n'));
  return !errors.length;
 }
 async function clearSelection(){
  const addresses=selectionAddresses();await applyValues(addresses.map(address=>({address,value:''})),'Cleared cells');
 }
 async function replayHistory(redo){
  if(state.busy)throw Error('Save in progress');
  const source=redo?state.redoStack:state.undoStack;
  if(!source.length){notice('Nothing to '+(redo?'redo':'undo'));return}
  const changes=source[source.length-1];
  for(const change of changes)if(dataCell(change.address).raw_value!==(redo?change.before:change.after))throw Error('A cell changed since this action; refresh and review before undoing');
  if(changes.some(change=>global.NexaSheetFeatures?.lock?.(change.address)))throw Error('Selection includes protected cells');
  const entries=changes.map(change=>({address:change.address,value:redo?change.after:change.before}));
  source.pop();state.historyReplay=true;
  try{
   const ok=await applyValues(entries,redo?'Redo':'Undo');
   if(ok)(redo?state.undoStack:state.redoStack).push(changes);
   else{source.push(changes);state.undoStack=[];state.redoStack=[]}
  }finally{state.historyReplay=false}
 }
 async function pasteClipboard(text){
  if(!canCreate())return;
  const p=F.coordinates(state.selected);if(!p||!text)return;
  const lines=text.replaceAll('\r\n','\n').replaceAll('\r','\n').replace(/\n$/,'').split('\n');
  if(lines.length>100)throw Error('Paste limited to 100 rows');
  const entries=[];
  for(let i=0;i<lines.length;i++){
   const columns=lines[i].split('\t');
   for(let j=0;j<columns.length;j++){
    if(p.row+i>=10000||p.col+j>=26)throw Error('Paste exceeds sheet boundaries');
    entries.push({address:F.address(p.row+i,p.col+j),value:columns[j]});
   }
  }
  if(entries.length>500)throw Error('Paste limited to 500 cells');
  await applyValues(entries,'Pasted cells');
 }
 function onPaste(ev){
  if(!state.active||!ev.target?.matches?.('.sheet-studio-cell'))return;
  if(!canCreate())return;
  const text=ev.clipboardData?.getData('text/plain');
  if(text!==undefined){ev.preventDefault();pasteClipboard(text).catch(e=>notice(e.message,true))}
 }


 function findDialog(){
  showModal('<h2>Find and replace</h2><p>Search values and formulas in the active sheet.</p>'+
   '<label class="studio-input-label">Find</label><input class="select" id="studioFindText" autocomplete="off">'+
   '<label class="studio-input-label">Replace with</label><input class="select" id="studioReplaceText" autocomplete="off" '+(canCreate()?'':'disabled')+'>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="findNext">Find next</button>'+
   (canCreate()?'<button class="btn primary" data-sheet-action="replaceAll">Replace all</button>':'')+
   '<button class="btn" data-sheet-action="dismiss">Close</button></div>');
  state.root.querySelector('#studioFindText')?.focus();
 }
 function findNext(){
  const needle=state.root?.querySelector('#studioFindText')?.value||'';
  if(!needle)throw Error('Enter a search term');
  const matches=[...state.cells.values()].filter(row=>String(row.raw_value||'').toLowerCase().includes(needle.toLowerCase()))
   .sort((a,b)=>{const x=F.coordinates(a.address),y=F.coordinates(b.address);return x.row-y.row||x.col-y.col});
  if(!matches.length)return notice('No matches found',true);
  const here=matches.findIndex(x=>x.address===state.selected);
  const next=matches[(here+1)%matches.length].address;
  state.root.querySelector('.studio-modal-layer')?.remove();
  visibleCell(next);notice('Found '+needle+' in '+next+' ('+matches.length+' matches)');
 }
 async function replaceAll(){
  if(!canCreate())throw Error('Read-only account');
  const needle=state.root?.querySelector('#studioFindText')?.value||'';
  if(!needle)throw Error('Enter a search term');
  const replacement=state.root?.querySelector('#studioReplaceText')?.value||'';
  const escaped=Array.from(needle).map(ch=>'.*+?^$()[]{}|\\'.includes(ch)?'\\'+ch:ch).join('');
  const pattern=new RegExp(escaped,'gi');
  const entries=[...state.cells.values()].filter(row=>String(row.raw_value||'').toLowerCase().includes(needle.toLowerCase()))
   .map(row=>({address:row.address,value:String(row.raw_value).replace(pattern,()=>replacement)}));
  if(!entries.length)return notice('No matching cells',true);
  if(entries.length>500)throw Error('Replace up to 500 matching cells at a time');
  if(!global.confirm('Replace '+entries.length+' matching cells?'))return;
  state.root.querySelector('.studio-modal-layer')?.remove();
  await applyValues(entries,'Replaced matches');
 }
 async function fillDown(){
  if(!state.range)throw Error('Select a range using Shift+Arrow keys first');
  const r=rangeLimits();
  if(!r||r.bottom===r.top)throw Error('Select at least two rows');
  const entries=[];
  for(let col=r.left;col<=r.right;col++){
   const source=String(dataCell(F.address(r.top,col)).raw_value||'');
   for(let row=r.top+1;row<=r.bottom;row++)entries.push({address:F.address(row,col),value:source});
  }
  if(entries.length>500)throw Error('Fill down limited to 500 cells');
  await applyValues(entries,'Filled down');
 }
 function onDouble(ev){const cell=ev.target.closest('[data-sheet-address]');if(cell&&!ev.target.closest('.studio-in-cell-editor'))editCell(cell.dataset.sheetAddress)}
 function onKey(ev){
  if(!state.active)return;
  const cell=ev.target?.closest?.('.sheet-studio-cell');
  const key=ev.key?.toLowerCase?.()||'';
  if((ev.ctrlKey||ev.metaKey)&&cell){
   if(key==='c'){ev.preventDefault();copyCells().catch(e=>notice(e.message,true));return}
   if(key==='f'){ev.preventDefault();findDialog();return}
   if(key==='z'||key==='y'){ev.preventDefault();replayHistory(key==='y'||(key==='z'&&ev.shiftKey)).catch(e=>notice(e.message,true));return}
  }
  if(ev.target?.id==='studioFormulaBar'&&ev.key==='Enter'){ev.preventDefault();saveCell(state.selected,ev.target.value);return}
  if(!cell||ev.target.closest('.studio-in-cell-editor'))return;
  const address=cell.dataset.sheetAddress;
  if(ev.key==='Enter'||ev.key==='F2'){ev.preventDefault();editCell(address);return}
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'||ev.key==='ArrowLeft'||ev.key==='ArrowRight'||ev.key==='Tab'){
   ev.preventDefault();
   const delta={ArrowDown:[0,1],ArrowUp:[0,-1],ArrowLeft:[-1,0],ArrowRight:[1,0],Tab:[ev.shiftKey?-1:1,0]}[ev.key];
   moveSelection(delta[0],delta[1],ev.shiftKey&&ev.key!=='Tab');return;
  }
  if((ev.key==='Delete'||ev.key==='Backspace')&&canCreate()){
   ev.preventDefault();clearSelection().catch(e=>notice(e.message,true));return;
  }
  if(canCreate()&&!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&ev.key.length===1){
   ev.preventDefault();editCell(address,ev.key);return;
  }
 }
 function onChange(ev){}
 global.NexaSheetStudio={mount,leave,formulaEngine:F,buildChart:chartCard};
})(window);
