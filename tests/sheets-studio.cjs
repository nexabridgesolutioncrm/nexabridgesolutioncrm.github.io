const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const formula=fs.readFileSync('crm-formulas.js','utf8');
const studio=fs.readFileSync('crm-sheet-studio.js','utf8');
const features=fs.readFileSync('crm-sheet-features.js','utf8');
const offline=fs.readFileSync('crm-sheet-offline.js','utf8');
const errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(String(error)));
const dom=new JSDOM('<!doctype html><html><body><div id="sheetApp"></div></body></html>',{
 url:'https://crm.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc
});
const win=dom.window,doc=win.document;
win.prompt=()=> 'Team Revenue Sheet';
win.confirm=()=>true;
let clipboard='';Object.defineProperty(win.navigator,'clipboard',{value:{writeText:async text=>{clipboard=text}}});
win.eval(formula);win.eval(features);win.eval(offline);win.eval(studio);
const F=win.NexaFormula;
assert.ok(F,'Formula engine is exposed');
const raw=new Map([['A1',{raw_value:'7'}],['A2',{raw_value:'13'}],['B1',{raw_value:'=SUM(A1:A2)'}],
 ['B2',{raw_value:'=IF(A2>10,"qualified","new")'}]]);
const engine=new F.FormulaEngine(raw);
assert.equal(engine.evaluateCell('B1'),20);
assert.equal(engine.evaluateCell('B2'),'qualified');
assert.equal(new F.FormulaEngine(new Map([['A1',{raw_value:'=B1'}],['B1',{raw_value:'=A1'}]])).evaluateCell('A1'),'#CYCLE!');
assert.equal(engine.evaluate('COUNTIF(A1:A2,">10")'),1);
assert.equal(engine.evaluate('SUMIF(A1:A2,">10")'),13);
assert.equal(engine.evaluate('VLOOKUP(7,A1:B2,2,FALSE)'),20);
assert.equal(engine.evaluate('SUMIFS(A1:A2,A1:A2,">8")'),13,'SUMIFS evaluates criteria');
assert.equal(engine.evaluate('COUNTIFS(A1:A2,">8")'),1,'COUNTIFS count');
assert.equal(engine.evaluate('XLOOKUP(13,A1:A2,B1:B2)'), 'qualified','XLOOKUP exact match');
assert.equal(engine.evaluate('INDEX(A1:A2,2)'),13,'INDEX picks rows');
assert.equal(engine.evaluate('MATCH(13,A1:A2,0)'),2,'MATCH returns matching index');
assert.equal(engine.evaluate('TEXTJOIN("-",TRUE,"North","South")'),'North-South');


 // Advanced formula operations on bounded arrays and approved linked-sheet maps.
 const advanced=new F.FormulaEngine(new Map([
  ['A1',{raw_value:'3'}],['A2',{raw_value:'7'}],
  ['B1',{raw_value:'=ARRAYFORMULA(A1:A2*2)'}],
  ['D1',{raw_value:'=QUERY(A1:A2,"select Col1 where Col1 > 3")'}]
 ]));
 assert.equal(advanced.displayCell('B1'),6,'ARRAYFORMULA first cell');
 assert.equal(advanced.displayCell('B2'),14,'ARRAYFORMULA spill');
 assert.equal(advanced.displayCell('D1'),7,'QUERY select and filter');
 const approved=new Map([['33333333-3333-4333-8333-333333333333',new Map([['A1',{raw_value:'4'}]])]]);
 assert.equal(new F.FormulaEngine(new Map(),approved).evaluate('IMPORTRANGE("33333333-3333-4333-8333-333333333333","A1")').values[0],4);
 assert.equal(new F.FormulaEngine(new Map()).evaluate('IMPORTRANGE("44444444-4444-4444-8444-444444444444","A1")'),'#LINK!','Unlinked ranges denied');

