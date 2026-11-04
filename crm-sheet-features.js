/* NexaBridge Sheets Studio 4.3 - comments, audit history, guarded ranges,
   conditional formatting and pivot tables. All configuration is server-backed. */
(function(global){
 'use strict';
 let ctx=null,comments=[],external=new Map(),historyOffset=0,historyAddress='';
 const $=s=>ctx?.state.root?.querySelector(s);
 const e=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
 const uid=()=>Math.random().toString(36).slice(2,11);
 const admin=()=>['owner','admin'].includes(ctx?.state.user?.role);
 const staff=()=>['owner','admin','agent'].includes(ctx?.state.user?.role);
 const api=(path,init)=>ctx.api(path,init);
 const sheet=()=>ctx?.state.active;
 const addrPattern=/^[A-Z]{1,3}[1-9][0-9]{0,4}$/;
 const rangePattern=/^[A-Z]{1,3}[1-9][0-9]{0,4}:[A-Z]{1,3}[1-9][0-9]{0,4}$/;
 const num=v=>Number.isFinite(Number(v))?Number(v):null;
 function inside(address,range){
  const parts=String(range||'').split(':'),p=ctx.F.coordinates(address);
  const a=ctx.F.coordinates(parts[0]),b=ctx.F.coordinates(parts[1]||parts[0]);
  return !!(p&&a&&b&&p.row>=Math.min(a.row,b.row)&&p.row<=Math.max(a.row,b.row)&&
   p.col>=Math.min(a.col,b.col)&&p.col<=Math.max(a.col,b.col));
 }
 function lock(address){
  return !admin()&&(sheet()?.protected_ranges||[]).some(x=>inside(address,x.range));
 }
 function cellDecoration(address,value){
  let cls='',style='';
  const rules=sheet()?.formatting_rules||[];
  for(const rule of rules){
   if(!inside(address,rule.range))continue;
   const text=String(value??''),op=rule.operator,a=num(text),b=num(rule.value),c=num(rule.value2);
   let result=false;
   if(op==='empty')result=!text.trim();
   else if(op==='notEmpty')result=!!text.trim();
   else if(op==='contains')result=text.toLocaleLowerCase().includes(String(rule.value||'').toLocaleLowerCase());
   else if(op==='equals')result=text.toLocaleLowerCase()===String(rule.value||'').toLocaleLowerCase();
   else if(op==='greater')result=a!==null&&b!==null&&a>b;
   else if(op==='less')result=a!==null&&b!==null&&a<b;
   else if(op==='between')result=a!==null&&b!==null&&c!==null&&a>=Math.min(b,c)&&a<=Math.max(b,c);
   if(result&&/^#[0-9a-f]{6}$/i.test(rule.background)&&/^#[0-9a-f]{6}$/i.test(rule.foreground)){
    style=' style="background:'+rule.background+'!important;color:'+rule.foreground+'!important"';
    break;
   }
  }
  if(lock(address))cls+=' protected-cell';
  if(comments.some(x=>x.address===address&&!x.resolved))cls+=' commented-cell';
  return {className:cls,style};
 }
 function toolbar(){
  return '<button class="btn" data-sheet-action="sf-comments">Comments</button>'+
   '<button class="btn" data-sheet-action="sf-history">Cell history</button>'+
   '<button class="btn" data-sheet-action="sf-pivot">Pivot tables</button>'+
   '<button class="btn" data-sheet-action="sf-link">Import range</button>'+
   (admin()?'<button class="btn" data-sheet-action="sf-format">Conditional formatting</button>'+
    '<button class="btn" data-sheet-action="sf-protect">Protect ranges</button>':'');
 }
 function banner(){
  const protectedCount=(sheet()?.protected_ranges||[]).length;
  const conditions=(sheet()?.formatting_rules||[]).length;
  return '<div class="sheet-feature-status"><span>✓ '+conditions+' formatting rules</span>'+
   '<span>▣ '+(sheet()?.pivot_configs||[]).length+' pivot tables</span>'+
   '<span>◉ '+comments.length+' comments</span>'+
   '<span>🔒 '+protectedCount+' protected ranges</span></div>';
 }
 function changed(newSheet){ctx.state.active=newSheet;ctx.paint();ctx.notice('Spreadsheet settings saved')}
 async function persist(property,value){
  if(!admin())throw Error('Only Owner or Admin can manage sheet settings');
  if(!sheet())return;
  const saved=await api('sheets/'+sheet().id,{method:'PATCH',body:{[property]:value}});
  changed(saved);
 }
 function modal(html){ctx.showModal(html)}
 function formValues(selectors){return selectors.map(id=>$(id)?.value??'')}
 async function openComments(){
  if(!sheet())return;
  const address=ctx.state.selected;
  comments=await api('sheets/'+sheet().id+'/comments');
  ctx.state.root.querySelectorAll('[data-sheet-address]').forEach(node=>{
   node.classList.toggle('commented-cell',comments.some(c=>c.address===node.dataset.sheetAddress&&!c.resolved));
  });
  const rows=comments.filter(x=>x.address===address);
  const root=rows.filter(x=>!x.parent_id);
  const nested=(comment)=>{
   const children=rows.filter(x=>x.parent_id===comment.id);
   return '<article class="sf-comment '+(comment.resolved?'sf-resolved':'')+'"><div class="sf-comment-head"><strong>'+e(comment.author_id===ctx.state.user?.id?'You':String(comment.author_id||'Team member').slice(0,8))+'</strong><small>'+e(String(comment.created_at||'').slice(0,16).replace('T',' '))+'</small></div>'+
    '<p>'+e(comment.body)+'</p><div class="actions">'+(staff()?'<button class="btn small" data-sheet-action="sf-reply" data-id="'+e(comment.id)+'">Reply</button>':'')+
    ((admin()||comment.author_id===ctx.state.user?.id)?'<button class="btn small" data-sheet-action="sf-resolve" data-id="'+e(comment.id)+'" data-resolved="'+(!comment.resolved)+'">'+(comment.resolved?'Reopen':'Resolve')+'</button>':'')+'</div>'+
    children.map(nested).join('')+'</article>';
  };
  modal('<h2>Comments · '+e(address)+'</h2><p>Discussion threads are shared with authorized NexaBridge members.</p>'+
   '<section class="sf-comments">'+(root.length?root.map(nested).join(''):'<p class="sf-empty">No comments on this cell yet.</p>')+'</section>'+
   (staff()?'<label class="studio-input-label">New comment</label><textarea id="sfCommentText" class="select sf-textarea" rows="4" maxlength="4000" placeholder="Write a note for your team…"></textarea>':'')+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Close</button>'+
   (staff()?'<button class="btn primary" data-sheet-action="sf-post">Post comment</button>':'')+'</div>');
 }
 async function addComment(parent=null){
  if(!staff())throw Error('Read-only users cannot comment');
  const body=String($('#sfCommentText')?.value||'').trim(),address=ctx.state.selected;
  if(!body)throw Error('Enter a comment');
  await api('sheets/'+sheet().id+'/comments',{method:'POST',body:{address,body,parent_id:parent}});
  await openComments();ctx.notice('Comment saved');
 }
 async function history(append=false){
  if(!sheet())return;
  const address=append?historyAddress:ctx.state.selected;
  if(!append){historyOffset=0;historyAddress=address}
  const list=await api('sheets/'+sheet().id+'/history/'+address+'?offset='+historyOffset);
  historyOffset+=list.length;
  const rows=list.map(row=>
   '<article class="sf-revision"><div class="sf-comment-head"><strong>Revision '+e(row.revision)+'</strong><small>'+e(String(row.changed_at||'').slice(0,19).replace('T',' '))+'</small></div>'+
   '<p><span>Previous:</span> '+e(row.old_value??'(empty)')+'</p>'+
   '<p><span>Saved:</span> '+e(row.new_value??'')+'</p><small>By '+e(String(row.changed_by||'Unknown').slice(0,12))+'</small></article>').join('');
  if(!append){
   modal('<h2>Cell history · '+e(address)+'</h2><p>Recorded revisions are retained from the date auditing was enabled.</p>'+
    '<div id="sfHistoryRows" class="sf-history">'+(rows||'<p class="sf-empty">No audit entries for this cell.</p>')+'</div>'+
    '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Close</button>'+
    (list.length===100?'<button class="btn" data-sheet-action="sf-more-history">Older revisions</button>':'')+'</div>');
  }else{
   const target=$('#sfHistoryRows');if(target)target.insertAdjacentHTML('beforeend',rows);
   if(list.length<100)$('[data-sheet-action="sf-more-history"]')?.remove();
  }
 }
 function pivotRows(config){
  const F=ctx.F,calc=new F.FormulaEngine(ctx.state.cells,external),rows=new Map(),columns=new Set();
  const rowColumn=F.colIndex(config.rowColumn),colColumn=F.colIndex(config.columnColumn),valueColumn=F.colIndex(config.valueColumn);
  if(rowColumn<0||valueColumn<0)return {rows:[],columns:[]};
  let maxrow=0;for(const key of ctx.state.cells.keys())maxrow=Math.max(maxrow,F.coordinates(key)?.row||0);
  for(let n=(config.skipHeader!==false?1:0);n<=Math.min(9999,maxrow);n++){
   const label=String(calc.displayCell(F.address(n,rowColumn))||'(empty)');
   const column=colColumn>=0?String(calc.displayCell(F.address(n,colColumn))||'(empty)'):'Total';
   const v=Number(calc.displayCell(F.address(n,valueColumn)));
   if(label==='(empty)'&&column==='(empty)'&&(!Number.isFinite(v)||v===0))continue;
   const key=label+'∎'+column,entry=rows.get(key)||{row:label,column,count:0,sum:0,min:Infinity,max:-Infinity};
   entry.count++;if(Number.isFinite(v)){entry.sum+=v;entry.min=Math.min(entry.min,v);entry.max=Math.max(entry.max,v)}
   rows.set(key,entry);columns.add(column);
  }
  return {rows:[...rows.values()],columns:[...columns].sort().slice(0,20)};
 }
 function pivotValue(row,aggregation){
  return aggregation==='count'?row.count:aggregation==='average'?(row.count?row.sum/row.count:0):
   aggregation==='min'?(Number.isFinite(row.min)?row.min:0):
   aggregation==='max'?(Number.isFinite(row.max)?row.max:0):row.sum;
 }
 function pivotTable(cfg){
  const result=pivotRows(cfg),columns=result.columns;
  const rowNames=[...new Set(result.rows.map(x=>x.row))].sort().slice(0,200);
  const map=new Map(result.rows.map(x=>[x.row+'∎'+x.column,x]));
  const rowText=rowNames.map(label=>{
   const cells=columns.map(column=>pivotValue(map.get(label+'∎'+column)||{count:0,sum:0,min:Infinity,max:-Infinity},cfg.aggregate));
   return '<tr><th>'+e(label)+'</th>'+cells.map(n=>'<td>'+e(Number(n.toFixed(2)))+'</td>').join('')+
    '<td><strong>'+e(Number(cells.reduce((a,b)=>a+b,0).toFixed(2)))+'</strong></td></tr>';
  }).join('');
  return '<div class="card sf-pivot"><div class="sf-pivot-header"><strong>'+e(cfg.title)+'</strong><small>'+e(cfg.aggregate)+' by '+e(cfg.rowColumn)+(cfg.columnColumn?' & '+e(cfg.columnColumn):'')+'</small></div>'+
   '<div class="tablewrap"><table class="table"><thead><tr><th>'+e(cfg.rowColumn)+'</th>'+
   columns.map(c=>'<th>'+e(c)+'</th>').join('')+'<th>Total</th></tr></thead><tbody>'+rowText+'</tbody></table></div></div>';
 }
 function panels(){
  const pivots=sheet()?.pivot_configs||[];
  return pivots.length?'<section class="sf-pivot-section"><div class="sheet-section-title"><h2>Pivot tables</h2><span>Calculated from saved spreadsheet cells</span></div>'+
   '<div class="sf-pivot-grid">'+pivots.map(pivotTable).join('')+'</div></section>':'';
 }
 function pivotEditor(index=-1){
  if(!admin()){ctx.notice('Only administrators can create pivot definitions',true);return}
  const defs=sheet()?.pivot_configs||[];
  const def=index>=0?defs[index]:{id:uid(),title:'Performance by category',rowColumn:'A',columnColumn:'',valueColumn:'B',aggregate:'sum',skipHeader:true};
  if(!def)return;
  const fields=Array.from({length:26},(_,i)=>ctx.F.colName(i)),options=(selected,nullable=false)=>
   (nullable?'<option value="">No second dimension</option>':'')+fields.map(f=>'<option value="'+f+'"'+(f===selected?' selected':'')+'>'+f+'</option>').join('');
  modal('<h2>'+(index>=0?'Edit':'New')+' pivot table</h2><p>Group and summarize records with two dimensions and numerical aggregations.</p>'+
   '<div class="studio-chart-fields"><label>Title<input id="sfPivotTitle" class="select" value="'+e(def.title)+'" maxlength="80"></label>'+
   '<label>Group rows<select id="sfPivotRow" class="select">'+options(def.rowColumn)+'</select></label>'+
   '<label>Group columns<select id="sfPivotColumn" class="select">'+options(def.columnColumn,true)+'</select></label>'+
   '<label>Value column<select id="sfPivotValue" class="select">'+options(def.valueColumn)+'</select></label>'+
   '<label>Operation<select id="sfPivotAggregate" class="select">'+['sum','count','average','min','max'].map(x=>'<option value="'+x+'"'+(x===def.aggregate?' selected':'')+'>'+x+'</option>').join('')+'</select></label></div>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Cancel</button>'+
   (index>=0?'<button class="btn danger" data-sheet-action="sf-pivot-delete" data-index="'+index+'">Delete</button>':'')+
   '<button class="btn primary" data-sheet-action="sf-pivot-save" data-index="'+index+'">Save pivot</button></div>');
 }
 async function pivotSave(index){
  const rule={id:index>=0?sheet().pivot_configs[index].id:uid(),title:$('#sfPivotTitle').value.trim()||'Pivot summary',
   rowColumn:$('#sfPivotRow').value,columnColumn:$('#sfPivotColumn').value,valueColumn:$('#sfPivotValue').value,
   aggregate:$('#sfPivotAggregate').value,skipHeader:true};
  const list=[...(sheet().pivot_configs||[])];
  if(index>=0)list[index]=rule;else list.push(rule);
  await persist('pivot_configs',list);
 }
 function formattingEditor(){
  if(!admin())return;
  const defs=sheet()?.formatting_rules||[];
  modal('<h2>Conditional formatting</h2><p>Color cells automatically when a condition matches. Rules are shared with your team.</p>'+
   '<section class="sf-conditions">'+(defs.length?defs.map((r,i)=>
    '<div class="sf-rule"><div class="sf-swatch" style="background:'+e(r.background)+'"></div><span>'+e(r.range)+' · '+e(r.operator)+' '+e(r.value)+'</span>'+
    '<button class="btn small danger" data-sheet-action="sf-format-remove" data-index="'+i+'">Remove</button></div>').join(''):'<p class="sf-empty">No formatting rules</p>')+'</section>'+
   '<div class="studio-chart-fields"><label>Cell range<input id="sfFormatRange" class="select" value="A1:Z50"></label>'+
   '<label>Rule<select id="sfFormatOperator" class="select">'+['greater','less','equals','contains','between','empty','notEmpty'].map(x=>'<option value="'+x+'">'+x+'</option>').join('')+'</select></label>'+
   '<label>Value<input id="sfFormatValue" class="select" placeholder="Value to compare"></label>'+
   '<label>Maximum (between)<input id="sfFormatValue2" class="select"></label>'+
   '<label>Background color<input id="sfFormatBackground" type="color" value="#e4f9ed"></label>'+
   '<label>Text color<input id="sfFormatForeground" type="color" value="#173c2b"></label></div>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Close</button><button class="btn primary" data-sheet-action="sf-format-add">Add rule</button></div>');
 }
 async function addFormatting(){
  const range=String($('#sfFormatRange').value||'').trim().toUpperCase();
  if(!rangePattern.test(range))throw Error('Use a range such as A2:D100');
  const rule={id:uid(),range,operator:$('#sfFormatOperator').value,value:$('#sfFormatValue').value,
   value2:$('#sfFormatValue2').value,background:$('#sfFormatBackground').value,foreground:$('#sfFormatForeground').value};
  await persist('formatting_rules',[...(sheet().formatting_rules||[]),rule]);
  formattingEditor();
 }
 function protectionEditor(){
  if(!admin())return;
  const ranges=sheet()?.protected_ranges||[];
  modal('<h2>Protected cell ranges</h2><p>Only Owner and Admin can update protected cells. The database also rejects unauthorized writes.</p>'+
   '<section class="sf-conditions">'+(ranges.length?ranges.map((r,i)=>
    '<div class="sf-rule"><span>🔒 '+e(r.range)+' · '+e(r.description)+'</span>'+
    '<button class="btn small danger" data-sheet-action="sf-protect-remove" data-index="'+i+'">Unlock</button></div>').join(''):'<p class="sf-empty">No protected ranges</p>')+'</section>'+
   '<div class="studio-chart-fields"><label>Cell range<input id="sfProtectRange" class="select" placeholder="A1:D30"></label>'+
   '<label>Description<input id="sfProtectLabel" class="select" maxlength="160" placeholder="Finance approvals"></label></div>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Close</button><button class="btn primary" data-sheet-action="sf-protect-add">Protect range</button></div>');
 }
 async function addProtection(){
  const range=String($('#sfProtectRange').value||'').trim().toUpperCase();
  if(!rangePattern.test(range))throw Error('Use A1:D100 format');
  const label=String($('#sfProtectLabel').value||'Protected range').slice(0,160);
  await persist('protected_ranges',[...(sheet().protected_ranges||[]),{id:uid(),range,description:label}]);
  protectionEditor();
 }
 async function linkSheet(){
  if(!sheet())return;
  const all=await api('sheets');
  const allowed=all.filter(x=>x.id!==sheet().id);
  modal('<h2>Link another NexaBridge spreadsheet</h2>'+
   '<p>IMPORTRANGE works with permitted spreadsheets inside the same organization. You can insert the formula after linking.</p>'+
   '<label class="studio-input-label">Available sheets</label><select class="select" id="sfSourceSheet">'+allowed.map(x=>
   '<option value="'+e(x.id)+'">'+e(x.name)+'</option>').join('')+'</select>'+
   '<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Cancel</button>'+
   (allowed.length?'<button class="btn primary" data-sheet-action="sf-link-load">Link and copy formula</button>':'')+'</div>');
 }
 async function loadLinkedSheet(id){
  if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid sheet identifier');
  const data=await api('sheets/'+id);
  if(!data?.cells)throw Error('Linked sheet not found or access denied');
  external.set(id,new Map(data.cells.map(x=>[x.address,x])));
  ctx.paint();ctx.notice('Linked '+data.sheet.name+' · IMPORTRANGE available');
 }
 async function preloadLinks(){
  external.clear();
  if(!sheet())return;
  const ids=new Set();
  for(const cell of ctx.state.cells.values()){
   const raw=String(cell.raw_value||'');
   for(const match of raw.matchAll(/IMPORTRANGE\(\s*"([a-f0-9-]{36})"/gi))ids.add(match[1]);
  }
  for(const id of [...ids].slice(0,5)){
   try{const data=await api('sheets/'+id);if(data?.cells)external.set(id,new Map(data.cells.map(x=>[x.address,x])))}catch(_){}
  }
 }
 async function afterOpen(){
  comments=[];external.clear();
  if(!sheet())return;
  const id=sheet().id;
  try{
   const results=await api('sheets/'+id+'/comments');
   if(sheet()?.id===id){comments=results;ctx.paint()}
  }catch(_){}
  if(sheet()?.id===id)await preloadLinks();
 }
 function reset(){ctx=null;comments=[];external.clear();historyAddress='';historyOffset=0}
 async function action(name,el){
  switch(name){
   case 'sf-comments':await openComments();return true;
   case 'sf-post':await addComment();return true;
   case 'sf-reply':{const parent=el.dataset.id;const text=global.prompt('Reply to this comment');
    if(text?.trim()){await api('sheets/'+sheet().id+'/comments',{method:'POST',
      body:{address:ctx.state.selected,body:text.trim(),parent_id:parent}});await openComments()}return true}
   case 'sf-resolve':{await api('sheets/'+sheet().id+'/comments',{method:'PATCH',
      body:{id:el.dataset.id,resolved:el.dataset.resolved==='true'}});await openComments();return true}
   case 'sf-history':await history();return true;
   case 'sf-more-history':await history(true);return true;
   case 'sf-pivot':{
    if(admin())pivotEditor(-1);
    else modal('<h2>Pivot tables</h2>'+panels()+'<div class="studio-modal-foot"><button class="btn" data-sheet-action="dismiss">Close</button></div>');
    return true}
   case 'sf-pivot-save':await pivotSave(Number(el.dataset.index));return true;
   case 'sf-pivot-delete':{
    if(!admin())throw Error('Administrator access required');
    const list=(sheet().pivot_configs||[]).filter((_,i)=>i!==Number(el.dataset.index));
    await persist('pivot_configs',list);return true}
   case 'sf-format':formattingEditor();return true;
   case 'sf-format-add':await addFormatting();return true;
   case 'sf-format-remove':{
    const list=(sheet().formatting_rules||[]).filter((_,i)=>i!==Number(el.dataset.index));
    await persist('formatting_rules',list);formattingEditor();return true}
   case 'sf-protect':protectionEditor();return true;
   case 'sf-protect-add':await addProtection();return true;
   case 'sf-protect-remove':{
    const list=(sheet().protected_ranges||[]).filter((_,i)=>i!==Number(el.dataset.index));
    await persist('protected_ranges',list);protectionEditor();return true}
   case 'sf-link':await linkSheet();return true;
   case 'sf-link-load':{
    const id=$('#sfSourceSheet')?.value;
    if(!id)throw Error('Select an available sheet');
    await loadLinkedSheet(id);
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText('=IMPORTRANGE("'+id+'","A1:B10")');
    ctx.state.root.querySelector('.studio-modal-layer')?.remove();return true}
  }
  return false;
 }
 global.NexaSheetFeatures={bind(context){ctx=context},toolbar,banner,panels,cellDecoration,lock,afterOpen,reset,action,external:()=>external,preloadLinks};
})(window);
