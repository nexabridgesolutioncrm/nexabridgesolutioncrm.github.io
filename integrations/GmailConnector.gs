/**
 * NexaBridge CRM Gmail Connector — Apps Script.
 * Configure Script Properties:
 *   NEXA_SHARED_SECRET: random 64+ character secret (also store in Supabase function secrets)
 *   NEXA_MAILBOX: nexabridgeops@gmail.com
 * Deploy as Web App: Execute as Me. Public access ONLY after secret is configured
 * and the server-to-server request path has been tested.
 * Do not expose the secret in GitHub, the web page, or a browser.
 */
function testGmailConnection() {
  const address = Session.getEffectiveUser().getEmail();
  Logger.log("Account: " + address);
  Logger.log("Recent conversations: " + GmailApp.getInboxThreads(0, 5).length);
}
function respond_(x) {
  return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);
}
function secureEquals_(a,b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let mismatch = a.length ^ b.length;
  for (let i=0;i<Math.max(a.length,b.length);i++) mismatch |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return mismatch === 0;
}
function doPost(e) {
  try {
    const cfg = PropertiesService.getScriptProperties();
    const secret=cfg.getProperty("NEXA_SHARED_SECRET");
    const mailbox=cfg.getProperty("NEXA_MAILBOX");
    if(!secret || secret.length<40 || mailbox!=="nexabridgeops@gmail.com") return respond_({ok:false,error:"Connector not configured"});
    const b=JSON.parse(e.postData&&e.postData.contents||"{}");
    if(!secureEquals_(b.secret,secret)) return respond_({ok:false,error:"Not authorized"});
    const now=Date.now(),ts=Number(b.timestamp),nonce=String(b.nonce||"");
    if(!Number.isFinite(ts)||Math.abs(now-ts)>120000||!/^[a-f0-9-]{20,80}$/i.test(nonce))return respond_({ok:false,error:"Invalid request freshness"});
    const cache=CacheService.getScriptCache(),nonceKey="nonce_"+nonce;
    if(cache.get(nonceKey))return respond_({ok:false,error:"Replay denied"});
    cache.put(nonceKey,"1",180);
    const action=String(b.action||"");
    if(action==="status")return respond_({ok:true,mailbox:mailbox});
    if(action==="inbox"){
      const threads=GmailApp.getInboxThreads(0,Math.min(Number(b.limit)||20,30));
      return respond_({ok:true,messages:threads.map(t=>{
        const m=t.getMessages().slice(-1)[0];
        return {id:m.getId(),threadId:t.getId(),from:m.getFrom(),subject:m.getSubject(),date:m.getDate().toISOString(),snippet:m.getPlainBody().slice(0,400)};
      })});
    }
    if(action==="reply"){
      const id=String(b.id||""),body=String(b.body||"").trim();
      if(!/^[0-9a-f]{12,32}$/i.test(id)||!body||body.length>20000)return respond_({ok:false,error:"Invalid reply"});
      const message=GmailApp.getMessageById(id);
      if(!message)return respond_({ok:false,error:"Message not found"});
      message.reply(body,{name:"NexaBridge Solutions"});
      return respond_({ok:true,sent:true});
    }
    if(action==="send"){
      const to=String(b.to||"").trim(),subject=String(b.subject||"").trim(),body=String(b.body||"");
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||!subject||subject.length>200||!body||body.length>20000)return respond_({ok:false,error:"Invalid email"});
      const options={name:"NexaBridge Solutions"};
      if(b.pdfBase64){
        const base64=String(b.pdfBase64);
        if(base64.length>9000000)return respond_({ok:false,error:"PDF too large"});
        const bytes=Utilities.base64Decode(base64);
        if(bytes.length<5||bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70)return respond_({ok:false,error:"Invalid PDF attachment"});
        const name=String(b.filename||"NexaBridge-document.pdf").replace(/[^a-zA-Z0-9_.-]/g,"_").slice(0,100);
        options.attachments=[Utilities.newBlob(bytes,"application/pdf",name)];
      }
      GmailApp.sendEmail(to,subject,body,options);
      return respond_({ok:true,sent:true});
    }
    return respond_({ok:false,error:"Unknown action"});
  } catch(err) {return respond_({ok:false,error:"Connector request failed"});}
}
