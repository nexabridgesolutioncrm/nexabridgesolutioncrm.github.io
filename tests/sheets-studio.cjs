const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const formula=fs.readFileSync('crm-formulas.js','utf8');
const studio=fs.readFileSync('crm-sheet-studio.js','utf8');
const errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(String(error)));
const dom=new JSDOM('<!doctype html><html><body><div id="sheetApp"></div></body></html>',{
 url:'https://crm.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc
});
const win=dom.window,doc=win.document;
win.prompt=()=> 'Team Revenue Sheet';
win.confirm=()=>true;
win.eval(formula);win.eval(studio);
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
const uuid='11111111-1111-4111-8111-111111111111';
const sheets=[],cells=new Map(),calls=[];
const clone=x=>JSON.parse(JSON.stringify(x));
async function api(path,options={}){
 const method=options.method||'GET',body=options.body||{};
 calls.push({path,method,body});
 if(path==='sheets'){
  if(method==='GET')return clone(sheets);
  if(method==='POST'){const sheet={id:uuid,name:body.name,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),charts:[]};sheets.push(sheet);return clone(sheet)}
 }
 if(path==='sheets/'+uuid){
  if(method==='GET')return {sheet:clone(sheets[0]),cells:clone([...cells.values()])};
  if(method==='PATCH'){sheets[0].charts=clone(body.charts);return clone(sheets[0])}
  if(method==='DELETE'){sheets.splice(0,1);return {ok:true}}
 }
 if(path==='sheets/'+uuid+'/cell'&&method==='POST'){
  const old=cells.get(body.address),revision=old?.revision||0;
  if(revision!==body.revision)throw Error('Cell changed in another session');
  const saved={address:body.address,raw_value:body.value,revision:revision+1,updated_by:'u1'};
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
 root.querySelector('[data-sheet-action=back]').click();
 await wait(()=>root.querySelector('[data-sheet-action=new]'),'return to sheet library');
 assert.ok(root.textContent.includes('Team Revenue Sheet'),'saved workbook in library');
 win.NexaSheetStudio.leave();
 assert.equal(errors.length,0,'No DOM script errors: '+errors.join('\n'));
 console.log('PASS Sheets Studio — common formulas, circular refs, sheet create/open, cell version saves, chart editor and back navigation');
 dom.window.close();
})().catch(e=>{console.error(e);if(errors.length)console.error(errors);win.NexaSheetStudio.leave();dom.window.close();process.exitCode=1});
