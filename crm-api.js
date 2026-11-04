

/* NexaBridge Solutions — authenticated Supabase CRM transport. */
(()=>{'use strict';
const URL_BASE='https://eahoudfosrblcsbjgjoa.supabase.co';
const PUBLIC_KEY='sb_publishable_kxVCDTegJm-_nRrvaBAzrw_hbMPoG_5';
const COLLECTIONS={leads:'crm_leads',clients:'crm_clients',deals:'crm_deals',tasks:'crm_tasks',jobs:'crm_jobs',documents:'crm_documents',calendar:'crm_calendar_events',email_queue:'crm_email_queue',email_templates:'crm_email_templates',catalog:'crm_catalog',stock_movements:'crm_stock_movements',equipment:'crm_equipment',technicians:'crm_technicians',time_entries:'crm_time_entries',checklists:'crm_checklists',service_plans:'crm_service_plans',projects:'crm_projects',contracts:'crm_contracts',expenses:'crm_expenses'};
const FIELDS={email_queue:{recipientEmail:'recipient_email',subject:'subject',body:'body',state:'state'},email_templates:{name:'name',subject:'subject',body:'body'},projects:{title:'title',clientId:'client_id',description:'description',startDate:'start_date',dueDate:'due_date',budget:'budget',status:'status'},contracts:{title:'title',clientId:'client_id',description:'description',startDate:'start_date',dueDate:'due_date',value:'value',status:'status'},expenses:{title:'title',projectId:'project_id',category:'category',expenseDate:'expense_date',amount:'amount',status:'status',notes:'notes'},leads:{name:'name',company:'company',phone:'phone',email:'email',source:'source',interest:'interest',status:'status',followup:'followup',owner:'owner',notes:'notes'},clients:{name:'name',contact:'contact',phone:'phone',email:'email',industry:'industry',notes:'notes'},deals:{title:'title',value:'value',clientId:'client_id',leadId:'lead_id',stage:'stage',service:'service',closeDate:'close_date',notes:'notes'},tasks:{title:'title',dueDate:'due_date',priority:'priority',status:'status',notes:'notes'},jobs:{title:'title',clientId:'client_id',leadId:'lead_id',service:'service',address:'address',scheduledStart:'scheduled_start',scheduledEnd:'scheduled_end',assignedTo:'assigned_to',status:'status',priority:'priority',notes:'notes'},documents:{billToName:'bill_to_name',billToEmail:'bill_to_email',billToPhone:'bill_to_phone',billToAddress:'bill_to_address',reference:'reference',paymentTerms:'payment_terms',footerText:'footer_text',docType:'doc_type',number:'number',description:'description',amount:'amount',clientId:'client_id',jobId:'job_id',status:'status',issueDate:'issue_date',dueDate:'due_date',notes:'notes'},calendar:{title:'title',eventType:'event_type',startAt:'start_at',endAt:'end_at',location:'location',description:'description',clientId:'client_id',leadId:'lead_id',assignedTo:'assigned_to'},catalog:{name:'name',sku:'sku',kind:'kind',category:'category',unitPrice:'unit_price',unitCost:'unit_cost',stockQty:'stock_qty',reorderPoint:'reorder_point',taxable:'taxable',active:'active',notes:'notes'},equipment:{clientId:'client_id',name:'name',serialNumber:'serial_number',model:'model',location:'location',installedOn:'installed_on',warrantyUntil:'warranty_until',status:'status',notes:'notes'},technicians:{name:'name',email:'email',phone:'phone',skills:'skills',serviceArea:'service_area',status:'status',notes:'notes'},time_entries:{jobId:'job_id',technician:'technician',startedAt:'started_at',endedAt:'ended_at',hourlyRate:'hourly_rate',notes:'notes'},checklists:{jobId:'job_id',title:'title',isDone:'is_done',notes:'notes'},service_plans:{clientId:'client_id',name:'name',intervalDays:'interval_days',nextVisit:'next_visit',price:'price',status:'status',notes:'notes'},stock_movements:{catalogId:'catalog_id',jobId:'job_id',delta:'delta',reason:'reason',notes:'notes'}};
const COMPANY='NexaBridge Solutions';
let session=null, member=null, orgId=null;
const SESSION_KEY='nexa_crm_session_v3';
try{const stored=sessionStorage.getItem(SESSION_KEY);if(stored){const value=JSON.parse(stored);if(value&&typeof value.access_token==='string'&&typeof value.refresh_token==='string')session=value;}}catch(_){/* session-only auth */}
function saveSession(){try{if(session)sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));else sessionStorage.removeItem(SESSION_KEY)}catch(_){}}

