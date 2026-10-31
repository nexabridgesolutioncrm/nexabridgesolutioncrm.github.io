import {createHandler} from './gmail-gateway.mjs';
import assert from 'node:assert/strict';
const origin='https://nexabridgesolutioncrm.github.io';
const env=n=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public',GMAIL_APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'}[n]);
const req=(body,headers={},method='POST')=>new Request('https://example.com',{method,headers:{origin,Authorization:'Bearer testtoken',...headers},body:method==='POST'?JSON.stringify(body):undefined});
let calls=0;
let handler=createHandler(env,async()=>{calls++;throw Error('No network expected')});
assert.equal((await handler(req({action:'inbox'},{origin:'https://evil.example'}))).status,403);
assert.equal((await handler(req({action:'inbox'},{Authorization:''}))).status,401);
assert.equal((await handler(req({action:'delete'}))).status,400);
assert.equal((await handler(req({}, {},'GET'))).status,405);
assert.equal(calls,0);
for(const role of ['viewer','agent']){
 let i=0;handler=createHandler(env,async()=>new Response(JSON.stringify(i++===0?{id:'user'}:[{org_id:'95ad2508-9580-418c-8f98-46f998f01ea3',role}])));
 assert.equal((await handler(req({action:'inbox'}))).status,403);
}
for(const role of ['owner','admin']){
 let i=0;handler=createHandler(env,async(url,opts)=>{
  if(i++===0)return Response.json({id:'user'});
  if(i===2)return Response.json([{org_id:'95ad2508-9580-418c-8f98-46f998f01ea3',role}]);
  assert.equal(JSON.parse(opts.body).token,'testtoken');return Response.json({success:true,connected:true});
 });assert.equal((await handler(req({action:'status',token:'attacker'}))).status,200);
}
let i=0;handler=createHandler(env,async()=>Response.json(i++===0?{id:'user'}:[{org_id:'another-org',role:'owner'}]));
assert.equal((await handler(req({action:'inbox'}))).status,403);
console.log('9 gateway security tests passed (mocked; not a live Gmail test).');
