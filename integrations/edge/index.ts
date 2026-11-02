// NexaBridge Gmail v3. No service-role key required; all reads enforce user RLS.
const ORIGIN='https://nexabridgesolutioncrm.github.io';
const ORG='95ad2508-9580-418c-8f98-46f998f01ea3';
const MAILBOX='nexabridgeops@gmail.com';
const HEADERS={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};
const writes=new Set(['send','reply','replyAll','sendDocument']);
const actions=new Set(['status','inbox','sent','read','history','previewDocument',...writes]);
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9-]{36}$/i.test(s);
async function signed(payload:string,secret:string){const e=new TextEncoder();const key=await crypto.subtle.importKey('raw',e.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,e.encode(payload)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply({error:'Origin denied'},403);
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
  const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY');
  const auth=req.headers.get('authorization')||'';
  if(!base||!key||!/^Bearer \S+$/.test(auth))fail('CRM login required',401);
  const headers={Authorization:auth,apikey:key!};
  const get=async(path:string)=>{const r=await fetch(base+path,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)fail(path.startsWith('/auth')?'Invalid CRM session':'Access denied',path.startsWith('/auth')?401:403);return r.json()};
  const u=await get('/auth/v1/user');if(!uuid(u.id))fail('Invalid CRM session',401);
  const members=await get('/rest/v1/crm_members?select=role&org_id=eq.'+ORG+'&user_id=eq.'+encodeURIComponent(u.id));
  if(!Array.isArray(members)||!members.some((m:{role:string})=>['owner','admin'].includes(m.role)))fail('NexaBridge Owner or Admin required',403);
  if(Number(req.headers.get('content-length'))>7500000)fail('Request too large',413);
  // Bound streamed bodies as well; Content-Length is not trusted.
  const reader=req.body?.getReader();if(!reader)fail('JSON body required');
  const parts:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader!.read();if(done)break;length+=value.length;if(length>7500000){await reader!.cancel();fail('Request too large',413)}parts.push(value)}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
  let b;try{b=JSON.parse(new TextDecoder().decode(bytes))}catch{fail('Invalid JSON')}
  const action=new URL(req.url).searchParams.get('action')||'status';
  if(!actions.has(action))fail('Unsupported operation',404);
  const url=Deno.env.get('NEXA_APPS_SCRIPT_URL'),secret=Deno.env.get('NEXA_APPS_SCRIPT_SECRET');
  if(!url||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)||!secret||secret.length<64)fail('Gmail connector is not configured',503);
  const data:Record<string,unknown>={};
  // Never forward caller-supplied actor, organization, nonce, timestamp or documents.
  for(const field of ['limit','offset','email','id','to','subject','body','pdfBase64','filename','confirmedRecipients'])if(b[field]!==undefined)data[field]=b[field];
  if(writes.has(action)&&(!/^\d{13}_[a-f0-9-]{36}$/i.test(b.requestId||'')))fail('Stable send request ID required');
  if(['previewDocument','sendDocument'].includes(action)){
   if(!uuid(b.documentId))fail('Invalid document ID');
   const docs=await get('/rest/v1/crm_documents?select=*&org_id=eq.'+ORG+'&id=eq.'+encodeURIComponent(b.documentId));
   if(docs.length!==1)fail('Document not found',404);
   const d=docs[0];if(d.status==='void')fail('Document is void');
   if(action==='sendDocument'&&(!b.documentVersion||b.documentVersion!==d.updated_at))fail('Document changed; preview and confirm it again',409);
   if(d.client_id&&(!d.bill_to_name||!d.bill_to_email)){
    const clients=await get('/rest/v1/crm_clients?select=name,email&org_id=eq.'+ORG+'&id=eq.'+encodeURIComponent(d.client_id));
    if(clients.length){d.bill_to_name=d.bill_to_name||clients[0].name;d.bill_to_email=d.bill_to_email||clients[0].email;}
   }
   data.document=d;
   if(action==='sendDocument'){
    if(String(b.to||'').toLowerCase()!==String(d.bill_to_email||'').toLowerCase())fail('Recipient changed; preview again',409);
    data.to=d.bill_to_email;
   }
  }
  const payload=JSON.stringify({action,data,actor:u.id,requestId:b.requestId,timestamp:Date.now(),nonce:crypto.randomUUID()});
  let upstream=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({payload,signature:await signed(payload,secret)}),redirect:'manual',signal:AbortSignal.timeout(60000)});
  // Apps Script ContentService redirects its result to Google. Never replay the POST.
  if([302,303].includes(upstream.status)){
   const location=upstream.headers.get('location');let destination:URL;try{destination=new URL(location||'')}catch{fail('Invalid Google response',502)}
   if(destination!.protocol!=='https:'||destination!.hostname!=='script.googleusercontent.com')fail('Unexpected Google redirect',502);
   upstream=await fetch(destination!,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000)});
  }
  if(!upstream.ok)fail('Google connector request failed',502);
  const result=await upstream.json().catch(()=>null);
  if(!result||result.ok!==true)fail(result?.error||'Google did not confirm success',502);
  if(action==='status'){
   if(result.mailbox!==MAILBOX||result.connected!==true||result.version!==3)fail('Gmail account or connector version mismatch',502);
   return reply({connected:true,configured:true,mailbox:MAILBOX,message:'Connected to '+MAILBOX,version:3});
  }
  if(writes.has(action)&&result.sent!==true)fail('Gmail did not confirm sending',502);
  return reply(result);
 }catch(error){const e=error as Error & {status?:number};return reply({error:e.status?e.message:'Mail operation unavailable. If sending, check Sent before retrying; reuse the same request ID.'},e.status||502)}
});
