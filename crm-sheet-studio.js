/* NexaBridge Sheets Studio v4.0.
   A separate business spreadsheet area. Does not change existing CRM entity rows. */
(function(global){
 'use strict';
 const F=global.NexaFormula;
 const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
 const uid=()=>Math.random().toString(36).slice(2,10);
 const state={root:null,api:null,user:null,list:[],active:null,cells:new Map(),selected:'A1',anchor:'A1',range:false,editing:null,rowStart:0,
  channel:null,client:null,timer:null,generation:0,serial:0,busy:false,pending:[],realtime:false,presence:[],status:'',lastRemote:null,conflictDraft:null,modal:null};
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
  state.root=null;state.user=null;state.api=null;state.list=[];state.active=null;
  state.cells.clear();state.selected='A1';state.anchor='A1';state.range=false;
  state.rowStart=0;state.editing=null;state.pending=[];state.busy=false;
  state.status='';state.lastRemote=null;state.conflictDraft=null;state.importBook=null;state.modal=null;
 }
 function header(){
  return '<div class="sheet-studio-head"><div><div class="studio-eyebrow">NEXABRIDGE / LIVE DATA WORKSPACE</div><h1>Sheets Studio</h1><p>Spreadsheet formulas, shared cells, Excel imports and data-driven charts.</p></div>'+
   '<div class="studio-head-actions"><span id="sheetStatus" aria-live="polite">'+esc(state.status)+'</span>'+(state.active?'<span class="studio-peer-status" id="studioPeerStatus">'+(state.realtime?'● Live':'○ Sync')+'</span>':'')+
   (state.active?'<button class="btn" data-sheet-action="back">← All sheets</button>':'')+
   '<button class="btn" data-sheet-action="script">Apps Script ↗</button></div></div>';
 }
 function listView(){
  const sheets=state.list||[];
  return header()+'<div class="sheet-action-row">'+
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
 function grid(){
  const rows=50,cols=26,calc=engine(),name=state.active?.name||'Spreadsheet',selected=state.selected;
  const head='<thead><tr><th class="sheet-grid-corner">#</th>'+Array.from({length:cols},(_,c)=>
   '<th class="sheet-grid-column">'+F.colName(c)+'</th>').join('')+'</tr></thead>';
  const body='<tbody>'+Array.from({length:rows},(_,r)=>
   '<tr><th class="sheet-grid-row-head">'+(state.rowStart+r+1)+'</th>'+
   Array.from({length:cols},(_,c)=>{const address=F.address(state.rowStart+r,c),entry=dataCell(address),value=cellText(address,calc);
    const decor=global.NexaSheetFeatures?.cellDecoration?.(address,value)||{className:'',style:''};
    return '<td data-sheet-address="'+address+'" tabindex="0" class="sheet-studio-cell'+
     (address===selected?' selected':'')+(rangeIncludes(address)?' range-selected':'')+(state.presence.some(p=>p.cell===address&&p.id!==state.user?.id)?' peer-active':'')+(entry.raw_value.startsWith('=')?' formula':'')+decor.className+(entry.offline?' offline-draft':'')+'"'+decor.style+'> '+
     '<span>'+esc(value).slice(0,800)+'</span></td>';
   }).join('')+'</tr>'
  ).join('')+'</tbody>';
  return header()+'<section class="sheet-studio-toolbar">'+
   '<div class="sheet-studio-title"><strong>▦ '+esc(name)+'</strong><small>'+state.cells.size+' saved cells</small></div>'+
   '<div class="actions"><button class="btn" data-sheet-action="refresh">↻ Refresh</button>'+(global.NexaSheetOffline?.toolbar?.()||'')+(global.NexaSheetFeatures?.toolbar?.()||'')+'<button class="btn" data-sheet-action="copyCells">Copy range</button>'+(canCreate()?'<button class="btn" data-sheet-action="pasteCells">Paste cells</button>':'')+
   (canManage()?'<button class="btn" data-sheet-action="chart">＋ New chart</button>':'')+
   '<button class="btn" data-sheet-action="export">↓ Export CSV</button>'+
   (canCreate()?'<button class="btn" data-sheet-action="import">↑ Import XLSX</button>':'')+'</div></section>'+
   (global.NexaSheetFeatures?.banner?.()||'')+'<div class="sheet-formula-bar"><span id="studioNameBox">'+esc(selected)+'</span>'+
   '<span class="sheet-fx">ƒx</span><input id="studioFormulaBar" aria-label="Cell formula or value" '+(canCreate()?'':'readonly ')+'value="'+escapeAttr(dataCell(selected).raw_value)+'" placeholder="'+(canCreate()?'Enter text or =SUM(A1:A10)':'Read-only cell · select to inspect')+'">'+
   (canCreate()?'<button class="btn primary" data-sheet-action="save">Save cell</button>':'<span class="sheet-readonly-note">Read-only workspace</span>')+'</div>'+
   '<div class="sheet-grid-scroller"><table id="studioGrid" class="sheet-grid">'+head+body+'</table></div>'+ '<div class="sheet-rowpager"><span>Rows '+(state.rowStart+1)+'–'+(state.rowStart+50)+' · 26 columns</span><div class="actions"><button class="btn small" data-sheet-action="rowPrev" '+(state.rowStart===0?'disabled':'')+'>← Previous 50</button><button class="btn small" data-sheet-action="rowNext" '+(state.rowStart>=9950?'disabled':'')+'>Next 50 →</button></div></div>'+
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
  const rows=Math.min(10000,Math.max(50,...[...state.cells.keys()].map(key=>(F.coordinates(key)?.row||0)+1))),category=F.colIndex(def.category),value=F.colIndex(def.measure);
  if(category<0||category>25||value<0||value>25)return '';
  const calc=engine(),groups=new Map();
  for(let r=1;r<rows;r++){
   const label=cellText(F.address(r,category),calc);if(!label||String(label).startsWith('#'))continue;
   const val=Number(cellText(F.address(r,value),calc));
   const key=String(label).slice(0,35),entry=groups.get(key)||{sum:0,count:0};
   if(def.aggregate==='count'||Number.isFinite(val)){entry.sum+=Number.isFinite(val)?val:0;entry.count++;groups.set(key,entry)}
  }
  const data=[...groups].slice(0,12).map(([name,v])=>({name,value:def.aggregate==='count'?v.count:def.aggregate==='average'?v.sum/v.count:v.sum}));
  const colors=['#8268e8','#56b9a0','#73a7ec','#edb86f','#df859e','#8a85da','#75c9cf','#b7a2ef','#e0a4bf','#85b59c','#b7a4c8','#94b1ed'];
  let inner='<text x="320" y="125" text-anchor="middle" fill="#7d88a0" font-size="15">Add column values to see the chart</text>';
  if(data.length){
   if(def.type==='pie'||def.type==='doughnut'){
    const positive=data.map(d=>Math.max(0,d.value)),total=positive.reduce((a,b)=>a+b,0);
    let acc=0;
    if(total>0){
     inner=data.map((d,i)=>{const fraction=positive[i]/total,from=acc;acc+=fraction;
      return '<circle cx="230" cy="145" r="88" fill="none" stroke="'+colors[i%colors.length]+'" stroke-width="'+(def.type==='pie'?88:34)+'" stroke-dasharray="'+(fraction*552.92)+' '+552.92+'" stroke-dashoffset="'+(-from*552.92)+'" transform="rotate(-90 230 145)"/>';
     }).join('')+
     data.map((d,i)=>'<rect x="370" y="'+(28+i*20)+'" width="10" height="10" fill="'+colors[i%colors.length]+'"/>'+
      '<text x="387" y="'+(38+i*20)+'" font-size="10.5" fill="currentColor">'+esc(d.name.slice(0,18))+' ('+esc(d.value.toFixed(1))+')</text>').join('');
    }
   }else{
    const max=Math.max(1,...data.map(x=>Math.abs(x.value))),width=520/(Math.max(1,data.length)),base=215;
    inner='<line x1="65" y1="'+base+'" x2="613" y2="'+base+'" stroke="#aab4c5" stroke-width="1"/>'+
      (def.type==='line'?
       '<polyline fill="none" stroke="#785ae7" stroke-width="3" points="'+data.map((d,i)=>(85+i*width)+','+(base-155*Math.max(0,d.value)/max)).join(' ')+'"/>'+
       data.map((d,i)=>'<circle cx="'+(85+i*width)+'" cy="'+(base-155*Math.max(0,d.value)/max)+'" r="5" fill="'+colors[i%colors.length]+'"/>').join(''):
       data.map((d,i)=>'<rect x="'+(75+i*width)+'" y="'+(base-155*Math.max(0,d.value)/max)+'" width="'+Math.max(8,width-14)+'" height="'+(155*Math.max(0,d.value)/max)+'" rx="5" fill="'+colors[i%colors.length]+'"/>').join(''))+
      data.map((d,i)=>'<text x="'+(85+i*width)+'" y="234" font-size="9.2" fill="currentColor" text-anchor="middle">'+esc(d.name.slice(0,9))+'</text>').join('');
   }
  }
  return '<div class="card sheet-chart"><div class="sheet-chart-header"><div><strong>'+esc(def.title||'Chart')+'</strong><small>'+esc(def.type)+' · '+esc(def.aggregate)+' · '+esc(def.category)+' / '+esc(def.measure)+'</small></div>'+
   (canManage()?'<div class="actions"><button class="btn small" data-sheet-action="editChart" data-index="'+index+'">Edit</button><button class="btn small danger" data-sheet-action="deleteChart" data-index="'+index+'">Remove</button></div>':'')+'</div>'+
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
  if(isNew){
   element.addEventListener('click',onClick);
   element.addEventListener('dblclick',onDouble);
   element.addEventListener('keydown',onKey);
   element.addEventListener('change',onChange);
  }
  if(!state.list.length){
   try{await listRefresh()}catch(e){state.status='Unable to load spreadsheets: '+e.message;paint()}
  }else paint();
 }
 async function openSheet(id){
  removeRemote();const generation=state.generation;
  const data=await api('sheets/'+encodeURIComponent(id));
  if(generation!==state.generation)return;
  state.active=data.sheet;state.selected='A1';state.anchor='A1';state.range=false;state.rowStart=0;setCells(data.cells);
  paint();await connect();
 }
 async function back(){
  removeRemote();state.active=null;state.cells.clear();state.selected='A1';state.anchor='A1';state.range=false;state.rowStart=0;
  await listRefresh();
 }
 async function saveCell(address,value){
  const generation=state.generation,sheetId=state.active?.id;
  if(!sheetId)return;
  if(!canCreate()){notice('Read-only account cannot save cells',true);return}
  if(state.busy){
   state.pending=state.pending.filter(item=>item.address!==address);
   state.pending.push({address,value});
   notice('Saving in order · '+state.pending.length+' queued');
   return;
  }
  const previous=dataCell(address);
  if(previous.raw_value===value)return;
  if(String(value).length>4000){notice('Cell values cannot exceed 4,000 characters',true);return}
  state.busy=true;notice('Saving '+address+'…');
  try{
   const saved=await api('sheets/'+state.active.id+'/cell',{method:'POST',body:{address,value,revision:previous.revision||0}});
   if(generation!==state.generation||state.active?.id!==sheetId)return;
   state.conflictDraft=null;state.cells.set(address,saved);paint();notice('Saved '+address);
  }catch(e){
   if(generation!==state.generation||state.active?.id!==sheetId)return;
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
  state.active=data.sheet;setCells(data.cells);
  if(!state.editing)paint();
  if(!quiet)notice('Sheet refreshed');
 }
 async function editCell(address){
  if(!canCreate())return;
  const node=state.root?.querySelector('[data-sheet-address="'+address+'"]');
  if(!node||state.editing)return;
  selectCell(address);state.editing=address;
  const input=document.createElement('input');
  input.className='studio-in-cell-editor';input.value=dataCell(address).raw_value;input.setAttribute('aria-label','Edit cell '+address);
  node.replaceChildren(input);input.focus();input.select();
  let finished=false;
  async function finish(save){
   if(finished)return;finished=true;
   const value=input.value;
   state.editing=null;
   if(save)await saveCell(address,value);
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
  const def=index<0?{title:'Sales overview',type:'bar',category:'A',measure:'B',aggregate:'sum'}:state.active?.charts[index];
  if(!def)return;
  const opts=(values,current)=>values.map(v=>'<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v[0].toUpperCase()+v.slice(1))+'</option>').join('');
  showModal('<h2>'+((index<0)?'New chart':'Edit chart')+'</h2><p>Create a chart with grouped calculations from rows 2–50. Row 1 can hold headers.</p>'+
   '<div class="studio-chart-fields"><label>Chart name<input class="select" id="studioChartTitle" maxlength="80" value="'+esc(def.title)+'"></label>'+
   '<label>Chart type<select class="select" id="studioChartType">'+opts(['bar','line','pie','doughnut'],def.type)+'</select></label>'+
   '<label>Category column<select class="select" id="studioChartCategory">'+opts(Array.from({length:26},(_,i)=>F.colName(i)),def.category)+'</select></label>'+
   '<label>Value column<select class="select" id="studioChartMeasure">'+opts(Array.from({length:26},(_,i)=>F.colName(i)),def.measure)+'</select></label>'+
   '<label>Aggregate<select class="select" id="studioChartAggregate">'+opts(['sum','average','count'],def.aggregate)+'</select></label></div>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Cancel</button>'+
   '<button class="btn primary" data-sheet-action="saveChart" data-index="'+index+'">Save chart</button></div>');
 }
 async function saveChart(index){
  if(!canManage())throw Error('Only Owner or Admin can save chart settings');
  const $=selector=>state.root.querySelector(selector);
  const config={id:uid(),title:$('#studioChartTitle').value.trim()||'Chart',type:$('#studioChartType').value,
   category:$('#studioChartCategory').value,measure:$('#studioChartMeasure').value,aggregate:$('#studioChartAggregate').value};
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
    const channel=client.channel('nexa-sheets-'+id,{config:{presence:{key:String(state.user?.id||'member')}}}).on('presence',{event:'sync'},()=>updatePresence()).on('postgres_changes',
     {event:'*',schema:'public',table:'crm_sheet_cells',filter:'sheet_id=eq.'+id},
     payload=>{
      if(state.active?.id!==id)return;
      const row=payload.new;
      if(!row?.address)return;
      const old=dataCell(row.address);
      if(old.revision>=row.revision)return;
      state.cells.set(row.address,row);state.lastRemote=row.updated_by;
      if(state.editing===row.address||state.busy||state.root?.querySelector('.studio-modal-layer')){notice('Remote change received; reload after finishing your edit.',true);return}
      state.status='Live update received';
      paint();
     });
    channel.subscribe(status=>{if(status==='SUBSCRIBED'){state.realtime=true;trackPresence();notice('Live collaboration connected')}
     if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){state.realtime=false;notice('Live connection interrupted; fallback sync active',true)}});
    state.client=client;state.channel=channel;
   }catch(e){notice('Live connection unavailable; fallback sync active',true)}
  }
  state.timer=setInterval(async()=>{
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
  state.busy=true;let saved=0,errors=[];
  try{
   for(const x of entries){
    const previous=dataCell(x.address);
    if(x.value===previous.raw_value)continue;
    try{
     const row=await api('sheets/'+state.active.id+'/cell',{method:'POST',body:{address:x.address,value:x.value,revision:previous.revision||0}});
     state.cells.set(x.address,row);saved++;
    }catch(e){errors.push(x.address+': '+e.message)}
   }
  }finally{state.busy=false}
  state.root.querySelector('.studio-modal-layer')?.remove();paint();
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
    if(action==='open')await openSheet(el.dataset.id);
    else if(action==='new')await createSheet();
    else if(action==='back')await back();
    else if(action==='refresh')await refreshSheet();
    else if(action==='copyCells')await copyCells();
    else if(action==='copyDraft'){
     if(!state.conflictDraft)throw Error('No draft to copy');
     if(!navigator.clipboard?.writeText)throw Error('Select the draft text and copy it manually');
     await navigator.clipboard.writeText(state.conflictDraft.value);notice('Unsaved cell value copied');
    }
    else if(action==='pasteCells')pasteCellsDialog();
    else if(action==='pasteSave')await pasteCellsSave();
    else if(action==='rowPrev'){state.rowStart=Math.max(0,state.rowStart-50);state.selected=F.address(state.rowStart,0);paint()}
    else if(action==='rowNext'){state.rowStart=Math.min(9950,state.rowStart+50);state.selected=F.address(state.rowStart,0);paint()}
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
  if(cell&&state.active)selectCell(cell.dataset.sheetAddress,ev.shiftKey);
 }
 function onDouble(ev){const cell=ev.target.closest('[data-sheet-address]');if(cell)editCell(cell.dataset.sheetAddress)}
 function onKey(ev){
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='c'&&ev.target?.matches('.sheet-studio-cell')){ev.preventDefault();copyCells().catch(e=>notice(e.message,true));return}
  if(ev.target?.id==='studioFormulaBar'&&ev.key==='Enter'){ev.preventDefault();saveCell(state.selected,ev.target.value);return}
  if(ev.target?.matches?.('.sheet-studio-cell')&&ev.key==='Enter'){ev.preventDefault();editCell(ev.target.dataset.sheetAddress)}
 }
 function onChange(ev){}
 global.NexaSheetStudio={mount,leave,formulaEngine:F,buildChart:chartCard};
})(window);
