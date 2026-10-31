// Deploy only after Apps Script consent and integration tests pass.
export function createHandler(env, fetcher = fetch) {
 const origin='https://nexabridgesolutioncrm.github.io';
 return async request => {
  const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
  const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers});
  if(request.headers.get('origin')!==origin)return json({error:'Origin not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer [^\s]+$/.test(auth))return json({error:'Authentication required'},401);
  try {
   const raw=await request.text();if(raw.length>70000)return json({error:'Request too large'},413);
   const body=JSON.parse(raw);
   if(!['status','inbox','sent','read','send'].includes(body.action))return json({error:'Unsupported action'},400);
   const base=env('SUPABASE_URL'),key=env('SUPABASE_ANON_KEY');
   const opts={headers:{apikey:key,Authorization:auth},signal:AbortSignal.timeout(15000)};
   const u=await fetcher(base+'/auth/v1/user',opts);if(!u.ok)return json({error:'Invalid session'},401);
   const user=await u.json();if(!user.id)return json({error:'Invalid session'},401);
   const m=await fetcher(base+'/rest/v1/crm_members?select=org_id,role&user_id=eq.'+encodeURIComponent(user.id),opts);
   if(!m.ok)return json({error:'Membership verification failed'},403);
   const members=await m.json();
   if(!Array.isArray(members)||!members.some(x=>x.org_id==='95ad2508-9580-418c-8f98-46f998f01ea3'&&['owner','admin'].includes(x.role)))return json({error:'Administrator access required'},403);
   const url=env('GMAIL_APPS_SCRIPT_URL');
   if(!url||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))return json({error:'Gmail integration is not configured'},503);
   const result=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,token:auth.slice(7)}),signal:AbortSignal.timeout(45000),redirect:'follow'});
   if(!result.ok)return json({error:'Gmail unavailable'},502);
   const data=await result.json();
   if(data.success!==true)return json({error:data.error||'Gmail operation failed'},400);
   return json(data);
  }catch {return json({error:'Gmail request failed; for sends, check Sent before retrying.'},502)}
 };
}
if(typeof Deno!=='undefined')Deno.serve(createHandler(name=>Deno.env.get(name)));