const defaultSettings={company:COMPANY,currency:'USD',services:['Customer Support','Appointment Scheduling','Dispatch Coordination','CRM Management','Customer Follow-ups','Administrative Support']};
function reply(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}})}
function err(x,status=400){return reply({detail:x},status)}
async function request(path,{method='GET',body,auth=true,prefer}={}){
 const headers={'apikey':PUBLIC_KEY};if(auth){if(!session?.access_token)throw Error('Please sign in again.');headers.Authorization='Bearer '+session.access_token;}
 if(body!==undefined)headers['Content-Type']='application/json';if(prefer)headers.Prefer=prefer;
 const r=await fetch(URL_BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 let data;const text=await r.text();try{data=text?JSON.parse(text):null}catch{data=text;}
 if(!r.ok)throw Error(data?.msg||data?.message||data?.error_description||data?.error||'Request failed ('+r.status+')');
 return data;
}
async function loadMember(){
 const claims=await request('/auth/v1/user');
 const rows=await request('/rest/v1/crm_members?select=org_id,role&user_id=eq.'+encodeURIComponent(claims.id));
 if(!rows.length)throw Error('This account is not authorized to access the CRM.');
 let match=null;for(const row of rows){const organizations=await request('/rest/v1/crm_organizations?select=id,name&id=eq.'+row.org_id);if(organizations?.[0]?.name===COMPANY){match=row;break}}
 if(!match)throw Error('This account does not belong to NexaBridge Solutions.');
 orgId=match.org_id;member={id:claims.id,username:claims.email,name:claims.email,role:match.role,active:true};
}
async function login(email,password){
 const r=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}});
 session={access_token:r.access_token,refresh_token:r.refresh_token};saveSession();
 try{await loadMember()}catch(e){session=null;member=null;orgId=null;saveSession();throw e}
 return {user:member,csrf:'supabase-auth'};
}
async function refresh(){if(!session?.refresh_token)throw Error('Please sign in again.');const r=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:session.refresh_token}});session={access_token:r.access_token,refresh_token:r.refresh_token};saveSession();return r}
async function secured(path,options={}){try{return await request(path,options)}catch(e){if(session&&/JWT expired|invalid JWT|token is expired/i.test(e.message)){await refresh();return request(path,options)}throw e}}
window.nexaAuthenticatedRequest=(path,options)=>secured(path,options);
window.nexaSheetsRealtimeCredentials=()=>session?.access_token&&orgId?{url:URL_BASE,key:PUBLIC_KEY,token:session.access_token,orgId}:null;