const uuid='11111111-1111-4111-8111-111111111111';
const sheets=[],cells=new Map(),calls=[],comments=[],revisions=[];
const clone=x=>JSON.parse(JSON.stringify(x));
async function api(path,options={}){
 const method=options.method||'GET',body=options.body||{};
 calls.push({path,method,body});
 if(path==='sheets'){
  if(method==='GET')return clone(sheets);
  if(method==='POST'){const sheet={id:uuid,name:body.name,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),charts:[],formatting_rules:[],pivot_configs:[],protected_ranges:[]};sheets.push(sheet);return clone(sheet)}
 }
 if(path==='sheets/'+uuid){
  if(method==='GET')return {sheet:clone(sheets[0]),cells:clone([...cells.values()])};
  if(method==='PATCH'){Object.assign(sheets[0],clone(body));return clone(sheets[0])}
  if(method==='DELETE'){sheets.splice(0,1);return {ok:true}}
 }
 if(path==='sheets/'+uuid+'/comments'){
  if(method==='GET')return clone(comments);
  if(method==='POST'){const record={id:'22222222-2222-4222-8222-'+String(comments.length+1).padStart(12,'0'),address:body.address,body:body.body,author_id:'u1',parent_id:body.parent_id||null,resolved:false,created_at:new Date().toISOString()};comments.push(record);return clone(record)}
  if(method==='PATCH'){const row=comments.find(x=>x.id===body.id);Object.assign(row,body);return clone(row)}
 }
 if(path.startsWith('sheets/'+uuid+'/history/'))return clone(revisions.filter(x=>x.address===path.split('/')[3]));
 if(path==='sheets/'+uuid+'/cell'&&method==='POST'){
  const old=cells.get(body.address),revision=old?.revision||0;
  if(revision!==body.revision)throw Error('Cell changed in another session');
  if(sheets[0]?.protected_ranges?.some(x=>x.range==='A1:A1')&&body.address==='A1'&&false)throw Error('Protected');
  const saved={address:body.address,raw_value:body.value,revision:revision+1,updated_by:'u1'};
  revisions.unshift({address:body.address,old_value:old?.raw_value||null,new_value:body.value,revision:revision+1,changed_by:'u1',changed_at:new Date().toISOString()});
  cells.set(body.address,saved);return clone(saved);
 }
 if(path==='sheets/'+uuid+'/bulk'&&method==='POST'){
  for(const c of body.cells){if(!cells.has(c.address))cells.set(c.address,{address:c.address,raw_value:c.value,revision:1})}
  return {attempted:body.cells.length,inserted:body.cells.length};
 }
 throw Error('Unknown test endpoint: '+method+' '+path);
}
const wait=async(fn,description)=>{for(let i=0;i<180;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,20))}throw Error('Timed out '+description)};
(async()=>{
 const root=doc.getElementById('sheetApp');
 await win.NexaSheetStudio.mount(root,api,{id:'u1',role:'owner',username:'owner@example.test'});
 assert.ok(root.querySelector('[data-sheet-action=new]'),'Create sheet action is present');
 root.querySelector('[data-sheet-action=new]').click();
 await wait(()=>root.querySelector('#studioGrid'),'new spreadsheet opens');
 assert.equal(sheets.length,1);
 const name=root.querySelector('#studioNameBox');
 assert.equal(name.textContent,'A1');
 let bar=root.querySelector('#studioFormulaBar');bar.value='7';root.querySelector('[data-sheet-action=save]').click();
 await wait(()=>cells.get('A1')?.raw_value==='7','A1 saved');
 root.querySelector('[data-sheet-address=B1]').click();
 bar=root.querySelector('#studioFormulaBar');bar.value='=A1*2';root.querySelector('[data-sheet-action=save]').click();
 await wait(()=>cells.get('B1')?.raw_value==='=A1*2','B1 formula saved');
 await wait(()=>root.querySelector('[data-sheet-address=B1]')?.textContent==='14','dependent formula recalculated');
 assert.equal(calls.filter(c=>c.path.endsWith('/cell')).length,2,'Cell saves use API');
 root.querySelector('[data-sheet-action=chart]').click();
 await wait(()=>root.querySelector('#studioChartTitle'),'chart editor opens');
 root.querySelector('#studioChartTitle').value='Revenue by region';
 root.querySelector('[data-sheet-action=saveChart]').click();
 await wait(()=>sheets[0].charts.length===1,'chart saved to Supabase mock');
 await wait(()=>root.querySelector('#sheetCharts')?.textContent.includes('Revenue by region'),'chart visible after async save');

 // Owner configures conditional formatting without changing source values.
 root.querySelector('[data-sheet-action="sf-format"]').click();
 await wait(()=>root.querySelector('#sfFormatRange'),'conditional formatting dialog');
 root.querySelector('#sfFormatRange').value='A1:A1';
 root.querySelector('#sfFormatOperator').value='greater';
 root.querySelector('#sfFormatValue').value='5';
 root.querySelector('[data-sheet-action="sf-format-add"]').click();
 await wait(()=>sheets[0].formatting_rules.length===1,'formatting rule persisted');
 await wait(()=>root.querySelector('[data-sheet-address=A1]')?.getAttribute('style')?.includes('background:'),'rule applied to cell');
 root.querySelector('[data-sheet-action=dismiss]').click();
 // Protected cells are stored on sheet metadata and visibly indicated.
 root.querySelector('[data-sheet-action="sf-protect"]').click();
 await wait(()=>root.querySelector('#sfProtectRange'),'protected range dialog');
 root.querySelector('#sfProtectRange').value='A1:A1';
 root.querySelector('#sfProtectLabel').value='Approvals only';
 root.querySelector('[data-sheet-action="sf-protect-add"]').click();
 await wait(()=>sheets[0].protected_ranges.length===1,'range lock persisted');
 root.querySelector('[data-sheet-action=dismiss]').click();
 // A real two-dimensional pivot configuration is stored and rendered from cells.
 root.querySelector('[data-sheet-action="sf-pivot"]').click();
 await wait(()=>root.querySelector('#sfPivotTitle'),'pivot editor');
 root.querySelector('#sfPivotTitle').value='Pipeline grouped report';
 root.querySelector('#sfPivotRow').value='A';
 root.querySelector('#sfPivotValue').value='B';
 root.querySelector('[data-sheet-action="sf-pivot-save"]').click();
 await wait(()=>sheets[0].pivot_configs.length===1,'pivot metadata saved');
 await wait(()=>root.querySelector('.sf-pivot'),'Pivot table generated after async persistence');
 // Threaded cell comments and audit history load via scoped API.
 root.querySelector('[data-sheet-address=A1]').click();
 root.querySelector('[data-sheet-action="sf-comments"]').click();
 await wait(()=>root.querySelector('#sfCommentText'),'comment editor');
 root.querySelector('#sfCommentText').value='Call lead after five';
 root.querySelector('[data-sheet-action="sf-post"]').click();
 await wait(()=>comments.length===1,'comment stored');
 await wait(()=>root.querySelector('.sf-comment')?.textContent.includes('Call lead after five'),'comment rendered');
 root.querySelector('[data-sheet-action=dismiss]').click();
 assert.ok(root.querySelector('[data-sheet-address=A1]')?.classList.contains('commented-cell'),'Cell displays a comment marker');
 root.querySelector('[data-sheet-action="sf-history"]').click();
 await wait(()=>root.querySelector('.sf-revision'),'audit history rendered');
 assert.ok(root.querySelector('.sf-revision').textContent.includes('Revision 1'));
 root.querySelector('[data-sheet-action=dismiss]').click();

 
 // Multi-cell paste and copy ranges preserve the real cell write path.
 root.querySelector('[data-sheet-action=pasteCells]').click();
 await wait(()=>root.querySelector('#studioPasteData'),'TSV paste editor');
 root.querySelector('#studioPasteStart').value='A4';
 root.querySelector('#studioPasteData').value='North\t120\nSouth\t250';
 root.querySelector('[data-sheet-action=pasteSave]').click();
 await wait(()=>cells.get('B5')?.raw_value==='250','TSV paste saved four cells');
 await wait(()=>root.querySelector('[data-sheet-address=A4]')?.textContent==='North','pasted row visible');
 root.querySelector('[data-sheet-address=A4]').click();
 root.querySelector('[data-sheet-address=B5]').dispatchEvent(new win.MouseEvent('click',{bubbles:true,shiftKey:true}));
 assert.equal(root.querySelectorAll('.sheet-studio-cell.range-selected').length,4,'Rectangular range selected');
 root.querySelector('[data-sheet-action=copyCells]').click();
 await wait(()=>clipboard.includes('South\t250'),'TSV range copied to clipboard');
 assert.match(clipboard,/North\t120/);

 // Simulate another editor saving the same cell before our current revision.
 const otherRow=cells.get('A1');cells.set('A1',{...otherRow,raw_value:'Updated remotely',revision:otherRow.revision+1});
 root.querySelector('[data-sheet-address=A1]').click();
 const conflictInput=root.querySelector('#studioFormulaBar');
 conflictInput.value='My unsaved calculation';
 root.querySelector('[data-sheet-action=save]').click();
 await wait(()=>root.querySelector('#studioConflictDraft'),'revision conflict recovery');
 assert.equal(root.querySelector('#studioConflictDraft').value,'My unsaved calculation',
   'An optimistic concurrency conflict preserves the local text');
 assert.equal(cells.get('A1').raw_value,'Updated remotely','Remote revision is not overwritten');
 root.querySelector('[data-sheet-action=copyDraft]').click();
 await wait(()=>clipboard==='My unsaved calculation','rejected edit copied');
 root.querySelector('[data-sheet-action=dismiss]').click();

 root.querySelector('[data-sheet-action=back]').click();
 await wait(()=>root.querySelector('[data-sheet-action=new]'),'return to sheet library');
 assert.ok(root.textContent.includes('Team Revenue Sheet'),'saved workbook in library');
 win.NexaSheetStudio.leave();
 // The same browser may be used by another employee: cached sheets/cell edit state must not leak.
 const viewerRoot=doc.createElement('div');doc.body.appendChild(viewerRoot);
 const readCountBefore=calls.filter(x=>x.path==='sheets'&&x.method==='GET').length;
 await win.NexaSheetStudio.mount(viewerRoot,api,{id:'viewer-2',role:'viewer',username:'viewer@example.test'});
 assert.ok(calls.filter(x=>x.path==='sheets'&&x.method==='GET').length>readCountBefore,
   'New user must fetch the sheet library instead of using previous session cache');
 assert.equal(viewerRoot.querySelector('[data-sheet-action=new]'),null,'Viewer cannot create spreadsheets');
 assert.equal(viewerRoot.querySelector('[data-sheet-action=import]'),null,'Viewer cannot import files');
 viewerRoot.querySelector('[data-sheet-action=open]').click();
 await wait(()=>viewerRoot.querySelector('#studioGrid'),'Viewer opens existing sheet');
 assert.equal(viewerRoot.querySelector('#studioFormulaBar').readOnly,true,'Viewer formula bar is read-only');
 assert.equal(viewerRoot.querySelector('[data-sheet-action=save]'),null,'Viewer cannot save cells');
 assert.equal(viewerRoot.querySelector('[data-sheet-action=pasteCells]'),null,'Viewer cannot bulk paste');
 assert.equal(viewerRoot.querySelector('[data-sheet-action=chart]'),null,'Viewer cannot create charts');
 assert.ok(viewerRoot.querySelector('[data-sheet-address=A1]').classList.contains('protected-cell'),'Viewer sees protected range');
 const writesBefore=calls.filter(x=>x.path.endsWith('/cell')).length;
 viewerRoot.querySelector('[data-sheet-address=A1]').dispatchEvent(new win.MouseEvent('dblclick',{bubbles:true}));
 assert.equal(viewerRoot.querySelector('.studio-in-cell-editor'),null,'Viewer cannot inline-edit a cell');
 const forged=doc.createElement('button');forged.dataset.sheetAction='save';viewerRoot.appendChild(forged);forged.click();
 await new Promise(resolve=>setTimeout(resolve,40));
 assert.equal(calls.filter(x=>x.path.endsWith('/cell')).length,writesBefore,'Forged save action cannot write as Viewer');
 win.NexaSheetStudio.leave();
 assert.equal(errors.length,0,'No DOM script errors: '+errors.join('\n'));
 console.log('PASS Sheets Studio — common formulas, circular refs, sheet create/open, cell version saves, chart editor, multi-cell TSV paste, range copy and back navigation');
 dom.window.close();
})().catch(e=>{console.error(e);if(errors.length)console.error(errors);win.NexaSheetStudio.leave();dom.window.close();process.exitCode=1});
