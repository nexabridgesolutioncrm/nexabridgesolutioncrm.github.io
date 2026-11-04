/* NexaBridge Sheets Studio 4.6: non-destructive spreadsheet formatting, validation, view controls. */
(function(global){
 'use strict';
 let ctx=null,localView=null;
 const $=id=>ctx?.state.root?.querySelector(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const owner=()=>['owner','admin'].includes(ctx?.state.user?.role);
 const writable=()=>['owner','admin','agent'].includes(ctx?.state.user?.role);
 const sheet=()=>ctx?.state.active;
 const settings=()=>localView||sheet()?.view_settings||{};
 const styles=()=>sheet()?.cell_styles||{};
 const rules=()=>sheet()?.validation_rules||[];
 const addr=(r,c)=>ctx.F.address(r,c);
 const coord=a=>ctx.F.coordinates(a);
 const colName=i=>ctx.F.colName(i);
 const maxRows=10000;
 const rowRange=()=>{const a=coord(ctx.state.anchor),b=coord(ctx.state.selected);return a&&b?{top:Math.min(a.row,b.row),bottom:Math.max(a.row,b.row),left:Math.min(a.col,b.col),right:Math.max(a.col,b.col)}:null};
 function inRange(address,range){
  const [x,y]=String(range||'').split(':').map(coord),p=coord(address);
  return !!(x&&y&&p&&p.row>=Math.min(x.row,y.row)&&p.row<=Math.max(x.row,y.row)&&p.col>=Math.min(x.col,y.col)&&p.col<=Math.max(x.col,y.col));
 }
 function toolbar(){
  return '<button class="btn" data-sheet-action="sx-view">Sort / Filter</button>'+
   '<button class="btn" data-sheet-action="sx-freeze">'+(settings().freezeRows||settings().freezeColumns?'▣ Unfreeze':'▣ Freeze')+'</button>'+
   (owner()?'<button class="btn" data-sheet-action="sx-style">Cell format</button><button class="btn" data-sheet-action="sx-validation">Data validation</button>':'');
 }
 function style(address){
  const s=styles()[address]||{};
  let css='';
  if(s.bold)css+='font-weight:800;';
  if(s.italic)css+='font-style:italic;';
  if(s.align)css+='text-align:'+s.align+';';
  if(s.background)css+='background:'+s.background+';';
  if(s.color)css+='color:'+s.color+';';
  return css;
 }
 function format(address,value){
  const t=styles()[address]?.format||'plain';
  if(value==null||value==='')return '';
  if(t==='plain')return String(value);
  const n=Number(value);
  if(t==='number'&&Number.isFinite(n))return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);
  if(t==='currency'&&Number.isFinite(n))return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
  if(t==='percent'&&Number.isFinite(n))return new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:2}).format(n);
  if(t==='date'){
   const d=new Date(value);
   if(!isNaN(d.getTime()))return new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'short',day:'numeric'}).format(d);
  }
  return String(value);
 }
 function validate(address,value){
  if(!writable())return 'Read-only account';
  const text=String(value??'');
  if(!text||text.startsWith('='))return null;
  for(const rule of rules()){
   if(!inRange(address,rule.range))continue;
   if(rule.type==='number'&&!Number.isFinite(Number(text)))return address+' must be a number';
   if(rule.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))return address+' requires an email address';
   if(rule.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||isNaN(Date.parse(text))))return address+' requires YYYY-MM-DD';
   if(rule.type==='list'&&!(rule.values||[]).includes(text))return address+' must match the allowed list: '+(rule.values||[]).join(', ');
  }
  return null;
 }
 function view(start,count){
  const config=settings(),filter=config.filter,sort=config.sort;
  if(!filter&&!sort){
   const rows=Array.from({length:Math.min(count,maxRows-start)},(_,i)=>start+i);
   return {rows,total:maxRows,limited:false};
  }
  let last=49;
  for(const key of ctx.state.cells.keys()){
   const p=coord(key);if(p&&p.row>last)last=p.row;
  }
  const upper=Math.min(maxRows,Math.max(50,last+1));
  const all=Array.from({length:upper},(_,i)=>i);
  const value=(r,col)=>String(ctx.state.cells.get(addr(r,ctx.F.colIndex(col)))?.raw_value??'');
  let rows=all;
  if(filter&&filter.column&&filter.contains){
   const needle=filter.contains.toLocaleLowerCase();
   rows=rows.filter(r=>value(r,filter.column).toLocaleLowerCase().includes(needle));
  }
  if(sort&&sort.column){
   const direction=sort.direction==='desc'?-1:1;
   const compare=(a,b)=>{
    if(a===''&&b!=='')return 1;
    if(b===''&&a!=='')return -1;
    const na=Number(a),nb=Number(b);
    if(a!==''&&b!==''&&Number.isFinite(na)&&Number.isFinite(nb))return na-nb;
    return a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
   };
   rows.sort((a,b)=>{
    const va=value(a,sort.column),vb=value(b,sort.column);
    if(!va&&vb)return 1;if(!vb&&va)return -1;
    return direction*compare(va,vb)||a-b;
   });
  }
  return {rows:rows.slice(start,start+count),total:rows.length,limited:true};
 }
 async function persist(key,value){
  if(!owner())throw Error('Only Owner/Admin can change shared sheet settings');
  const result=await ctx.api('sheets/'+encodeURIComponent(sheet().id),{method:'PATCH',body:{[key]:value}});
  if(!result?.id)throw Error('Settings were not saved');
  ctx.state.active={...ctx.state.active,...result};
  ctx.state.rowStart=0;
  ctx.paint();
  ctx.notice('Spreadsheet settings saved');
 }
 function formatDialog(){
  if(!owner())throw Error('Owner/Admin role required');
  const s=styles()[ctx.state.selected]||{};
  ctx.showModal('<h2>Format cells</h2><p>Applies to the selected cell or highlighted range. Stored securely with this spreadsheet.</p>'+
   '<div class="sx-options"><label><input id="sxBold" type="checkbox" '+(s.bold?'checked':'')+'> Bold</label><label><input id="sxItalic" type="checkbox" '+(s.italic?'checked':'')+'> Italic</label></div>'+
   '<label class="studio-input-label">Alignment</label><select class="select" id="sxAlign">'+['left','center','right'].map(v=>'<option value="'+v+'" '+(s.align===v?'selected':'')+'>'+v+'</option>').join('')+'</select>'+
   '<label class="studio-input-label">Background color</label><input type="color" class="sx-color" id="sxBg" value="'+(s.background||'#ffffff')+'">'+
   '<label class="studio-input-label">Text color</label><input type="color" class="sx-color" id="sxFg" value="'+(s.color||'#202a40')+'">'+
   '<label class="studio-input-label">Number format</label><select class="select" id="sxFormat">'+['plain','number','currency','percent','date'].map(v=>'<option value="'+v+'" '+(s.format===v?'selected':'')+'>'+v+'</option>').join('')+'</select>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="sx-style-clear">Clear formatting</button><button class="btn primary" data-sheet-action="sx-style-save">Apply style</button></div>');
 }
 function rangeAddresses(){
  const r=ctx.state.range?rowRange():null;
  if(!r)return [ctx.state.selected];
  const count=(r.bottom-r.top+1)*(r.right-r.left+1);
  if(count>500)throw Error('Formatting limited to 500 selected cells');
  const a=[];for(let row=r.top;row<=r.bottom;row++)for(let col=r.left;col<=r.right;col++)a.push(addr(row,col));
  return a;
 }
 async function saveStyle(clear){
  const next={...styles()};
  const item=clear?null:{
   bold:!!$('#sxBold')?.checked,italic:!!$('#sxItalic')?.checked,
   align:$('#sxAlign')?.value||'left',
   background:$('#sxBg')?.value||'#ffffff',
   color:$('#sxFg')?.value||'#202a40',
   format:$('#sxFormat')?.value||'plain'
  };
  for(const a of rangeAddresses()){if(clear)delete next[a];else next[a]=item}
  if(Object.keys(next).length>1200)throw Error('Workbook formatting supports 1,200 cells currently');
  ctx.state.root.querySelector('.studio-modal-layer')?.remove();
  await persist('cell_styles',next);
 }
 function validationDialog(){
  if(!owner())throw Error('Owner/Admin role required');
  const existing=rules();
  ctx.showModal('<h2>Data validation</h2><p>Define one rule per range. Invalid values cannot be saved through the CRM grid.</p>'+
   '<label class="studio-input-label">Range (e.g. A2:A100)</label><input class="select" id="sxRange" value="'+esc(ctx.state.selected+':'+ctx.state.selected)+'">'+
   '<label class="studio-input-label">Type</label><select class="select" id="sxRuleType"><option value="list">Dropdown list</option><option value="number">Number</option><option value="email">Email</option><option value="date">Date YYYY-MM-DD</option></select>'+
   '<label class="studio-input-label">List values (comma-separated)</label><input class="select" id="sxValues" placeholder="New, In progress, Done">'+
   '<div class="studio-modal-foot"><button class="btn primary" data-sheet-action="sx-validation-add">Add rule</button><button class="btn" data-sheet-action="dismiss">Close</button></div>'+
   '<h3>Active rules</h3>'+(existing.length?existing.map((x,i)=>'<div class="panelrow"><span>'+esc(x.range)+' — '+esc(x.type)+(x.values?.length?' ('+esc(x.values.join(', '))+')':'')+'</span><button class="btn small" data-sheet-action="sx-validation-remove" data-index="'+i+'">Remove</button></div>').join(''):'<p>No validation rules yet</p>'));
 }
 async function addRule(){
  const range=String($('#sxRange')?.value||'').trim().toUpperCase(),type=$('#sxRuleType')?.value;
  const values=String($('#sxValues')?.value||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);
  const ok=/^[A-Z]{1,2}[1-9][0-9]{0,3}:[A-Z]{1,2}[1-9][0-9]{0,3}$/.test(range);
  if(!ok||!['list','number','email','date'].includes(type))throw Error('Invalid range or validation type');
  if(type==='list'&&!values.length)throw Error('Enter dropdown values');
  const next=[...rules(),{range,type,values}];if(next.length>40)throw Error('Maximum 40 rules');
  ctx.state.root.querySelector('.studio-modal-layer')?.remove();
  await persist('validation_rules',next);
 }
 function viewDialog(){
  const s=settings();
  const opts=['','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  const select=(id,selected)=>'<select id="'+id+'" class="select">'+opts.map(x=>'<option value="'+x+'" '+(x===selected?'selected':'')+'>'+(x||'None')+'</option>').join('')+'</select>';
  ctx.showModal('<h2>Sort and filter</h2><p>Display-only ordering: formulas and stored cell addresses remain unchanged.</p>'+
   '<label class="studio-input-label">Sort by column</label>'+select('sxSortCol',s.sort?.column||'')+
   '<label class="studio-input-label">Direction</label><select id="sxSortDir" class="select"><option value="asc">Ascending</option><option value="desc" '+(s.sort?.direction==='desc'?'selected':'')+'>Descending</option></select>'+
   '<label class="studio-input-label">Filter column</label>'+select('sxFilterCol',s.filter?.column||'')+
   '<label class="studio-input-label">Contains</label><input class="select" id="sxFilterText" value="'+esc(s.filter?.contains||'')+'" placeholder="Keyword">'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="sx-view-clear">Clear filter</button><button class="btn primary" data-sheet-action="sx-view-save">Apply</button></div>');
 }
 async function setView(clear){
  const old=settings(),sortCol=clear?'':$('#sxSortCol')?.value||'',filterCol=clear?'':$('#sxFilterCol')?.value||'';
  const view={sort:sortCol?{column:sortCol,direction:$('#sxSortDir')?.value==='desc'?'desc':'asc'}:null,
   filter:filterCol&&$('#sxFilterText')?.value?{column:filterCol,contains:$('#sxFilterText').value.trim().slice(0,100)}:null,
   freezeRows:old.freezeRows===true,freezeColumns:old.freezeColumns===true};
  ctx.state.root.querySelector('.studio-modal-layer')?.remove();
  ctx.state.rowStart=0;
  if(owner())await persist('view_settings',view);
  else{localView=view;ctx.paint();ctx.notice('Personal view applied for this session')}
 }
 async function toggleFreeze(){
  const old=settings();
  const active=old.freezeRows||old.freezeColumns;
  const next={...old,freezeRows:!active,freezeColumns:!active};
  if(owner())await persist('view_settings',next);
  else{localView=next;ctx.paint();ctx.notice('Personal freeze view updated')}
 }
 async function action(name,el){
  if(name==='sx-style'){formatDialog();return true}
  if(name==='sx-style-save'||name==='sx-style-clear'){await saveStyle(name==='sx-style-clear');return true}
  if(name==='sx-validation'){validationDialog();return true}
  if(name==='sx-validation-add'){await addRule();return true}
  if(name==='sx-validation-remove'){
   const i=Number(el.dataset.index);if(!Number.isSafeInteger(i)||i<0||i>=rules().length)throw Error('Rule not found');
   const next=rules().filter((_,j)=>j!==i);
   ctx.state.root.querySelector('.studio-modal-layer')?.remove();await persist('validation_rules',next);return true;
  }
  if(name==='sx-view'){viewDialog();return true}
  if(name==='sx-view-save'||name==='sx-view-clear'){await setView(name==='sx-view-clear');return true}
  if(name==='sx-freeze'){await toggleFreeze();return true}
  return false;
 }
 function choices(address){
  for(const rule of rules())if(rule.type==='list'&&inRange(address,rule.range))return rule.values||[];
  return [];
 }
 global.NexaSheetTools={bind(context){ctx=context;localView=null},reset(){localView=null},toolbar,style,format,validate,choices,view,settings,action};
})(window);
