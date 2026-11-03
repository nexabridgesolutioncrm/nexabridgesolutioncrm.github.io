/* NexaBridge CRM v3. Data operations use the existing authenticated Supabase transport. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US').format(Number(n)||0), dollars=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
const day=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const localInputDateTime=v=>{if(!v)return '';const d=new Date(v);if(isNaN(d))return String(v).slice(0,16);const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())};
const utcDateTime=v=>v?new Date(v).toISOString():'';
const date=v=>{if(!v)return '—';const d=new Date(String(v).length===10?v+'T12:00:00':v);return isNaN(d)?E(v):new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(d)};
const C={
 leads:{title:'Leads',one:'Lead',desc:'Prospects, follow-ups and communication',key:'name',status:'status',statuses:['new','contacted','qualified','converted','closed'],columns:['name','company','phone','email','status','followup','owner','source','interest','notes'],fields:[['name','Lead name','text',1],['company','Company'],['phone','Phone','tel'],['email','Email','email'],['source','Source','choice:website|google|social|referral|direct|event|other'],['interest','Service interest'],['status','Status','choice:new|contacted|qualified|converted|closed'],['followup','Follow-up date','date'],['owner','Assigned to'],['notes','Notes','textarea']]},
 clients:{title:'Clients',one:'Client',desc:'Customer accounts and relationships',key:'name',columns:['name','contact','phone','email','industry','notes'],fields:[['name','Client name','text',1],['contact','Contact person'],['phone','Phone','tel'],['email','Email','email'],['industry','Industry'],['notes','Notes','textarea']]},
 deals:{title:'Deals',one:'Deal',desc:'Sales pipeline and revenue opportunities',key:'title',status:'stage',statuses:['new','qualified','proposal','negotiation','won','lost'],columns:['title','value','stage','clientId','leadId','service','closeDate','notes'],fields:[['title','Deal title','text',1],['value','Value (USD)','number',1],['stage','Stage','choice:new|qualified|proposal|negotiation|won|lost'],['clientId','Client','rel:clients'],['leadId','Lead','rel:leads'],['service','Service'],['closeDate','Close date','date'],['notes','Notes','textarea']]},
 tasks:{title:'Tasks',one:'Task',desc:'Actions, deadlines and progress',key:'title',status:'status',statuses:['open','done'],columns:['title','status','dueDate','priority','linkedRef','notes'],fields:[['title','Task title','text',1],['dueDate','Due date','date'],['priority','Priority','choice:low|medium|high'],['status','Status','choice:open|done'],['linkedRef','Related to','rel:any'],['notes','Notes','textarea']]},
 jobs:{title:'Jobs',one:'Job',desc:'Service orders and delivery',key:'title',status:'status',statuses:['new','scheduled','dispatched','in_progress','completed','cancelled'],columns:['title','service','clientId','leadId','status','assignedTo','scheduledStart','priority'],fields:[['title','Job title','text',1],['service','Service'],['clientId','Client','rel:clients'],['leadId','Lead','rel:leads'],['address','Address'],['scheduledStart','Scheduled start','datetime-local'],['scheduledEnd','Scheduled end','datetime-local'],['assignedTo','Assigned to'],['status','Job status','choice:new|scheduled|dispatched|in_progress|completed|cancelled'],['priority','Priority','choice:low|normal|high|urgent'],['notes','Notes','textarea']]},
 documents:{title:'Documents',one:'Document',desc:'Estimates and invoices',key:'number',status:'status',statuses:['draft','sent','paid','void'],columns:['number','docType','billToName','amount','status','issueDate','dueDate'],fields:[['number','Document number','text',1],['docType','Type','choice:invoice|estimate'],['billToName','Bill to'],['billToEmail','Billing email','email'],['amount','Amount','number'],['status','Status','choice:draft|sent|accepted|paid|void'],['issueDate','Issue date','date'],['dueDate','Due date','date'],['description','Description','textarea'],['notes','Notes','textarea']]},
 calendar:{title:'Calendar',one:'Event',desc:'Meetings and scheduled activities',key:'title',columns:['title','eventType','startAt','endAt','location','description'],fields:[['title','Event title','text',1],['eventType','Event type','choice:meeting|appointment|followup|deadline|internal'],['startAt','Starts','datetime-local',1],['endAt','Ends','datetime-local',1],['location','Location'],['description','Description','textarea']]},
 projects:{title:'Projects',one:'Project',desc:'Delivery plans and budgets',key:'title',status:'status',columns:['title','clientId','status','budget','startDate','dueDate'],fields:[['title','Project name','text',1],['clientId','Client','rel:clients'],['description','Description','textarea'],['startDate','Start date','date'],['dueDate','Due date','date'],['budget','Budget','number'],['status','Status','choice:planned|active|completed|on_hold|cancelled']]},
 contracts:{title:'Contracts',one:'Contract',desc:'Customer agreements',key:'title',status:'status',columns:['title','clientId','status','value','startDate','dueDate'],fields:[['title','Contract title','text',1],['clientId','Client','rel:clients'],['description','Description','textarea'],['startDate','Start date','date'],['dueDate','End date','date'],['value','Value','number'],['status','Status','choice:draft|active|expired|cancelled']]},
 expenses:{title:'Expenses',one:'Expense',desc:'Business expenditure',key:'title',status:'status',columns:['title','category','amount','expenseDate','status'],fields:[['title','Expense title','text',1],['projectId','Project','rel:projects'],['category','Category'],['expenseDate','Expense date','date'],['amount','Amount','number'],['status','Status','choice:recorded|approved|paid'],['notes','Notes','textarea']]}
};
const NAV=[['dashboard','Dashboard','▦'],['leads','Leads','♧'],['clients','Clients','♧'],['deals','Sales pipeline','◇'],['tasks','Tasks','☑'],['jobs','Jobs','▤'],['calendar','Calendar','▦'],['documents','Documents','▣'],['projects','Projects','▤'],['contracts','Contracts','▣'],['expenses','Expenses','＄'],['reports','Reports','▥']];
const S={user:null,data:null,page:'dashboard',detail:null,search:'',status:'all',sort:'',descending:false,offset:0,selected:new Set(),editCell:null,hidden:{},history:[],redo:[],filters:[],range:null,density:'normal',frozen:false,mode:'table',loading:false,toast:null,importRows:[],importKind:null};
try{S.theme=localStorage.getItem('nexa-v3-theme')||'light';S.mode=localStorage.getItem('nexa-v3-gridmode')||'table';S.hidden=JSON.parse(localStorage.getItem('nexa-v3-hidden')||'{}');S.density=localStorage.getItem('nexa-v3-density')==='compact'?'compact':'normal';S.frozen=localStorage.getItem('nexa-v3-frozen')==='true'}catch(_){S.theme='light'}
document.body.classList.toggle('dark',S.theme==='dark');
const API=async(path,opts={})=>{const res=await fetch('/api/'+path,{method:opts.method||'GET',credentials:'same-origin',headers:opts.body!==undefined?{'Content-Type':'application/json'}:{},body:opts.body===undefined?undefined:JSON.stringify(opts.body)});let body=await res.json().catch(()=>({}));if(!res.ok){if(res.status===401&&path!=='me'&&path!=='login'){S.user=null;S.data=null;loginPage()}throw Error(body.detail||body.message||'Request failed ('+res.status+')')}return body};
function tip(msg,bad=false){$('#toast')?.remove();const el=document.createElement('div');el.id='toast';el.className='toast'+(bad?' error':'');el.textContent=msg;document.body.appendChild(el);setTimeout(()=>{if(el.isConnected)el.remove()},4500)}
function fieldInfo(k,f){return (C[k]?.fields||[]).find(x=>x[0]===f)||[f,f.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase()),'text']}
function cols(){const c=C[S.page];return c.columns.filter(f=>!S.hidden[S.page]?.includes(f))}
function label(k,f){return fieldInfo(k,f)[1]}
function fieldValue(k,r,f){if(f==='linkedRef')return r.linkedType&&r.linkedId?(S.data[r.linkedType+'s']||[]).find(x=>x.id===r.linkedId)?.name||(S.data[r.linkedType+'s']||[]).find(x=>x.id===r.linkedId)?.title||'—':'—';if(/Id$/.test(f)&&f!=='id'){let group=f.slice(0,-2).toLowerCase();if(group==='project')group='projects';else group+='s';return S.data[group]?.find(x=>String(x.id)===String(r[f]))?.name||S.data[group]?.find(x=>String(x.id)===String(r[f]))?.title||'—'}return r[f]??''}
function sortRows(rows){const f=S.sort;if(!f)return rows;const mod=S.descending?-1:1;return rows.sort((a,b)=>{const x=fieldValue(S.page,a,f),y=fieldValue(S.page,b,f);if(x==null||x==='')return 1;if(y==null||y==='')return -1;return mod*(typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true,sensitivity:'base'}))})}
function filterMatches(row,rule){
 const original=fieldValue(S.page,row,rule.field);
 const value=String(original??'').toLocaleLowerCase(),target=String(rule.value??'').toLocaleLowerCase();
 switch(rule.operator){
  case 'contains':return value.includes(target);
  case 'notContains':return !value.includes(target);
  case 'equals':return value===target;
  case 'notEquals':return value!==target;
  case 'starts':return value.startsWith(target);
  case 'ends':return value.endsWith(target);
  case 'gt':return value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)>Number(target);
  case 'lt':return value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)<Number(target);
  case 'empty':return original==null||String(original).trim()==='';
  case 'notEmpty':return original!=null&&String(original).trim()!=='';
  default:return true;
 }
}
function filtered(){
 const raw=[...(S.data?.[S.page]||[])],q=S.search.toLocaleLowerCase().trim();
 return sortRows(raw.filter(r=>(S.status==='all'||r[C[S.page]?.status]===S.status)&&
  (!q||Object.values(r).some(x=>String(x??'').toLocaleLowerCase().includes(q)))&&
  S.filters.every(rule=>filterMatches(r,rule))));
}
function filterModal(){
 const fields=C[S.page].fields.map(([f,name])=>[f,name]),ops=[
  ['contains','Contains'],['notContains','Does not contain'],['equals','Equals'],['notEquals','Not equal'],
  ['starts','Starts with'],['ends','Ends with'],['gt','Greater than (number)'],['lt','Less than (number)'],
  ['empty','Is empty'],['notEmpty','Is not empty']
 ];
 modal('Advanced column filter','<p class="card-sub">Combine column conditions. Filters apply before sorting, copying and exporting.</p>'+
  '<div class="formgrid"><div class="field"><label>Column</label><select class="select" id="advField">'+fields.map(([f,name])=>'<option value="'+E(f)+'">'+E(name)+'</option>').join('')+'</select></div>'+
  '<div class="field"><label>Condition</label><select class="select" id="advOp">'+ops.map(([op,name])=>'<option value="'+op+'">'+name+'</option>').join('')+'</select></div>'+
  '<div class="field span"><label>Value (leave blank for empty checks)</label><input id="advValue" class="select" maxlength="250" placeholder="Filter value"></div></div>'+
  '<p class="formhint">All conditions must match. This changes the view only, not the saved CRM records.</p>',
  '<button class="btn" data-action="close">Cancel</button><button class="btn primary" data-action="filterApply">Add filter</button>');
}
function applyFilter(){
 const field=$('#advField')?.value,operator=$('#advOp')?.value,value=$('#advValue')?.value||'';
 if(!C[S.page].fields.some(x=>x[0]===field))throw Error('Invalid column');
 if(!['empty','notEmpty'].includes(operator)&&!value.trim())throw Error('Enter a filter value');
 if(['gt','lt'].includes(operator)&&!Number.isFinite(Number(value)))throw Error('A valid number is required');
 if(S.filters.length>=8)throw Error('You may combine up to 8 column filters');
 S.filters.push({field,operator,value:value.trim()});S.offset=0;S.selected.clear();
 $('#dialog').close();render();
}
function sheetSummary(){
 const rows=S.selected.size?filtered().filter(x=>S.selected.has(x.id)):filtered();
 const numeric=C[S.page].fields.filter(x=>x[2]==='number').map(x=>[x[0],x[1]]);
 const stats=numeric.slice(0,3).map(([f,name])=>{
  const nums=rows.map(x=>Number(x[f])).filter(x=>Number.isFinite(x));
  const sum=nums.reduce((n,x)=>n+x,0),avg=nums.length?sum/nums.length:0;
  return '<div class="sheet-metric"><span>'+E(name)+'</span><strong>'+dollars(sum)+'</strong><small>SUM · AVG '+dollars(avg)+' · MIN '+dollars(nums.length?Math.min(...nums):0)+' · MAX '+dollars(nums.length?Math.max(...nums):0)+'</small></div>';
 }).join('');
 return '<section class="sheet-calculations" aria-label="Spreadsheet calculations"><div class="sheet-metric"><span>'+(S.selected.size?'Selected':'Filtered')+' rows</span><strong>'+fmt(rows.length)+'</strong><small>COUNT of records</small></div>'+stats+'</section>';
}
function filterChips(){
 if(!S.filters.length)return '';
 return '<div class="sheet-filter-chips" aria-label="Active filters">'+S.filters.map((r,i)=>
  '<button type="button" class="sheet-filter-chip" data-action="filterRemove" data-index="'+i+'" title="Remove this filter">'+E(label(S.page,r.field))+' · '+E(r.operator)+' '+E(r.value)+' ×</button>').join('')+
  '<button type="button" class="btn small" data-action="filterClear">Clear filters</button></div>';
}
function isManager(){return ['owner','admin'].includes(S.user?.role)}

function globalResults(q){
 const box=$('#searchHits');if(!box)return;const term=String(q||'').trim().toLowerCase();
 if(!term){box.hidden=true;box.innerHTML='';return}
 const results=[];for(const k of Object.keys(C))for(const r of S.data?.[k]||[]){
  const text=[r.name,r.title,r.company,r.email,r.phone,r.number,r.contact,r.billToName].filter(Boolean).join(' ').toLowerCase();
  if(text.includes(term)){results.push({k,id:r.id,title:r[C[k].key]||r.name||r.title||r.number||'Record',sub:r.company||r.email||C[k].title});if(results.length>=12)break}
  if(results.length>=12)break;
 }
 box.hidden=false;
 box.innerHTML=results.length?results.map(x=>'<button type="button" data-action="open" data-kind="'+E(x.k)+'" data-id="'+E(x.id)+'"><strong>'+E(x.title)+'</strong><small>'+E(C[x.k].title)+' · '+E(x.sub)+'</small></button>').join(''):'<div class="search-none">No records found</div>';
}

function icon(n){const shapes={dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',leads:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',clients:'<circle cx="9" cy="8" r="3"/><path d="M2 20a7 7 0 0 1 14 0"/>',deals:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',tasks:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',jobs:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',documents:'<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h7m-7 4h7"/>',reports:'<path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M3 20h18"/>'};return '<svg aria-hidden="true" viewBox="0 0 24 24">'+(shapes[n]||shapes.documents)+'</svg>'}
function logo(){return '<div class="brand"><div class="logo">N</div><div><strong>NexaBridge</strong><small>SOLUTIONS CRM</small></div></div>'}
function loginPage(message=''){document.getElementById('app').innerHTML='<div class="loginwrap"><div class="loginbox">'+logo()+'<h1>Sign in to your workspace</h1><p>Secure CRM for NexaBridge Solutions</p>'+(message?'<div class="notice error">'+E(message)+'</div>':'')+'<form id="loginForm"><div class="field"><label for="email">Email address</label><input id="email" name="username" type="email" autocomplete="username" required></div><div class="field"><label for="pwd">Password</label><input id="pwd" name="password" type="password" autocomplete="current-password" required></div><button type="submit" class="btn primary">Sign in</button></form></div></div>'}
function shell(){document.getElementById('app').innerHTML='<div class="layout"><aside class="sidebar" id="sidebar">'+logo()+'<div class="sidecap">Workspace</div><nav class="nav">'+NAV.map(([k,v])=>'<button class="navbtn" data-action="page" data-page="'+k+'">'+icon(k)+'<span>'+E(v)+'</span>'+(k==='tasks'&&dueTasks()?'<span class="count">'+fmt(dueTasks())+'</span>':'')+'</button>').join('')+'</nav><div class="sidefooter"><strong><span class="dot"></span>Connected to Supabase</strong>'+E(S.user?.username||'')+'<div style="margin-top:10px"><a href="legacy.html" target="_blank" rel="noopener" style="color:#bfaaff">Advanced tools ↗</a></div></div></aside><div class="workspace"><header class="topbar"><div style="display:flex;align-items:center;gap:11px"><button class="iconbtn mobile-toggle" data-action="menu" aria-label="Open navigation">☰</button><div><h2 id="topTitle"></h2><p>NexaBridge Solutions · Secure workspace</p></div></div><div class="top-actions"><div class="top-search-wrap"><label class="top-search">⌕ <input type="search" id="globalSearch" placeholder="Search this workspace" aria-label="Search records"></label><div class="search-results hidden" id="searchHits"></div></div><button class="iconbtn" data-action="refresh" title="Refresh data" aria-label="Refresh data">↻</button><button class="iconbtn" data-action="theme" title="Toggle dark mode" aria-label="Toggle dark mode">'+(S.theme==='dark'?'☀':'☾')+'</button><button class="iconbtn signout" data-action="logout">Sign out</button></div></header><main id="main" class="main"></main></div></div>';render()}
function render(){if(!S.user||!S.data)return loginPage();$$('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.page===S.page));const label=S.page==='dashboard'?'Dashboard':S.page==='reports'?'Reports':C[S.page]?.title||'Workspace';$('#topTitle').textContent=label;if(S.detail&&C[S.page])detailPage();else if(S.page==='dashboard')dashboard();else if(S.page==='reports')reports();else if(C[S.page]){if(S.mode==='board'&&C[S.page].statuses&&['leads','deals','tasks','jobs'].includes(S.page))boardPage();else tablePage()}else $('#main').innerHTML='<div class="notice">This module is available in Advanced tools.</div>'}
function page(k){S.page=k;S.detail=null;S.search='';S.status='all';S.sort='';S.descending=false;S.offset=0;S.selected.clear();S.filters=[];S.range=null;render();window.scrollTo({top:0,behavior:'instant'});$('#sidebar')?.classList.remove('open')}
function total(k){return(S.data?.[k]||[]).length}
function dueTasks(){return(S.data?.tasks||[]).filter(x=>x.status!=='done'&&x.dueDate&&x.dueDate<=day()).length}
function kpi(t,v,s,tone){return '<div class="card kpi '+tone+'"><div class="title">'+t+'</div><div class="value">'+v+'</div><div class="sub">'+s+'</div></div>'}
function head(t,d,buttons){return '<header class="heading"><div><h1>'+E(t)+'</h1><p>'+E(d)+'</p></div><div class="actions">'+(buttons||'')+'</div></header>'}
function dashboard(){const lead=S.data.leads||[],deals=S.data.deals||[],tasks=S.data.tasks||[],clients=S.data.clients||[],recent=[...lead].slice(0,6);const pipeline=deals.filter(x=>!['won','lost'].includes(x.stage));const stages=['new','qualified','proposal','negotiation','won','lost'];const counts=stages.map(x=>deals.filter(d=>d.stage===x).length),max=Math.max(1,...counts);
$('#main').innerHTML='<section class="hero"><div><h1>Welcome to NexaBridge CRM</h1><p>Your customers, sales and next steps in one reliable workspace.</p></div><div class="actions"><button class="btn primary" data-action="new" data-kind="leads">＋ New lead</button><button class="btn" data-action="new" data-kind="clients">＋ New client</button></div></section>'+
'<div class="grid kpis">'+kpi('Active leads',lead.filter(x=>!['closed','converted'].includes(x.status)).length,'Prospects to follow up','violet')+kpi('Clients',clients.length,'Customer accounts','mint')+kpi('Open opportunities',pipeline.length,dollars(pipeline.reduce((n,x)=>n+Number(x.value||0),0))+' potential','sky')+kpi('Tasks due',dueTasks(),'Overdue or due today','amber')+'</div>'+
'<div class="two"><section class="card pad"><h3>Pipeline overview</h3><div class="stack">'+stages.map((x,i)=>'<div class="panelrow"><span style="width:100px;font-size:12px;text-transform:capitalize">'+E(x)+'</span><div class="progressline"><span style="width:'+(counts[i]/max*100)+'%"></span></div><strong>'+fmt(counts[i])+'</strong></div>').join('')+'</div></section><section class="card pad"><h3>Next actions</h3>'+
(tasks.length?tasks.filter(x=>x.status!=='done').sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))).slice(0,6).map(x=>'<div class="panelrow"><div><strong>'+E(x.title)+'</strong><small>'+date(x.dueDate)+'</small></div><button class="btn small" data-action="open" data-kind="tasks" data-id="'+E(x.id)+'">Open</button></div>').join(''):'<div class="empty"><b>No open tasks yet</b><p>Create a task to track your next action.</p><button class="btn primary" data-action="new" data-kind="tasks">New task</button></div>')+'</section></div>'+
'<section class="card pad" style="margin-top:18px"><div class="heading" style="margin-bottom:8px"><h3 style="margin:0">Recent leads</h3><button class="btn small" data-action="page" data-page="leads">View all leads</button></div>'+(recent.length?recent.map(x=>'<div class="panelrow"><div><strong>'+E(x.name)+'</strong><small>'+E(x.company||x.email||'')+'</small></div><button class="btn small" data-action="open" data-kind="leads" data-id="'+E(x.id)+'">Open record</button></div>').join(''):'<div class="empty">No leads added yet.</div>')+'</section>'}
function reports(){const leads=S.data.leads||[],deals=S.data.deals||[],jobs=S.data.jobs||[],tasks=S.data.tasks||[];const won=deals.filter(x=>x.stage==='won'),all=leads.length,converted=leads.filter(x=>x.status==='converted').length;
$('#main').innerHTML=head('Reports','Live figures from your CRM records','<button class="btn" data-action="refresh">↻ Refresh</button>')+'<div class="grid kpis">'+kpi('Revenue won',dollars(won.reduce((n,x)=>n+Number(x.value||0),0)),'Won deals','mint')+kpi('Lead conversion',all?Math.round(converted/all*100)+'%':'0%','Converted leads','sky')+kpi('Open jobs',jobs.filter(x=>!['completed','cancelled'].includes(x.status)).length,'Active service orders','violet')+kpi('Tasks completed',tasks.filter(x=>x.status==='done').length,'Of '+tasks.length+' total','amber')+'</div><div class="two"><section class="card pad"><h3>Lead source distribution</h3>'+barList(leads,'source')+'</section><section class="card pad"><h3>Sales stage distribution</h3>'+barList(deals,'stage')+'</section></div>'}
function barList(rows,field){const group=Object.entries(rows.reduce((a,x)=>(a[x[field]||'unspecified']=(a[x[field]||'unspecified']||0)+1,a),{}));const high=Math.max(1,...group.map(x=>x[1]));return group.length?group.map(([name,n])=>'<div class="panelrow"><span style="width:100px;font-size:12px">'+E(name)+'</span><div class="progressline"><span style="width:'+(n/high*100)+'%"></span></div><b>'+fmt(n)+'</b></div>').join(''):'<div class="empty">No records yet.</div>'}
function tablePage(){const c=C[S.page],rows=filtered(),shown=cols(),pageRows=rows.slice(S.offset,S.offset+50);const selectedCount=S.selected.size;const statuses=c.statuses||[...new Set((S.data[S.page]||[]).map(x=>x[c.status]).filter(Boolean))];
$('#main').innerHTML=head(c.title,c.desc,'<button class="btn primary" data-action="new" data-kind="'+S.page+'">＋ New '+c.one+'</button><button class="btn" data-action="export">↓ Export CSV</button><button class="btn" data-action="import">↑ Import CSV</button>')+
'<div class="toolbar"><label class="search">⌕ <input id="query" placeholder="Search all columns…" value="'+E(S.search)+'"></label>'+(c.status?'<select id="status" class="select" aria-label="Filter status"><option value="all">All statuses</option>'+statuses.map(x=>'<option value="'+E(x)+'"'+(S.status===x?' selected':'')+'>'+E(x.replaceAll('_',' '))+'</option>').join('')+'</select>':'')+
'<button class="btn" data-action="columns">Columns</button><button class="btn" data-action="findReplace">Find & replace</button><button class="btn" data-action="undo" '+(S.history.length?'':'disabled')+'>↶ Undo</button><button class="btn" data-action="copy">Copy rows</button><button class="btn" data-action="exportSelected">Export selected</button><button class="btn" data-action="paste">Paste TSV</button><button class="btn" data-action="fillDown">Fill down</button>'+
(c.statuses&&['leads','deals','tasks','jobs'].includes(S.page)?'<button class="btn" data-action="viewBoard">Board view</button>':'')+'</div>'+
(selectedCount?'<div class="notice" style="margin-bottom:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><strong>'+selectedCount+' selected</strong><button class="btn small" data-action="copy">Copy selection</button>'+(c.status?'<button class="btn small" data-action="bulk">Change status</button>':'')+'<button class="btn small" data-action="clearSelected">Clear selection</button></div>':'')+
'<section class="card"><div class="tablewrap"><table class="table" id="grid"><thead><tr><th><input type="checkbox" id="allRows" aria-label="Select visible rows" '+(pageRows.length&&pageRows.every(x=>S.selected.has(x.id))?'checked':'')+'></th><th>No.</th>'+shown.map(f=>'<th class="sortable" data-action="sort" data-field="'+E(f)+'">'+E(label(S.page,f))+(S.sort===f?(S.descending?' ↓':' ↑'):'')+'</th>').join('')+'<th>Actions</th></tr></thead><tbody>'+
(pageRows.length?pageRows.map((r,i)=>'<tr data-id="'+E(r.id)+'"><td><input type="checkbox" class="selRow" data-id="'+E(r.id)+'" '+(S.selected.has(r.id)?'checked':'')+' aria-label="Select row '+(S.offset+i+1)+'"></td><td class="no">'+fmt(S.offset+i+1)+'</td>'+shown.map(f=>'<td><span class="gridcell" tabindex="0" role="button" title="Double-click or press Enter to edit" data-id="'+E(r.id)+'" data-field="'+E(f)+'">'+renderVal(S.page,r,f)+'</span></td>').join('')+'<td class="act"><button class="btn small" data-action="open" data-kind="'+S.page+'" data-id="'+E(r.id)+'">Open</button> <button class="btn small" data-action="edit" data-kind="'+S.page+'" data-id="'+E(r.id)+'">Edit</button></td></tr>').join(''):'<tr><td colspan="'+(shown.length+3)+'"><div class="empty"><b>No matching records</b><p>Try a different search or create a new record.</p></div></td></tr>')+
'</tbody></table></div><div class="table-footer"><span>'+fmt(rows.length)+' rows · Showing '+(rows.length?fmt(S.offset+1)+'–'+fmt(Math.min(rows.length,S.offset+50)):'0')+' · Double-click to edit · Ctrl+C / Ctrl+V for cells</span><div class="actions"><button class="btn small" data-action="prev" '+(!S.offset?'disabled':'')+'>← Previous</button><button class="btn small" data-action="next" '+(S.offset+50>=rows.length?'disabled':'')+'>Next →</button></div></div></section>'}
function renderVal(k,r,f){const v=r[f],c=C[k],choice=c.status===f;if(choice)return '<span class="pill '+E(v||'new')+'">'+E(String(v||'—').replaceAll('_',' '))+'</span>';if(f==='value'||f==='budget'||f==='amount')return E(dollars(v));if(/Date$|^followup$|^expenseDate$|^issueDate$|^startAt$|^endAt$|^scheduledStart$/.test(f))return E(date(v));if(f==='name'||f==='title'||f==='number')return '<span class="name">'+E(v||'Untitled')+'</span>';const value=fieldValue(k,r,f);return E(String(value||'—').slice(0,120))}
function boardPage(){const c=C[S.page],list=filtered(),stages=c.statuses||[];$('#main').innerHTML=head(c.title+' · Board',c.desc,'<button class="btn" data-action="viewTable">▦ Spreadsheet view</button><button class="btn primary" data-action="new" data-kind="'+S.page+'">＋ New '+c.one+'</button>')+'<div class="notice" style="margin-bottom:15px">Drag cards between stages to update records. Converted leads must be managed as clients.</div><div class="board">'+stages.map(st=>'<section class="lane" data-stage="'+E(st)+'"><h3>'+E(st.replaceAll('_',' '))+' <span>'+fmt(list.filter(x=>x[c.status]===st).length)+'</span></h3>'+list.filter(x=>(x[c.status]||stages[0])===st).map(r=>'<article class="dealcard" draggable="'+(S.page==='leads'&&r.status==='converted'?'false':'true')+'" data-id="'+E(r.id)+'"><strong>'+E(r[c.key]||'Untitled')+'</strong><small>'+E(r.company||r.service||r.contact||'')+'</small>'+(S.page==='deals'?'<strong>'+dollars(r.value)+'</strong>':'')+'<button class="btn small" data-action="open" data-kind="'+S.page+'" data-id="'+E(r.id)+'">Open details</button></article>').join('')+'</section>').join('')+'</div>'}
function detailPage(){const c=C[S.page],r=(S.data[S.page]||[]).find(x=>String(x.id)===String(S.detail));if(!r){S.detail=null;return tablePage()}const id=r.id;const facts=c.columns.filter(f=>f!=='notes'&&f!==c.key);const linked=[];
for(const [k,labelName] of [['tasks','Tasks'],['deals','Deals'],['jobs','Jobs']]){if(k===S.page)continue;const records=(S.data[k]||[]).filter(x=>x.leadId===id||x.clientId===id||(x.linkedId===id&&(x.linkedType===S.page.slice(0,-1))));if(records.length)linked.push('<section class="card pad"><h3>Related '+labelName+'</h3><div class="linked">'+records.slice(0,15).map(x=>'<button data-action="open" data-kind="'+k+'" data-id="'+E(x.id)+'"><strong>'+E(x.title||x.name)+'</strong><small>'+E(x.status||x.stage||'')+'</small></button>').join('')+'</div></section>')}
const email=String(r.email||''),phone=String(r.phone||'').replace(/[^+\d]/g,'');$('#main').innerHTML='<div class="detailhead"><button class="btn primary" data-action="back">← Back to '+E(c.title)+'</button><div class="actions"><button class="btn" data-action="edit" data-kind="'+S.page+'" data-id="'+E(id)+'">✎ Edit '+c.one+'</button><button class="btn" data-action="new" data-kind="tasks" data-ref="'+E(S.page)+'" data-id="'+E(id)+'">＋ Follow-up task</button>'+(S.page==='leads'&&r.status!=='converted'?'<button class="btn" data-action="convert" data-id="'+E(id)+'">Convert to client</button>':'')+'</div></div>'+
'<section class="card pad"><div class="detailhero"><div class="avatar">'+E((r[c.key]||'R').charAt(0).toUpperCase())+'</div><div><h1>'+E(r[c.key]||c.one)+'</h1><p>'+E(r.company||r.contact||r.service||'')+'</p>'+(c.status?'<div style="margin-top:10px"><span class="pill '+E(r[c.status]||'')+'">'+E(r[c.status]||'')+'</span></div>':'')+'</div></div><div class="actions" style="margin-top:19px">'+(email?'<a class="btn" href="mailto:'+encodeURIComponent(email)+'">✉ Email</a>':'')+(phone?'<a class="btn" href="tel:'+E(phone)+'">☎ Call</a>':'')+'<button class="btn" data-action="copyDetail">⧉ Copy details</button></div></section>'+
'<div class="detailgrid"><div class="stack"><section class="card pad"><h3>Record information</h3><div class="facts">'+facts.map(f=>'<div class="fact"><label>'+E(label(S.page,f))+'</label><strong>'+renderVal(S.page,r,f)+'</strong></div>').join('')+'</div></section><section class="card pad"><h3>Notes</h3><div class="notes">'+E(r.notes||'No notes yet. Click Edit to add notes.')+'</div></section>'+linked.join('')+'</div><div class="stack"><section class="card pad"><h3>Quick actions</h3>'+(c.status?'<div class="field"><label>Status</label><select id="detailStatus" class="select">'+(c.statuses||[]).map(x=>'<option '+(r[c.status]===x?'selected':'')+' value="'+E(x)+'">'+E(x)+'</option>').join('')+'</select></div>':'')+(S.page==='leads'?'<div class="field" style="margin-top:14px"><label>Next follow-up</label><input id="detailFollowup" class="select" type="date" value="'+E(r.followup||'')+'"></div>':'')+'<button class="btn primary" data-action="saveDetail" style="width:100%;margin-top:16px">Save updates</button></section><section class="card pad"><h3>Record actions</h3><p class="card-sub">Changes are saved to your protected CRM database.</p><div class="actions"><button class="btn" data-action="edit" data-kind="'+S.page+'" data-id="'+E(id)+'">Edit all fields</button>'+(isManager()?'<button class="btn danger" data-action="delete" data-kind="'+S.page+'" data-id="'+E(id)+'">Delete</button>':'')+'</div></section></div></div><div style="margin-top:20px"><button class="btn primary" data-action="back">← Back to '+E(c.title)+'</button></div>'}
function optionsFor(k,f,selected){const meta=fieldInfo(k,f),type=meta[2]||'text';let values=[];if(type.startsWith('choice:'))values=type.slice(7).split('|').map(x=>[x,x.replaceAll('_',' ')]);else if(type==='rel:any')values=[['','None'],...['leads','clients','deals'].flatMap(kind=>(S.data[kind]||[]).map(r=>[kind.slice(0,-1)+'|'+r.id,(r.name||r.title)+' ('+kind+')']))];else if(type.startsWith('rel:')){const group=type.slice(4);values=[['','None'],...(S.data[group]||[]).map(r=>[r.id,r.name||r.title||r.number||'Untitled'])]}return values.map(([val,label])=>'<option value="'+E(val)+'" '+(String(val)===String(selected||'')?'selected':'')+'>'+E(label)+'</option>').join('')}
function inputField(k,meta,r){const [f,title,type='text',required]=meta;let value=f==='linkedRef'?(r.linkedType&&r.linkedId?r.linkedType+'|'+r.linkedId:''):r[f]??'';if(type==='datetime-local'&&value)value=localInputDateTime(value);const fieldType=type.startsWith('choice:')||type.startsWith('rel:')?'select':type;const control=fieldType==='textarea'?'<textarea name="'+f+'" maxlength="6000" rows="4">'+E(value)+'</textarea>':fieldType==='select'?'<select name="'+f+'">'+optionsFor(k,f,value)+'</select>':'<input name="'+f+'" type="'+E(fieldType)+'" value="'+E(value)+'" '+(required?'required':'')+' '+(type==='number'?'min="0" step="0.01"':'maxlength="500"')+'>';return '<div class="field '+(type==='textarea'?'span':'')+'"><label>'+E(title)+(required?' *':'')+'</label>'+control+'</div>'}
function modal(title,content,footer){const dlg=$('#dialog');dlg.innerHTML='<div class="dialoghead"><h2>'+E(title)+'</h2><button class="iconbtn" data-action="close">✕</button></div><div class="dialogbody">'+content+'</div><div class="dialogfoot">'+(footer||'<button class="btn" data-action="close">Close</button>')+'</div>';dlg.showModal()}
function formModal(k,id=null,defaults={}){const c=C[k];if(!c)return;const initial=k==='tasks'?{priority:'medium',status:'open'}:k==='jobs'?{priority:'normal',status:'new'}:k==='leads'?{status:'new'}:k==='deals'?{stage:'new'}:k==='documents'?{status:'draft',docType:'invoice',issueDate:day()}:k==='calendar'?{eventType:'meeting'}:k==='expenses'?{status:'recorded',expenseDate:day()}:{};const r=id?(S.data[k]||[]).find(x=>x.id===id):{...initial,...defaults};if(!r){tip('Record no longer available',true);return}modal((id?'Edit ':'New ')+c.one,'<form id="entryForm" data-kind="'+k+'" data-id="'+E(id||'')+'"><div class="formgrid">'+c.fields.map(f=>inputField(k,f,r)).join('')+'</div></form>','<button class="btn" data-action="close">Cancel</button><button class="btn primary" type="submit" form="entryForm">'+(id?'Save changes':'Create '+c.one)+'</button>')}
async function saveForm(ev){ev.preventDefault();const form=ev.target,k=form.dataset.kind,id=form.dataset.id;const fd=new FormData(form),payload=Object.fromEntries(fd.entries());for(const[f,,type]of C[k].fields)if(type==='datetime-local'&&payload[f])payload[f]=utcDateTime(payload[f]);if(k==='calendar'&&(!payload.startAt||!payload.endAt||payload.endAt<=payload.startAt))return tip('Event end must be after its start',true);if(k==='jobs'&&payload.scheduledStart&&payload.scheduledEnd&&payload.scheduledEnd<=payload.scheduledStart)return tip('Job end must be after start',true);if(k==='tasks'){const value=payload.linkedRef||'';delete payload.linkedRef;[payload.linkedType,payload.linkedId]=value?value.split('|'):['','']}if(['deals','documents','projects','contracts','expenses'].includes(k))for(const f of ['value','amount','budget'])if(f in payload)payload[f]=Number(payload[f]||0);
if(!form.reportValidity())return;const button=$('#dialog button[type=submit]');button.disabled=true;try{await API('records/'+k+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body:payload});$('#dialog').close();await reload();tip(id?'Changes saved':'Record created')}catch(e){tip(e.message,true)}finally{button.disabled=false}}
function editCell(span){if(S.editCell)return;const id=span.dataset.id,k=S.page,f=span.dataset.field,c=C[k],r=(S.data[k]||[]).find(x=>String(x.id)===String(id));if(!r)return;const meta=fieldInfo(k,f),type=meta[2]||'text',value=r[f]??'';if(f==='linkedRef'){tip('Edit linked tasks from the record form');return}let input;if(type.startsWith('choice:')||type.startsWith('rel:')){input=document.createElement('select');input.innerHTML=optionsFor(k,f,value)}else{input=document.createElement('input');input.type=type==='date'?'date':type==='number'?'number':type==='email'?'email':type==='tel'?'tel':'text';input.value=value||'';input.style.width='min(200px,100%)';input.style.minHeight='32px'}
input.className='select';input.setAttribute('aria-label','Edit '+label(k,f));span.replaceWith(input);S.editCell={input,span,k,id,f,original:value};input.focus();if(input.select)input.select();let working=false;const stop=()=>{if(S.editCell?.input===input){input.replaceWith(span);S.editCell=null}};const commit=async()=>{if(working||S.editCell?.input!==input)return;working=true;const next=input.value;if(String(next)===String(value)){stop();return}input.disabled=true;try{await patch(k,id,{[f]:type==='number'?Number(next||0):next},true);stop();render();tip('Cell updated')}catch(e){tip(e.message,true);input.disabled=false;working=false;input.focus()}};input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();stop()}else if(e.key==='Enter'){e.preventDefault();commit()}});input.addEventListener('blur',commit,{once:true});if(input.tagName==='SELECT')input.addEventListener('change',commit,{once:true})}
async function patch(k,id,changes,remember=true){const row=S.data[k]?.find(x=>String(x.id)===String(id));if(!row)throw Error('Record was not found');const before={};for(const field of Object.keys(changes))before[field]=row[field]??'';await API('records/'+k+'/'+encodeURIComponent(id),{method:'PUT',body:changes});Object.assign(row,changes);if(remember){S.history.push({k,id,changes:before});if(S.history.length>30)S.history.shift()}}
async function reload(){const data=await API('data');S.data=data;S.selected=new Set([...S.selected].filter(id=>(data[S.page]||[]).some(r=>r.id===id)));shell()}
function downloadCSV(selectedOnly=false){const k=S.page,rows=selectedOnly?filtered().filter(x=>S.selected.has(x.id)):filtered(),fields=cols(),all=[fields,...rows.map(r=>fields.map(f=>String(r[f]??'')))];const csv=all.map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n');fileDownload('\uFEFF'+csv,'NexaBridge_'+k+'_'+day()+'.csv','text/csv;charset=utf-8')}
function fileDownload(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function copyRows(){const rows=filtered();const chosen=S.selected.size?rows.filter(x=>S.selected.has(x.id)):rows.slice(S.offset,S.offset+50);const fields=cols(),v=[fields,...chosen.map(r=>fields.map(f=>String(r[f]??'').replace(/\t/g,' ').replace(/\r?\n/g,' ')))].map(row=>row.join('\t')).join('\n');if(!navigator.clipboard?.writeText)return tip('Clipboard requires a secure connection',true);navigator.clipboard.writeText(v).then(()=>tip('Copied '+chosen.length+' rows')).catch(()=>tip('Clipboard unavailable',true))}
function parseDelimited(text,delimiter){const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(ch===delimiter&&!quote){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=ch}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
function spreadsheetGridPosition(cell){
 if(!cell||!cell.matches('.gridcell')||!C[S.page]||S.mode!=='table')return null;
 const rows=filtered().slice(S.offset,S.offset+50),i=rows.findIndex(x=>String(x.id)===String(cell.dataset.id)),j=cols().indexOf(cell.dataset.field);
 return i>=0&&j>=0?{rows,row:i,col:j,fields:cols()}:null;
}
function spreadsheetCoerce(k,field,value){
 const raw=String(value??'').trim(),type=fieldInfo(k,field)[2]||'text';
 if(type.startsWith('rel:')||field==='linkedRef')throw Error('Edit relationship columns in the record form.');
 if(type==='number'){if(!raw)return 0;const v=Number(raw);if(!Number.isFinite(v)||v<0)throw Error('Invalid amount in '+label(k,field));return v}
 if(type.startsWith('choice:')){const allowed=type.slice(7).split('|');if(raw&&!allowed.includes(raw))throw Error('Invalid '+field+': '+raw);if(k==='leads'&&field==='status'&&raw==='converted')throw Error('Use Convert to client for lead conversion.')}
 if(type==='date'&&raw&&!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw Error('Date must use YYYY-MM-DD.');
 if(type==='datetime-local'&&raw&&isNaN(Date.parse(raw)))throw Error('Invalid date/time.');
 if(type==='email'&&raw&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))throw Error('Invalid email.');
 if(raw.length>6000)throw Error('Value exceeds cell limit.');
 return type==='datetime-local'&&raw?utcDateTime(raw):raw;
}
async function pasteGridAt(cell,text){
 const p=spreadsheetGridPosition(cell);if(!p)throw Error('Select a spreadsheet cell first.');
 if(text.length>75000)throw Error('Use CSV import for larger data.');
 const grid=parseDelimited(text.replace(/\r\n/g,'\n'),'\t');if(!grid.length)return;
 if(grid.length>100||grid.some(row=>row.length>30))throw Error('Paste at most 100 rows and 30 columns.');
 const changes=new Map();for(let i=0;i<grid.length;i++){
  const row=p.rows[p.row+i];if(!row)break;
  if(S.page==='leads'&&row.status==='converted')throw Error('Converted leads cannot be bulk edited.');
  const updates={};for(let j=0;j<grid[i].length;j++){const f=p.fields[p.col+j];if(!f)continue;const v=spreadsheetCoerce(S.page,f,grid[i][j]);if(String(row[f]??'')!==String(v))updates[f]=v}
  if(Object.keys(updates).length)changes.set(row.id,updates);
 }
 if(!changes.size)return tip('No cells changed.');
 if(changes.size>1&&!confirm('Update '+changes.size+' existing CRM records?'))return;
 let n=0,errors=[];for(const[id,updates]of changes){try{await patch(S.page,id,updates,true);n++}catch(err){errors.push(err.message)}}
 render();tip(n+' record(s) updated'+(errors.length?' · '+errors.length+' failed':''),!!errors.length);
}
async function fillSelectedDown(){
 const k=S.page,p=spreadsheetGridPosition(document.activeElement?.matches('.gridcell')?document.activeElement:$('.gridcell'));
 if(!p)return tip('Select a spreadsheet cell first',true);
 const field=p.fields[p.col],rows=p.rows.filter(x=>S.selected.has(x.id));
 if(rows.length<2)return tip('Select at least two visible rows',true);
 if(k==='leads'&&rows.some(x=>x.status==='converted'))return tip('Converted leads cannot be bulk edited',true);
 const value=rows[0][field]??'';
 if(!confirm('Fill '+label(k,field)+' down into '+(rows.length-1)+' selected records?'))return;
 let n=0;for(const row of rows.slice(1)){try{await patch(k,row.id,{[field]:value},true);n++}catch(err){tip(err.message,true)}}
 render();tip(n+' rows filled');
}

function pasteModal(){modal('Paste spreadsheet data','<p class="card-sub">Paste tab-separated rows copied from Google Sheets or Excel. Match columns by header name; existing rows are not overwritten. Review before importing.</p><div class="field"><label>Paste data (first row must contain column names)</label><textarea id="pasteArea" rows="9" placeholder="name\tcompany\temail\nJane Doe\tExample Ltd\tjane@example.com" style="width:100%"></textarea></div>','<button class="btn" data-action="close">Cancel</button><button class="btn primary" data-action="previewPaste">Preview rows</button>')}
function importModal(){modal('Import spreadsheet CSV','<p class="card-sub">CSV import creates new records only. Export a sample first to see accepted columns. There is no bulk overwrite.</p><div class="field"><label>Choose CSV file</label><input id="importFile" type="file" accept=".csv,text/csv"></div>','<button class="btn" data-action="close">Cancel</button><button class="btn primary" data-action="previewFile">Preview import</button>')}
function previewImport(text,delimiter){const raw=parseDelimited(text.replace(/^\uFEFF/,''),delimiter);if(raw.length<2)return tip('Include a header and at least one data row',true);const k=S.page,keys=C[k].fields.map(x=>x[0]),normalize=v=>String(v).trim().toLowerCase().replace(/[\s_()-]/g,'');const headers=raw[0].map(x=>keys.find(f=>normalize(f)===normalize(x))||C[k].fields.find(f=>normalize(f[1])===normalize(x))?.[0]||'');if(!headers.some(x=>x===C[k].key))return tip('A '+C[k].key+' column is required. Use the exported column names.',true);const rows=raw.slice(1).filter(x=>x.some(v=>v.trim())).map(row=>Object.fromEntries(headers.map((f,i)=>[f,(row[i]||'').trim()]).filter(([f])=>f)));if(!rows.length)return tip('No rows found',true);if(rows.length>500)return tip('Import up to 500 rows at a time',true);S.importRows=rows;S.importKind=k;modal('Review import · '+fmt(rows.length)+' records','<div class="notice">This will CREATE '+fmt(rows.length)+' new '+E(k)+' records in Supabase. It will not modify existing records.</div><div class="tablewrap" style="margin-top:14px;max-height:340px"><table class="table"><thead><tr>'+headers.filter(Boolean).map(x=>'<th>'+E(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(0,8).map(row=>'<tr>'+headers.filter(Boolean).map(x=>'<td>'+E(row[x]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="formhint">First '+Math.min(8,rows.length)+' rows shown. Please check carefully.</p>','<button class="btn" data-action="close">Cancel</button><button class="btn primary" data-action="runImport">Import '+rows.length+' records</button>')}
async function runImport(){const rows=S.importRows,k=S.importKind;if(k!==S.page||!rows.length)return;const btn=$('#dialog [data-action=runImport]');btn.disabled=true;let success=0;const failures=[];for(const [index,payload]of rows.entries()){try{if(k==='deals'&&'value'in payload)payload.value=Number(payload.value||0);for(const[f,,type]of C[k].fields)if(type==='datetime-local'&&payload[f])payload[f]=utcDateTime(payload[f]);if(k==='tasks'&&payload.linkedRef){const[linkedType,linkedId]=payload.linkedRef.split('|');payload.linkedType=linkedType;payload.linkedId=linkedId;delete payload.linkedRef}await API('records/'+k,{method:'POST',body:payload});success++}catch(e){failures.push('Row '+(index+2)+': '+e.message)}btn.textContent='Imported '+success+' / '+rows.length}
S.importRows=[];$('#dialog').close();await reload();tip(success+' imported; '+failures.length+' failed',!!failures.length);if(failures.length)fileDownload(failures.join('\n'),'NexaBridge_import_errors.txt','text/plain')}
async function undo(){const last=S.history.pop();if(!last)return;try{await patch(last.k,last.id,last.changes,false);await reload();tip('Last edit undone')}catch(e){S.history.push(last);tip(e.message,true)}}

function replacementFields(){
 return C[S.page].fields.filter(([f,,type='text'])=>['text','tel','email','textarea'].includes(type)&&!['linkedRef','clientId','leadId'].includes(f)).map(([f])=>f);
}
function findReplaceModal(){
 const fields=replacementFields();
 modal('Find & replace','<p class="card-sub">Replace text in CRM fields. Each edited record is recorded in Undo history.</p>'+
 '<div class="formgrid"><div class="field span"><label>Find text</label><input id="replaceFind" required placeholder="Search text"></div>'+
 '<div class="field span"><label>Replace with</label><input id="replaceWith" placeholder="Replacement text"></div>'+
 '<div class="field"><label>Column</label><select id="replaceField"><option value="">All text columns</option>'+fields.map(f=>'<option value="'+E(f)+'">'+E(label(S.page,f))+'</option>').join('')+'</select></div>'+
 '<div class="field"><label>Scope</label><select id="replaceScope"><option value="filtered">Filtered rows</option>'+(S.selected.size?'<option value="selected">Selected rows</option>':'')+'</select></div></div>'+
 '<label style="display:flex;gap:8px;align-items:center;margin-top:15px;font-size:12px"><input type="checkbox" id="replaceCase"> Case-sensitive search</label>'+
 '<div id="replacePreview" class="notice" style="margin-top:14px">Preview matches before replacing.</div>',
 '<button class="btn" data-action="close">Cancel</button><button class="btn" data-action="replacePreview">Preview</button><button class="btn primary" data-action="replaceRun">Replace matches</button>');
}
function replacementPlan(){
 const find=$('#replaceFind')?.value||'';if(!find)throw Error('Enter text to find.');
 const withText=$('#replaceWith')?.value||'',field=$('#replaceField')?.value||'',scope=$('#replaceScope')?.value||'filtered',sensitive=!!$('#replaceCase')?.checked;
 const rows=scope==='selected'?filtered().filter(r=>S.selected.has(r.id)):filtered(),fields=field?[field]:replacementFields();
 const plan=[];
 for(const r of rows){const updates={};for(const f of fields){
  const value=String(r[f]||''),needle=sensitive?find:find.toLowerCase(),source=sensitive?value:value.toLowerCase();
  if(!source.includes(needle))continue;
  let at=0,out='',idx;while((idx=source.indexOf(needle,at))!==-1){out+=value.slice(at,idx)+withText;at=idx+find.length}out+=value.slice(at);
  if(f===C[S.page].key&&!out.trim())throw Error('Replacement cannot erase a required name.');
  updates[f]=out;
 }
 if(Object.keys(updates).length)plan.push({id:r.id,changes:updates});
 }
 return plan;
}
function previewReplace(){try{const matches=replacementPlan();$('#replacePreview').textContent=matches.length+' matching record(s). '+(matches.length>100?'Limit to 100 records per operation.':'Review before applying.')}catch(e){tip(e.message,true)}}
async function runReplace(){
 try{const plan=replacementPlan();if(!plan.length)return tip('No matches found.');
 if(plan.length>100)return tip('Limit to 100 matching records per operation.',true);
 if(!confirm('Replace text in '+plan.length+' CRM records?'))return;
 const button=$('#dialog [data-action=replaceRun]');button.disabled=true;let saved=0,failed=0;
 for(const item of plan){try{await patch(S.page,item.id,item.changes,true);saved++}catch(e){failed++}}
 $('#dialog').close();await reload();tip(saved+' records updated'+(failed?' · '+failed+' failed':''),failed>0);
 }catch(e){tip(e.message,true)}
}

function columnsModal(){const c=C[S.page];modal('Visible columns','<p class="card-sub">Choose columns for your spreadsheet table.</p><div class="formgrid">'+c.columns.map(f=>'<label style="display:flex;align-items:center;gap:9px"><input type="checkbox" class="colToggle" value="'+E(f)+'" '+(!S.hidden[S.page]?.includes(f)?'checked':'')+'>'+E(label(S.page,f))+'</label>').join('')+'</div>','<button class="btn primary" data-action="saveColumns">Apply columns</button>')}
function bulkModal(){const k=S.page,c=C[k];if(!c.status)return;modal('Change status for '+S.selected.size+' selected records','<div class="field"><label>New status / stage</label><select id="bulkStatus" class="select">'+(c.statuses||[]).map(v=>'<option value="'+E(v)+'">'+E(v)+'</option>').join('')+'</select></div><p class="formhint">This updates the selected records one by one. Converted leads cannot be reverted here.</p>','<button class="btn" data-action="close">Cancel</button><button class="btn primary" data-action="saveBulk">Apply changes</button>')}
async function saveBulk(){const k=S.page,c=C[k],state=$('#bulkStatus').value,ids=[...S.selected];if(ids.length>200)return tip('Select at most 200 records per batch',true);if(k==='leads'&&state==='converted')return tip('Use Convert to client for lead conversion.',true);const btn=$('#dialog [data-action=saveBulk]');btn.disabled=true;let done=0,errors=[];for(const id of ids){const row=(S.data[k]||[]).find(x=>x.id===id);if(!row||row[c.status]===state)continue;if(k==='leads'&&row.status==='converted'){errors.push('Converted lead skipped');continue}try{await patch(k,id,{[c.status]:state},true);done++}catch(e){errors.push(e.message)}}$('#dialog').close();S.selected.clear();await reload();tip(done+' records updated'+(errors.length?' · '+errors.length+' skipped':''),!!errors.length)}
async function execute(action,el){try{const k=el.dataset.kind||S.page,id=el.dataset.id;switch(action){
case 'page':page(el.dataset.page);break;
case 'menu':$('#sidebar')?.classList.toggle('open');break;
case 'theme':S.theme=S.theme==='dark'?'light':'dark';document.body.classList.toggle('dark',S.theme==='dark');try{localStorage.setItem('nexa-v3-theme',S.theme)}catch(_){}shell();break;
case 'refresh':await reload();tip('Data refreshed');break;
case 'logout':if(!confirm('Sign out of NexaBridge CRM?'))break;await API('logout',{method:'POST',body:{}});S.user=null;S.data=null;loginPage();break;
case 'new':{let defaults={};if(k==='tasks'&&el.dataset.ref&&id){const group=el.dataset.ref;const entity=(S.data[group]||[]).find(x=>String(x.id)===String(id));defaults={title:'Follow up: '+(entity?.name||entity?.title||''),linkedType:group.slice(0,-1),linkedId:id,dueDate:day(),priority:'medium',status:'open'}}formModal(k,null,defaults);break}
case 'open':S.page=k;S.detail=id;render();scrollTo({top:0,behavior:'instant'});break;
case 'back':S.detail=null;render();break;
case 'edit':formModal(k,id);break;
case 'duplicate':{const source=(S.data[k]||[]).find(x=>String(x.id)===String(id));if(!source)return tip('Record not found',true);const vals={...source};delete vals.id;vals[C[k].key]=String(vals[C[k].key]||'')+' (copy)';formModal(k,null,vals);break}
case 'close':$('#dialog').close();break;
case 'sort':S.descending=S.sort===el.dataset.field?!S.descending:false;S.sort=el.dataset.field;S.offset=0;render();break;
case 'prev':S.offset=Math.max(0,S.offset-50);render();break;
case 'next':S.offset+=50;render();break;
case 'clearSelected':S.selected.clear();render();break;
case 'undo':await undo();break;
case 'columns':columnsModal();break;
case 'findReplace':findReplaceModal();break;
case 'replacePreview':previewReplace();break;
case 'replaceRun':await runReplace();break;
case 'saveColumns':{const checked=$$('.colToggle:checked').map(x=>x.value);if(!checked.length)return tip('Keep at least one column',true);S.hidden[S.page]=C[S.page].columns.filter(f=>!checked.includes(f));try{localStorage.setItem('nexa-v3-hidden',JSON.stringify(S.hidden))}catch(_){}$('#dialog').close();render();break}
case 'export':downloadCSV();break;
case 'exportSelected':if(!S.selected.size)return tip('Select rows to export',true);downloadCSV(true);break;
case 'copy':copyRows();break;
case 'paste':pasteModal();break;
case 'fillDown':await fillSelectedDown();break;
case 'previewPaste':previewImport($('#pasteArea').value,'\t');break;
case 'import':importModal();break;
case 'previewFile':{const file=$('#importFile').files?.[0];if(!file)return tip('Select a CSV file first',true);if(file.size>1500000)return tip('File is too large. Use a smaller CSV.',true);previewImport(await file.text(),',');break}
case 'runImport':await runImport();break;
case 'bulk':bulkModal();break;
case 'saveBulk':await saveBulk();break;
case 'viewBoard':S.mode='board';try{localStorage.setItem('nexa-v3-gridmode',S.mode)}catch(_){}render();break;
case 'viewTable':S.mode='table';try{localStorage.setItem('nexa-v3-gridmode',S.mode)}catch(_){}render();break;
case 'convert':if(!confirm('Convert this lead into a client? This creates a client record.'))break;await API('convert/'+encodeURIComponent(id),{method:'POST',body:{}});S.detail=null;await reload();tip('Lead converted into client');break;
case 'delete':if(!isManager())return tip('Administrator access required',true);if(!confirm('Delete this record permanently? This cannot be undone.'))break;await API('records/'+k+'/'+encodeURIComponent(id),{method:'DELETE'});S.detail=null;await reload();tip('Record deleted');break;
case 'copyDetail':{const row=(S.data[S.page]||[]).find(x=>x.id===S.detail),text=C[S.page].columns.map(f=>label(S.page,f)+': '+(row?.[f]||'')).join('\n');await navigator.clipboard.writeText(text);tip('Details copied');break}
case 'saveDetail':{const changes={},c=C[S.page];if(c.status&&$('#detailStatus'))changes[c.status]=$('#detailStatus').value;if(S.page==='leads'&&$('#detailFollowup'))changes.followup=$('#detailFollowup').value;if(S.page==='leads'&&changes.status==='converted'&&((S.data.leads||[]).find(x=>x.id===S.detail)?.status!=='converted'))return tip('Use Convert to client to create its account.',true);await patch(S.page,S.detail,changes,true);await reload();tip('Record updated');break}
}}catch(e){tip(e.message||'Operation failed',true)}}
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]');if(action){e.preventDefault();execute(action.dataset.action,action)}});
document.addEventListener('submit',async e=>{if(e.target.id==='loginForm'){e.preventDefault();const btn=$('#loginForm button');btn.disabled=true;try{const f=new FormData(e.target);S.user=(await API('login',{method:'POST',body:{username:f.get('username'),password:f.get('password')}})).user;S.data=await API('data');shell()}catch(err){loginPage(err.message)}finally{btn.disabled=false}}else if(e.target.id==='entryForm')saveForm(e)});
document.addEventListener('input',e=>{if(e.target.id==='query'){const el=e.target,pos=el.selectionStart;S.search=el.value;S.offset=0;const focused=pos;tablePage();const next=$('#query');next?.focus();next?.setSelectionRange(focused,focused)}else if(e.target.id==='globalSearch'){globalResults(e.target.value)}});
document.addEventListener('change',e=>{if(e.target.id==='status'){S.status=e.target.value;S.offset=0;render()}else if(e.target.id==='allRows'){for(const row of filtered().slice(S.offset,S.offset+50)){if(e.target.checked)S.selected.add(row.id);else S.selected.delete(row.id)}render()}else if(e.target.classList.contains('selRow')){if(e.target.checked)S.selected.add(e.target.dataset.id);else S.selected.delete(e.target.dataset.id);render()}});
document.addEventListener('dblclick',e=>{const c=e.target.closest('.gridcell');if(c)editCell(c)});
document.addEventListener('click',e=>{if(!e.target.closest('.top-search-wrap')){const box=$('#searchHits');if(box)box.hidden=true}});
document.addEventListener('paste',async e=>{
 const focus=document.activeElement;
 if(!focus?.matches('.gridcell'))return;
 const content=e.clipboardData?.getData('text/plain');if(!content)return;
 e.preventDefault();try{await pasteGridAt(focus,content)}catch(err){tip(err.message,true)}
});
document.addEventListener('keydown',e=>{
 const active=document.activeElement;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&active?.matches('.gridcell')){e.preventDefault();undo();return}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&active?.matches('.gridcell')){
  e.preventDefault();if(S.selected.size)copyRows();
  else navigator.clipboard?.writeText(String((S.data[S.page]||[]).find(x=>String(x.id)===String(active.dataset.id))?.[active.dataset.field]??'')).then(()=>tip('Cell copied')).catch(()=>tip('Copy unavailable',true));
  return
 }
 if(e.key==='Enter'&&e.target.id==='globalSearch'){const hit=$('#searchHits [data-action="open"]');if(hit){e.preventDefault();hit.click()}return}
 if(e.key==='Escape'&&e.target.id==='globalSearch'){const box=$('#searchHits');if(box)box.hidden=true;return}
 if(e.key==='Enter'&&e.target.matches('.gridcell')){e.preventDefault();editCell(e.target)}else if(e.target.matches('.gridcell')&&['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)){const cell=e.target,tr=cell.closest('tr'),td=cell.closest('td');let target=e.key==='ArrowDown'?tr?.nextElementSibling?.children[td.cellIndex]:e.key==='ArrowUp'?tr?.previousElementSibling?.children[td.cellIndex]:e.key==='ArrowRight'?td.nextElementSibling:e.key==='ArrowLeft'?td.previousElementSibling:null;const next=target?.querySelector('.gridcell');if(next){e.preventDefault();next.focus()}}});
let drag=null;
document.addEventListener('dragstart',e=>{const card=e.target.closest('.dealcard[draggable="true"]');if(card){drag={kind:S.page,id:card.dataset.id};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',card.dataset.id)}});
document.addEventListener('dragover',e=>{if(drag&&e.target.closest('.lane')){e.preventDefault();e.dataTransfer.dropEffect='move';e.target.closest('.lane').classList.add('dragover')}});
document.addEventListener('dragleave',e=>{if(!e.target.closest('.lane')?.contains(e.relatedTarget))e.target.closest('.lane')?.classList.remove('dragover')});
document.addEventListener('dragend',()=>{$$('.lane').forEach(x=>x.classList.remove('dragover'));drag=null});
document.addEventListener('drop',async e=>{const lane=e.target.closest('.lane'),d=drag;$$('.lane').forEach(x=>x.classList.remove('dragover'));drag=null;if(!lane||!d||d.kind!==S.page)return;e.preventDefault();const status=lane.dataset.stage,config=C[d.kind],r=(S.data[d.kind]||[]).find(x=>x.id===d.id);if(!r||!config.status||r[config.status]===status)return;if(d.kind==='leads'&&(status==='converted'||r.status==='converted'))return tip('Convert leads using Convert to client',true);try{await patch(d.kind,d.id,{[config.status]:status},true);render();tip('Status updated')}catch(error){tip(error.message,true)}});
$('#dialog').addEventListener('close',()=>{S.editCell=null});
async function start(){loginPage();try{const res=await API('me');S.user=res.user;S.data=await API('data');shell()}catch(e){loginPage()}}
start();
})();