const table = kind=>COLLECTIONS[kind];
function fromRow(kind,row){const out={...row,createdAt:row.created_at,updatedAt:row.updated_at};const f=FIELDS[kind];for(const [k,col] of Object.entries(f))out[k]=row[col]??'';
 if(kind==='tasks'){const t=row.lead_id?'lead':row.client_id?'client':row.deal_id?'deal':'';out.linkedType=t;out.linkedId=t?row[t+'_id']:'';}
 return out;
}
function toRow(kind,rec){const out={};for(const [k,col] of Object.entries(FIELDS[kind]))if(Object.prototype.hasOwnProperty.call(rec,k))out[col]=rec[k]===''&&['followup','close_date','due_date'].includes(col)?null:rec[k];
 if(['catalog','service_plans','time_entries','stock_movements','projects','contracts','expenses'].includes(kind)){for(const k of ['unit_price','unit_cost','reorder_point','price','hourly_rate','delta','budget','value','amount'])if(out[k]!==undefined){if(out[k]===null||String(out[k]).trim()==='')out[k]=0;else out[k]=Number(out[k]);if(!Number.isFinite(out[k])||(['budget','value','amount'].includes(k)&&out[k]<0))throw Error('Invalid or negative amount');}}if(['projects','contracts','expenses'].includes(kind)){for(const col of ['client_id','project_id','start_date','due_date','expense_date'])if(out[col]==='')out[col]=null;if(out.start_date&&out.due_date&&out.start_date>out.due_date)throw Error('End date cannot be before start date.');if(out.title!==undefined&&!String(out.title).trim())throw Error('Title is required.');if(out.title!==undefined&&String(out.title).length>300)throw Error('Title is too long.');}if(kind==='checklists'&&out.is_done!==undefined)out.is_done=out.is_done===true||out.is_done==='true';if(kind==='catalog'){delete out.stock_qty;}if(kind==='calendar'){for(const col of ['client_id','lead_id','assigned_to'])if(out[col]==='')out[col]=null;}if(kind==='jobs'){for(const col of ['client_id','lead_id','scheduled_start','scheduled_end'])if(out[col]==='')out[col]=null;}if(kind==='documents'){for(const col of ['client_id','job_id','due_date'])if(out[col]==='')out[col]=null;if(out.amount!==undefined)out.amount=Number(out.amount);}if(['equipment','service_plans','time_entries','checklists','stock_movements'].includes(kind)){for(const col of ['client_id','job_id','catalog_id','installed_on','warranty_until'])if(out[col]==='')out[col]=null;}if(kind==='deals'){for(const col of ['client_id','lead_id'])if(out[col]==='')out[col]=null;if(out.value!==undefined){out.value=Number(out.value);if(!Number.isFinite(out.value)||out.value<0)throw Error('Invalid deal amount');}}
 if(kind==='tasks'&&(Object.hasOwn(rec,'linkedType')||Object.hasOwn(rec,'linkedId'))){out.lead_id=null;out.client_id=null;out.deal_id=null;const typ=rec.linkedType||'';const id=rec.linkedId||'';if(typ&&id&&['lead','client','deal'].includes(typ))out[typ+'_id']=id;}
 return out;
}
async function audit(action,kind,label){/* Server-side CRM audit triggers record changes atomically. */}
async function list(kind){
 const rows=[],pageSize=500,maxRecords=10000;
 for(let offset=0;offset<maxRecords;offset+=pageSize){
  const page=await secured('/rest/v1/'+table(kind)+'?select=*&org_id=eq.'+encodeURIComponent(orgId)+'&order=created_at.desc&limit='+pageSize+'&offset='+offset);
  if(!Array.isArray(page))throw Error('Invalid CRM data response');
  rows.push(...page);
  if(page.length<pageSize)return rows.map(x=>fromRow(kind,x));
 }
 throw Error('Too many '+kind+' records to load safely. Please use a filtered export.');
}
async function listPayments(){
 const rows=[],pageSize=500,maxRecords=10000;
 for(let offset=0;offset<maxRecords;offset+=pageSize){
  const batch=await secured('/rest/v1/crm_payments?select=*&org_id=eq.'+encodeURIComponent(orgId)+'&order=received_at.desc&limit='+pageSize+'&offset='+offset);
  if(!Array.isArray(batch))throw Error('Invalid payments response.');
  rows.push(...batch);
  if(batch.length<pageSize)return rows;
 }
 throw Error('Too many payments to load safely.');
}
async function getData(){
 const [email_queue,email_templates,projects,contracts,expenses,leads,clients,deals,tasks,jobs,documents,calendar,notifications,catalog,equipment,technicians,time_entries,checklists,service_plans,stock_movements,activity]=await Promise.all([list('email_queue'),list('email_templates'),list('projects'),list('contracts'),list('expenses'),list('leads'),list('clients'),list('deals'),list('tasks'),list('jobs'),list('documents'),list('calendar'),secured('/rest/v1/crm_notifications?select=*&org_id=eq.'+orgId+'&order=created_at.desc&limit=100'),list('catalog'),list('equipment'),list('technicians'),list('time_entries'),list('checklists'),list('service_plans'),list('stock_movements'),secured('/rest/v1/crm_activities?select=*&org_id=eq.'+orgId+'&order=created_at.desc&limit=150')]);
 return {email_queue,email_templates,projects,contracts,expenses,leads,clients,deals,tasks,jobs,documents,calendar,notifications,catalog,equipment,technicians,time_entries,checklists,service_plans,stock_movements,payments:await listPayments(),activity:activity.map(x=>({...x,createdAt:x.created_at,actor:'CRM team'})),users:['owner','admin'].includes(member?.role)?(await secured('/functions/v1/nexabridge-team-admin',{method:'POST',body:{action:'list'}}).catch(()=>({members:[]}))).members:[],directory:(await secured('/functions/v1/nexabridge-team-admin',{method:'POST',body:{action:'directory'}}).catch(()=>({members:[]}))).members||[],settings:defaultSettings};
}
function csv(v){let s=String(v??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
function csvExport(kind,records){const cols=['id',...Object.keys(FIELDS[kind]),'createdAt','updatedAt'];return '\ufeff'+[cols.map(csv).join(','),...records.map(r=>cols.map(k=>csv(r[k])).join(','))].join('\r\n')}
async function adapter(input,init={}){
 const u=typeof input==='string'?input:input.url;
 if(!u.startsWith('/api/'))return err('Unsupported URL',403);
 const parsed=new URL(u,'https://crm.nexabridge.invalid'),path=decodeURIComponent(parsed.pathname.slice(5)),method=(init.method||'GET').toUpperCase();let b={};
 if(init.body!==undefined)try{b=typeof init.body==='string'?JSON.parse(init.body):init.body}catch{return err('Invalid JSON')}
 try{
 if(path==='status')return reply({setup_required:false,setup_token_required:false,version:'2.0-professional-online'});
 if(path==='accept-invite'&&method==='POST'){
 const at=String(b.accessToken||''),rt=String(b.refreshToken||''),password=String(b.password||'');
 if(!at||!rt||password.length<12||password.length>72)return err('Invalid invitation or password',400);
 const resp=await fetch(URL_BASE+'/auth/v1/user',{method:'PUT',headers:{'apikey':PUBLIC_KEY,'Authorization':'Bearer '+at,'Content-Type':'application/json'},body:JSON.stringify({password}),cache:'no-store'});
 const result=await resp.json().catch(()=>({}));
 if(!resp.ok)throw Error(result.message||result.msg||'Unable to activate account');
 session={access_token:at,refresh_token:rt};saveSession();await loadMember();
 return reply({user:member,csrf:'supabase-auth'});
 }
 if(path==='login'&&method==='POST')return reply(await login(b.username,b.password));
 if(path==='me'&&method==='GET'){if(!session)throw Error('Please sign in.');try{await loadMember()}catch(e){if(session?.refresh_token){await refresh();await loadMember()}else throw e;}return reply({user:member,csrf:'supabase-auth'})}
 if(path==='logout'&&method==='POST'){try{await request('/auth/v1/logout',{method:'POST'})}catch{}session=null;member=null;orgId=null;saveSession();return reply({ok:true})}
 if(!session||!orgId)return err('Please sign in.',401);
 if(path==='data'&&method==='GET')return reply(await getData());
 // Official Google Sheets links: CRM stores pointers only, never Google tokens or file contents.
 if(path==='google-sheets'&&method==='GET'){
  const rows=await secured('/rest/v1/crm_google_sheets?select=id,google_sheet_id,title,added_by,created_at&org_id=eq.'+encodeURIComponent(orgId)+'&order=created_at.desc&limit=100');
  return reply(rows.map(row=>({id:row.id,title:row.title,addedBy:row.added_by,createdAt:row.created_at,url:'https://docs.google.com/spreadsheets/d/'+row.google_sheet_id+'/edit'})));
 }
 if(path==='google-sheets'&&method==='POST'){
  if(!['owner','admin','agent'].includes(member?.role))return err('Only authorized staff may link Google Sheets',403);
  let url;
  try{url=new URL(String(b.url||''))}catch(_){return err('Enter the full Google Sheets sharing URL',400)}
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com')return err('Only Google Sheets links from docs.google.com are supported',400);
  const match=/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,150})(?:\/(?:edit|view|copy|preview))?\/?$/.exec(url.pathname);
  if(!match)return err('Invalid Google Sheets file link',400);
  const title=String(b.title||'Google spreadsheet').trim().slice(0,120);
  if(!title)return err('A spreadsheet name is required',400);
  const saved=await secured('/rest/v1/crm_google_sheets?select=id,google_sheet_id,title,added_by,created_at',{
   method:'POST',body:{org_id:orgId,google_sheet_id:match[1],title,added_by:member.id},prefer:'return=representation'
  });
  return reply({id:saved[0].id,title:saved[0].title,url:'https://docs.google.com/spreadsheets/d/'+saved[0].google_sheet_id+'/edit'},201);
 }
 const googleMatch=/^google-sheets\/([a-f0-9-]{36})$/.exec(path);
 if(googleMatch&&method==='DELETE'){
  if(!['owner','admin','agent'].includes(member?.role))return err('Read-only account',403);
  const existing=await secured('/rest/v1/crm_google_sheets?select=id,added_by&id=eq.'+googleMatch[1]+'&org_id=eq.'+encodeURIComponent(orgId)+'&limit=1');
  if(!existing.length)return err('Google Sheets link not found',404);
  if(!['owner','admin'].includes(member.role)&&existing[0].added_by!==member.id)return err('You may only unlink your own Google Sheets',403);
  const rows=await secured('/rest/v1/crm_google_sheets?select=id&id=eq.'+googleMatch[1]+'&org_id=eq.'+encodeURIComponent(orgId),{method:'DELETE',prefer:'return=representation'});
  return reply({ok:rows.length===1});
 }

 // Sheets Studio: independently stored spreadsheet cells. Every row is org-scoped and RLS-protected.
 if(path==='sheets'&&method==='GET'){
  const sheets=await secured('/rest/v1/crm_spreadsheets?select=id,name,parent_id,created_at,updated_at,charts,formatting_rules,pivot_configs,protected_ranges&org_id=eq.'+encodeURIComponent(orgId)+'&order=updated_at.desc&limit=100');
  return reply(sheets);
 }
 if(path==='sheets'&&method==='POST'){
  if(!['owner','admin','agent'].includes(member?.role))return err('Read-only account',403);
  const name=String(b.name||'').trim().slice(0,120);if(!name)return err('Sheet name is required',400);
  let parentId=null;
  if(b.parentId){
   parentId=String(b.parentId);
   if(!/^[a-f0-9-]{36}$/i.test(parentId))return err('Invalid workbook ID');
   const found=await secured('/rest/v1/crm_spreadsheets?select=id&id=eq.'+encodeURIComponent(parentId)+'&parent_id=is.null&org_id=eq.'+encodeURIComponent(orgId)+'&limit=1');
   if(!found.length)return err('Workbook not found or access denied',404);
   const tabs=await secured('/rest/v1/crm_spreadsheets?select=id&parent_id=eq.'+encodeURIComponent(parentId)+'&org_id=eq.'+encodeURIComponent(orgId)+'&limit=20');
   if(tabs.length>=19)return err('Maximum 20 tabs per workbook');
  }
  const rows=await secured('/rest/v1/crm_spreadsheets?select=*&org_id=eq.'+encodeURIComponent(orgId),{method:'POST',body:{org_id:orgId,name,created_by:member.id,parent_id:parentId},prefer:'return=representation'});
  return reply(rows[0],201);
 }
 const sheetMatch=/^sheets\/([a-f0-9-]{36})(?:\/(cell|bulk|comments|history)(?:\/([A-Z]{1,3}[1-9][0-9]{0,4}))?)?$/.exec(path);
 if(sheetMatch){
  const id=sheetMatch[1],action=sheetMatch[2]||'',addressParam=sheetMatch[3]||'',filter='&org_id=eq.'+encodeURIComponent(orgId);
  const base='/rest/v1/crm_spreadsheets?select=*&id=eq.'+encodeURIComponent(id)+filter;
  const sheets=await secured(base);
  if(!sheets.length)return err('Spreadsheet not found or access denied',404);
  if(!action&&method==='GET'){
   const cells=[];
   for(let offset=0;offset<10000;offset+=500){
    const batch=await secured('/rest/v1/crm_sheet_cells?select=address,raw_value,revision,updated_by,updated_at&sheet_id=eq.'+encodeURIComponent(id)+filter+'&order=address.asc&offset='+offset+'&limit=500');
    cells.push(...batch);if(batch.length<500)break;
   }
   return reply({sheet:sheets[0],cells});
  }
  if(!action&&method==='PATCH'){
   if(!['owner','admin'].includes(member?.role))return err('Only Owner/Admin can edit spreadsheet configurations',403);
   const changes={},allowedCharts=['bar','line','pie','doughnut','area','scatter','horizontal'];
   if(Object.prototype.hasOwnProperty.call(b,'name')){
    const newName=String(b.name||'').trim();
    if(!newName||newName.length>120)return err('Invalid spreadsheet name',400);
    changes.name=newName;
   }
   if(Object.prototype.hasOwnProperty.call(b,'charts')){
    if(!Array.isArray(b.charts)||b.charts.length>30||JSON.stringify(b.charts).length>16000)return err('Invalid chart definitions');
    changes.charts=b.charts.map(c=>({id:String(c.id||'').slice(0,45),title:String(c.title||'Chart').slice(0,80),
     type:allowedCharts.includes(c.type)?c.type:'bar',category:String(c.category||'A').slice(0,3),
     measure:String(c.measure||'B').slice(0,3),aggregate:['sum','count','average'].includes(c.aggregate)?c.aggregate:'sum',color:/^#[0-9a-f]{6}$/i.test(c.color||'')?c.color:'#8268e8',showValues:c.showValues===true,maxRows:Math.max(10,Math.min(10000,Math.floor(Number(c.maxRows)||500)))}));
   }
   if(Object.prototype.hasOwnProperty.call(b,'formatting_rules')){
    if(!Array.isArray(b.formatting_rules)||b.formatting_rules.length>40)return err('Maximum 40 conditional formatting rules');
    const ops=['greater','less','equals','contains','notEmpty','empty','between'];
    const range=/^[A-Z]{1,3}[1-9][0-9]{0,4}:[A-Z]{1,3}[1-9][0-9]{0,4}$/;
    changes.formatting_rules=b.formatting_rules.map((x,i)=>{
     if(!range.test(x.range)||!ops.includes(x.operator)||!/^#[a-f0-9]{6}$/i.test(x.background||''))throw Error('Invalid formatting rule '+(i+1));
     return {id:String(x.id||'').slice(0,48),range:x.range,operator:x.operator,
      value:String(x.value||'').slice(0,120),value2:String(x.value2||'').slice(0,120),
      background:x.background,foreground:/^#[a-f0-9]{6}$/i.test(x.foreground||'')?x.foreground:'#27334d'};
    });
   }
   if(Object.prototype.hasOwnProperty.call(b,'pivot_configs')){
    if(!Array.isArray(b.pivot_configs)||b.pivot_configs.length>20)return err('Maximum 20 pivot tables');
    changes.pivot_configs=b.pivot_configs.map((x,i)=>{
     if(!/^[A-Z]{1,2}$/.test(x.rowColumn)||!/^[A-Z]{1,2}$/.test(x.valueColumn)||!['sum','count','average','min','max'].includes(x.aggregate))throw Error('Invalid pivot configuration '+(i+1));
     const col=x.columnColumn||'';
     if(col&&!/^[A-Z]{1,2}$/.test(col))throw Error('Invalid pivot column');
     return {id:String(x.id||'').slice(0,48),title:String(x.title||'Pivot summary').slice(0,80),
      rowColumn:x.rowColumn,columnColumn:col,valueColumn:x.valueColumn,aggregate:x.aggregate,skipHeader:x.skipHeader!==false};
    });
   }
   if(Object.prototype.hasOwnProperty.call(b,'protected_ranges')){
    if(!Array.isArray(b.protected_ranges)||b.protected_ranges.length>30)return err('Maximum 30 protected ranges');
    const range=/^[A-Z]{1,3}[1-9][0-9]{0,4}:[A-Z]{1,3}[1-9][0-9]{0,4}$/;
    changes.protected_ranges=b.protected_ranges.map((x,i)=>{
     if(!range.test(x.range))throw Error('Invalid protected range '+(i+1));
     return {id:String(x.id||'').slice(0,48),range:x.range,description:String(x.description||'Restricted range').slice(0,160)};
    });
   }

   if(Object.prototype.hasOwnProperty.call(b,'cell_styles')){
    if(!b.cell_styles||typeof b.cell_styles!=='object'||Array.isArray(b.cell_styles))return err('Invalid cell styles');
    const styles=Object.entries(b.cell_styles);
    if(styles.length>1200||JSON.stringify(b.cell_styles).length>140000)return err('Too many cell styles');
    const sanitized={};
    for(const [address,x] of styles){
     if(!/^[A-Z]{1,2}[1-9][0-9]{0,3}$/.test(address)||!x||typeof x!=='object'||Array.isArray(x))return err('Invalid style address');
     const rule={};
     if(x.bold===true)rule.bold=true;
     if(x.italic===true)rule.italic=true;
     if(['left','center','right'].includes(x.align))rule.align=x.align;
     if(/^#[0-9a-f]{6}$/i.test(x.background||''))rule.background=x.background;
     if(/^#[0-9a-f]{6}$/i.test(x.color||''))rule.color=x.color;
     if(['plain','currency','percent','number','date'].includes(x.format))rule.format=x.format;
     if(Object.keys(rule).length)sanitized[address]=rule;
    }
    changes.cell_styles=sanitized;
   }
   if(Object.prototype.hasOwnProperty.call(b,'validation_rules')){
    if(!Array.isArray(b.validation_rules)||b.validation_rules.length>40)return err('Too many validation rules');
    const range=/^[A-Z]{1,2}[1-9][0-9]{0,3}:[A-Z]{1,2}[1-9][0-9]{0,3}$/;
    changes.validation_rules=b.validation_rules.map((x,i)=>{
     if(!x||!range.test(x.range)||!['number','email','date','list'].includes(x.type))throw Error('Invalid validation rule '+(i+1));
     const values=Array.isArray(x.values)?x.values.map(v=>String(v).slice(0,100)).slice(0,30):[];
     if(x.type==='list'&&!values.length)throw Error('List validation requires values');
     return {range:x.range,type:x.type,values};
    });
   }
   if(Object.prototype.hasOwnProperty.call(b,'view_settings')){
    const x=b.view_settings;
    if(!x||typeof x!=='object'||Array.isArray(x))return err('Invalid view settings');
    const col=/^[A-Z]$/;
    const sort=x.sort&&col.test(x.sort.column||'')&&['asc','desc'].includes(x.sort.direction)?{column:x.sort.column,direction:x.sort.direction}:null;
    const filter=x.filter&&col.test(x.filter.column||'')?{column:x.filter.column,contains:String(x.filter.contains||'').slice(0,100)}:null;
    changes.view_settings={sort,filter,freezeRows:x.freezeRows===true,freezeColumns:x.freezeColumns===true};
   }
   if(!Object.keys(changes).length)return err('No supported configuration supplied');
   changes.updated_at=new Date().toISOString();
   const rows=await secured('/rest/v1/crm_spreadsheets?select=*&id=eq.'+encodeURIComponent(id)+filter,
     {method:'PATCH',body:changes,prefer:'return=representation'});
   return reply(rows[0]||{ok:false});
  }
  if(action==='comments'){
   const url='/rest/v1/crm_sheet_comments';
   const scope='&sheet_id=eq.'+encodeURIComponent(id)+filter;
   if(method==='GET'){
    const address=parsed.searchParams.get('address');
    const addr=address&&/^[A-Z]{1,3}[1-9][0-9]{0,4}$/.test(address)?'&address=eq.'+address:'';
    const rows=await secured(url+'?select=id,address,body,parent_id,resolved,created_at,updated_at,author_id'+scope+addr+'&order=created_at.asc&limit=500');
    return reply(rows);
   }
   if(method==='POST'){
    if(!['owner','admin','agent'].includes(member?.role))return err('Read-only access',403);
    const address=String(b.address||'').toUpperCase(),body=String(b.body||'').trim();
    if(!/^[A-Z]{1,3}[1-9][0-9]{0,4}$/.test(address)||!body||body.length>4000)return err('Invalid comment address or text');
    let parent_id=null;
    if(b.parent_id){
     if(!/^[a-f0-9-]{36}$/i.test(String(b.parent_id)))return err('Invalid parent');
     const parents=await secured(url+'?select=id,address&id=eq.'+encodeURIComponent(b.parent_id)+scope+'&limit=1');
     if(!parents.length||parents[0].address!==address)return err('Parent must belong to the same sheet cell');
     parent_id=String(b.parent_id);
    }
    const saved=await secured(url+'?select=*&sheet_id=eq.'+encodeURIComponent(id)+filter,
     {method:'POST',body:{org_id:orgId,sheet_id:id,address,body,parent_id,author_id:member.id},prefer:'return=representation'});
    return reply(saved[0],201);
   }
   if(method==='PATCH'){
    const commentId=String(b.id||'');
    if(!/^[a-f0-9-]{36}$/i.test(commentId))return err('Invalid comment ID');
    const rows=await secured(url+'?select=*&id=eq.'+commentId+scope);
    if(!rows.length)return err('Comment not found',404);
    if(member.id!==rows[0].author_id&&!['owner','admin'].includes(member?.role))return err('Only the author or administrator can update this comment',403);
    const updates={updated_at:new Date().toISOString()};
    if(typeof b.resolved==='boolean')updates.resolved=b.resolved;
    if(Object.prototype.hasOwnProperty.call(b,'body')){
     const value=String(b.body||'').trim();if(!value||value.length>4000)return err('Invalid comment text');
     updates.body=value;
    }
    const saved=await secured(url+'?select=*&id=eq.'+commentId+scope,{method:'PATCH',body:updates,prefer:'return=representation'});
    return reply(saved[0]||{ok:false});
   }
   return err('Unsupported comment action',405);
  }
  if(action==='history'&&method==='GET'){
   if(!addressParam)return err('A cell address is required');
   const offset=Math.max(0,Math.min(100000,Number.parseInt(parsed.searchParams.get('offset')||'0',10)||0));
   const rows=await secured('/rest/v1/crm_sheet_cell_history?select=id,address,old_value,new_value,revision,changed_by,changed_at&sheet_id=eq.'+
    encodeURIComponent(id)+filter+'&address=eq.'+addressParam+'&order=changed_at.desc,id.desc&offset='+offset+'&limit=100');
   return reply(rows);
  }
  if(!action&&method==='DELETE'){
   if(!['owner','admin'].includes(member?.role))return err('Only Owner/Admin can remove sheets',403);
   const rows=await secured('/rest/v1/crm_spreadsheets?id=eq.'+encodeURIComponent(id)+filter,{method:'DELETE',prefer:'return=representation'});
   return reply({ok:rows.length>0});
  }
  const validateSheetValue=(address,value)=>{
   if(!value||String(value).startsWith('='))return '';
   const point=/^([A-Z]{1,2})([1-9][0-9]{0,3}|10000)$/.exec(address);
   if(!point)return 'Invalid cell address';
   const column=x=>x.split('').reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
   const col=column(point[1]),row=Number(point[2]);
   for(const rule of (sheets[0].validation_rules||[])){
    if(!rule.range)continue;
    const parts=String(rule.range).split(':').map(x=>/^([A-Z]{1,2})([1-9][0-9]{0,3}|10000)$/.exec(x));
    if(parts.length!==2||parts.some(x=>!x))continue;
    const [a,b]=parts;
    if(row<Math.min(+a[2],+b[2])||row>Math.max(+a[2],+b[2])||col<Math.min(column(a[1]),column(b[1]))||col>Math.max(column(a[1]),column(b[1])))continue;
    if(rule.type==='number'&&!Number.isFinite(Number(value)))return 'Cell '+address+' requires a number';
    if(rule.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return 'Cell '+address+' requires an email';
    if(rule.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||isNaN(Date.parse(value))))return 'Cell '+address+' requires YYYY-MM-DD';
    if(rule.type==='list'&&!(Array.isArray(rule.values)&&rule.values.includes(value)))return 'Cell '+address+' is not in the allowed list';
   }
   return '';
  };
  if(action==='cell'&&method==='POST'){
   if(!['owner','admin','agent'].includes(member?.role))return err('Read-only account',403);
   const address=String(b.address||'').toUpperCase(),value=String(b.value??'');
   const revision=Number(b.revision);
   if(!/^[A-Z]{1,3}[1-9][0-9]{0,4}$/.test(address)||value.length>4000)return err('Invalid cell address or value length',400);
   if(!Number.isSafeInteger(revision)||revision<0)return err('Invalid cell revision',400);
   const validationError=validateSheetValue(address,value);if(validationError)return err(validationError,400);
   const row={sheet_id:id,org_id:orgId,address,raw_value:value,updated_by:member.id,updated_at:new Date().toISOString()};
   if(revision===0){
    try{
     const inserted=await secured('/rest/v1/crm_sheet_cells?select=*&sheet_id=eq.'+encodeURIComponent(id)+filter,{method:'POST',body:{...row,revision:1},prefer:'return=representation'});
     return reply(inserted[0],201);
    }catch(e){if(/duplicate|23505|conflict|409/i.test(e.message))return err('Cell changed in another session. Reload before saving.',409);throw e}
   }
   const updated=await secured('/rest/v1/crm_sheet_cells?select=*&sheet_id=eq.'+encodeURIComponent(id)+'&address=eq.'+address+'&revision=eq.'+revision+filter,{method:'PATCH',body:{...row,revision:revision+1},prefer:'return=representation'});
   if(!updated.length)return err('Cell changed in another session. Reload before saving.',409);
   return reply(updated[0]);
  }
  if(action==='bulk'&&method==='POST'){
   if(!['owner','admin','agent'].includes(member?.role))return err('Read-only account',403);
   const entries=Array.isArray(b.cells)?b.cells:[];
   if(!entries.length||entries.length>300)return err('Bulk import permits 1–300 cells per batch',400);
   const unique=new Set(),rows=[];
   for(const entry of entries){
    const address=String(entry.address||'').toUpperCase(),value=String(entry.value??'');
    if(!/^[A-Z]{1,3}[1-9][0-9]{0,4}$/.test(address)||value.length>4000||unique.has(address))return err('Duplicate/invalid cell or cell too long',400);
    const validationError=validateSheetValue(address,value);if(validationError)return err(validationError,400);
    unique.add(address);rows.push({sheet_id:id,org_id:orgId,address,raw_value:value,revision:1,updated_by:member.id});
   }
   const saved=await secured('/rest/v1/crm_sheet_cells?select=address&on_conflict=sheet_id,address',{method:'POST',body:rows,prefer:'resolution=ignore-duplicates,return=representation'});
   return reply({inserted:saved.length,attempted:rows.length},201);
  }
 }

 if(path==='stock'&&method==='POST'){const row={org_id:orgId,catalog_id:b.catalogId,job_id:b.jobId||null,delta:Number(b.delta),reason:b.reason||'adjustment',notes:b.notes||''};if(!Number.isFinite(row.delta)||!row.delta)return err('Invalid quantity',400);const r=await secured('/rest/v1/crm_stock_movements?select=*&org_id=eq.'+orgId,{method:'POST',body:row,prefer:'return=representation'});return reply(r[0],201)}
 if(path==='team'&&method==='POST')return reply(await secured('/functions/v1/nexabridge-team-admin',{method:'POST',body:b}));
 if(path.startsWith('notifications/')&&method==='PATCH'){const id=path.split('/')[1];const list=await secured('/rest/v1/crm_notifications?select=id&id=eq.'+id+'&org_id=eq.'+orgId,{method:'PATCH',body:{read_at:new Date().toISOString()},prefer:'return=representation'});return reply(list[0]||{ok:false});}
 if(path==='payments'&&method==='POST'){if(!b.documentId||!Number.isFinite(Number(b.amount))||Number(b.amount)<=0)return err('Invalid payment',400);const row={org_id:orgId,document_id:b.documentId,amount:Number(b.amount),method:b.method||'other',reference:b.reference||'',notes:b.notes||''};const result=await secured('/rest/v1/crm_payments?select=*&org_id=eq.'+orgId,{method:'POST',body:row,prefer:'return=representation'});return reply(result[0],201)}
 if(path==='health'&&method==='GET'){const check=await secured('/rest/v1/crm_organizations?select=id&id=eq.'+orgId+'&limit=1');return reply({status:check.length===1?'ok':'error',mode:'online',database:check.length===1?'reachable':'unavailable',checkedAt:new Date().toISOString()});}
 if(path==='backup'&&method==='GET'){return new Response(JSON.stringify({...await getData(),exportedAt:new Date().toISOString()},null,2),{headers:{'Content-Type':'application/json'}})}
 if(path.startsWith('export/')&&path.endsWith('.csv')&&method==='GET'){const kind=path.slice(7,-4);if(!table(kind))return err('Unknown type',404);return new Response(csvExport(kind,await list(kind)),{headers:{'Content-Type':'text/csv; charset=utf-8'}})}
 if(path==='settings'&&method==='PUT')return err('Online company settings require administrator configuration.',403);
 if(path==='import'&&method==='POST')return err('Import is disabled for safety in the online version.',403);
 if(path.startsWith('users'))return err('Manage team users from Supabase dashboard.',403);
 if(path==='account/password'&&method==='POST'){
  const current=String(b.current||''),password=String(b.password||'');
  if(!current||password.length<12||password.length>72||password===current)return err('Use a different password of 12–72 characters and enter your current password.',400);
  const identity=await secured('/auth/v1/user');
  if(!identity?.email)return err('Unable to verify your account.',401);
  const check=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:identity.email,password:current}}).catch(()=>null);
  if(!check?.access_token)return err('Current password is incorrect.',401);
  const updated=await fetch(URL_BASE+'/auth/v1/user',{method:'PUT',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+check.access_token,'Content-Type':'application/json'},body:JSON.stringify({password}),cache:'no-store'});
  if(!updated.ok){const detail=await updated.json().catch(()=>({}));return err(detail?.msg||detail?.message||'Unable to update password.',updated.status);}
  try{await fetch(URL_BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+check.access_token}})}catch{}
  session=null;member=null;orgId=null;saveSession();
  return reply({success:true,signInRequired:true});
 }
 if(path==='change-password' || path==='password')return err('Use the secure account password form.',403);
 const pieces=path.split('/');
 if(pieces[0]==='convert'&&pieces.length===2&&method==='POST'){
  const r=await secured('/rest/v1/crm_leads?select=*&id=eq.'+pieces[1]+'&org_id=eq.'+orgId);if(r.length!==1)throw Error('Lead not found');const lead=r[0];if(lead.status==='converted')throw Error('Lead already converted');
  const [client]=await secured('/rest/v1/crm_clients?select=*&org_id=eq.'+orgId,{method:'POST',body:{org_id:orgId,name:lead.company||lead.name,contact:lead.name,email:lead.email,phone:lead.phone,notes:lead.notes},prefer:'return=representation'});
  await secured('/rest/v1/crm_leads?id=eq.'+lead.id+'&org_id=eq.'+orgId,{method:'PATCH',body:{status:'converted'},prefer:'return=minimal'});await audit('convert','leads',lead.name);return reply({ok:true,clientId:client.id});
 }
 if(pieces[0]==='records'&&table(pieces[1])){
  const kind=pieces[1],id=pieces[2],target='/rest/v1/'+table(kind);if(pieces.length===2&&method==='POST'){
   const row={...toRow(kind,b),org_id:orgId};const [created]=await secured(target+'?select=*&org_id=eq.'+orgId,{method:'POST',body:row,prefer:'return=representation'});await audit('create',kind,created.name||created.title);return reply(fromRow(kind,created),201);
  }
  if(!id)return err('Record ID is required',400);
  if(pieces.length===3&&method==='PUT'){
   const row=toRow(kind,b);const updated=await secured(target+'?select=*&id=eq.'+id+'&org_id=eq.'+orgId,{method:'PATCH',body:row,prefer:'return=representation'});if(!updated.length)return err('Record not found or access denied',404);await audit('update',kind,updated[0].name||updated[0].title);return reply(fromRow(kind,updated[0]));
  }
  if(pieces.length===3&&method==='DELETE'){
   if(!member||!['owner','admin'].includes(member.role))return err('Only an Owner or Admin can delete records.',403);
   if(kind==='documents'){
    const payments=await secured('/rest/v1/crm_payments?select=id&org_id=eq.'+encodeURIComponent(orgId)+'&document_id=eq.'+encodeURIComponent(id)+'&limit=1');
    if(payments.length)return err('Cannot delete a document with recorded payments. Preserve the invoice and its financial history.',409);
   }
   const deleted=await secured(target+'?select=id&org_id=eq.'+orgId+'&id=eq.'+id,{method:'DELETE',prefer:'return=representation'});if(!deleted.length)return err('Record not found or delete permission denied',403);await audit('delete',kind,id);return reply({ok:true});
  }
 }
 return err('Unsupported operation',403);
 }catch(e){return err(e.message||'Request failed',/sign in|authorized|token|JWT/i.test(e.message)?401:400)}
}
const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{
 const u=typeof input==='string'?input:input.url;
 if(u.startsWith('/api/'))return adapter(input,init);
 return nativeFetch(input,init);
};
})();

