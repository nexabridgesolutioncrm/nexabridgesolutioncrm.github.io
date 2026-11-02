/** NexaBridge Gmail protocol v3. Secrets belong ONLY in Script Properties.
 * Deploy only after NEXA_MAILBOX, NEXA_SHARED_SECRET (64+ random chars) are set.
 * Use integrations/edge/index.ts with this version. Never log request bodies.
 */
const NEXA_MAILBOX_ = 'nexabridgeops@gmail.com';
function nexaResult_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function nexaEqual_(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;
}
function nexaHash_(s) {return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(x=>(x&255).toString(16).padStart(2,'0')).join('');}
function nexaSignature_(s,key) {return Utilities.computeHmacSha256Signature(s,key,Utilities.Charset.UTF_8).map(x=>(x&255).toString(16).padStart(2,'0')).join('');}
function nexaAccount_() {
  if(Session.getEffectiveUser().getEmail().toLowerCase()!==NEXA_MAILBOX_)throw Error('Wrong execution account');
}
function nexaText_(value,max,required) {
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Invalid text');return value;
}
function nexaAddress_(value) {
  const s=nexaText_(value,254,true).trim();if(!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(s))throw Error('Invalid recipient');return s;
}
function nexaId_(id){if(typeof id!=='string'||!/^[a-f0-9]{12,32}$/i.test(id))throw Error('Invalid message ID');return id;}
function nexaMessage_(m,full) {
  const body=m.getPlainBody();return {id:m.getId(),threadId:m.getThread().getId(),from:m.getFrom(),to:m.getTo(),cc:m.getCc(),subject:m.getSubject(),date:m.getDate().toISOString(),snippet:body.slice(0,400),...(full?{body:body.slice(0,200000),truncated:body.length>200000}: {})};
}
function nexaRecipients_(m,all) {
  const raw=[m.getReplyTo()||m.getFrom()];if(all)raw.push(m.getTo(),m.getCc());
  const own=[NEXA_MAILBOX_].concat(GmailApp.getAliases()).map(x=>x.toLowerCase());
  return Array.from(new Set((raw.join(',').match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g)||[]).filter(x=>!own.includes(x.toLowerCase()))));
}
function nexaRate_(props,key,limit,period,now) {
  const k='rate_'+key;let r=JSON.parse(props.getProperty(k)||'null');if(!r||r.expires<=now)r={count:0,expires:now+period};
  if(r.count>=limit)throw Error('Rate limit reached; try later');r.count++;props.setProperty(k,JSON.stringify(r));
}
function doGet(){return nexaResult_({ok:false,error:'Authenticated POST required'});}
function doPost(e) {
  let lock;
  try {
    nexaAccount_();
    const props=PropertiesService.getScriptProperties(),secret=props.getProperty('NEXA_SHARED_SECRET');
    if(props.getProperty('NEXA_MAILBOX')!==NEXA_MAILBOX_||!secret||secret.length<64)throw Error('Connector not configured');
    const raw=e&&e.postData&&e.postData.contents;
    if(typeof raw!=='string'||raw.length>9500000)throw Error('Invalid request');
    const env=JSON.parse(raw);if(typeof env.payload!=='string'||!nexaEqual_(env.signature,nexaSignature_(env.payload,secret)))throw Error('Not authorized');
    const p=JSON.parse(env.payload),now=Date.now();
    if(!Number.isFinite(p.timestamp)||Math.abs(now-p.timestamp)>120000||!/^[-a-f0-9]{36}$/i.test(p.nonce||'')||!/^[-a-f0-9]{36}$/i.test(p.actor||''))throw Error('Invalid request freshness');
    lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('Connector busy; retry with the same request ID');
    const all=props.getProperties();let records=0;
    Object.keys(all).filter(k=>/^(nonce_|send_|rate_)/.test(k)).forEach(k=>{const r=JSON.parse(all[k]);if(r.expires<now)props.deleteProperty(k);else records++;});
    if(records>1200)throw Error('Connector capacity reached');
    if(props.getProperty('nonce_'+p.nonce))throw Error('Replay denied');
    props.setProperty('nonce_'+p.nonce,JSON.stringify({expires:now+180000}));
    nexaRate_(props,'global',60,60000,now);
    const writing=['send','reply','replyAll','sendDocument'].includes(p.action),b=p.data||{};
    if(!writing)return nexaResult_(nexaRead_(p.action,b));
    if(!/^\d{13}_[a-f0-9-]{36}$/i.test(p.requestId||''))throw Error('A stable request ID is required');
    const created=Number(p.requestId.split('_')[0]);if(created>now+120000||now-created>=86400000)throw Error('Request ID expired; check Sent before creating a new request');
    const k='send_'+nexaHash_(p.actor+':'+p.requestId),hash=nexaHash_(JSON.stringify({action:p.action,data:b}));
    const previous=JSON.parse(props.getProperty(k)||'null');
    if(previous){if(previous.hash!==hash)throw Error('Request ID conflict');if(previous.state==='sent')return nexaResult_({...previous.result,duplicate:true});throw Error('Send outcome uncertain; check Sent before attempting another send');}
    const ready=nexaPrepare_(p.action,b);
    nexaRate_(props,'send',20,3600000,now);
    props.setProperty(k,JSON.stringify({expires:created+86400000+180000,hash,state:'pending'}));
    // Persist before Gmail side effect. On uncertain failure do not send again automatically.
    const result=ready();
    props.setProperty(k,JSON.stringify({expires:created+86400000+180000,hash,state:'sent',result}));
    return nexaResult_(result);
  }catch(err){
    const allowed=/^(Wrong execution account|Connector not configured|Invalid |Not authorized|Replay denied|Rate limit|Connector busy|Connector capacity|A stable|Request ID|Send outcome|Document |Recipient |Message |Unsupported|PDF |Reply recipients)/;
    return nexaResult_({ok:false,error:allowed.test(String(err.message))?String(err.message):'Connector operation failed; check Sent before retrying a send'});
  }finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function nexaRead_(action,b){
  if(action==='status'){GmailApp.getInboxThreads(0,1);return {ok:true,connected:true,mailbox:NEXA_MAILBOX_,version:3};}
  if(['inbox','sent','history'].includes(action)){
    const limit=Math.max(1,Math.min(30,Math.floor(Number(b.limit)||20))),offset=Math.max(0,Math.min(1000,Math.floor(Number(b.offset)||0)));
    let query=action==='inbox'?'in:inbox':action==='sent'?'in:sent':'{from:'+nexaAddress_(b.email)+' to:'+nexaAddress_(b.email)+'}';
    const threads=GmailApp.search(query,offset,limit);
    const messages=threads.map(t=>{const ms=t.getMessages();const m=action==='sent'?(ms.filter(x=>x.getFrom().toLowerCase().includes(NEXA_MAILBOX_)).pop()):ms[ms.length-1];return m?nexaMessage_(m,false):null;}).filter(Boolean);
    return {ok:true,messages,nextOffset:threads.length===limit?offset+limit:null};
  }
  if(action==='read'){
    const m=GmailApp.getMessageById(nexaId_(b.id));if(!m)throw Error('Message not found');
    return {ok:true,message:nexaMessage_(m,true),replyTo:nexaRecipients_(m,false),replyAllTo:nexaRecipients_(m,true)};
  }
  if(action==='previewDocument'){
    const pdf=nexaPdf_(b.document);return {ok:true,pdfBase64:Utilities.base64Encode(pdf.getBytes()),filename:pdf.getName(),documentVersion:b.document.updated_at};
  }
  throw Error('Unsupported operation');
}
function nexaPrepare_(action,b){
  const body=nexaText_(b.body,20000,true);
  if(action==='reply'||action==='replyAll'){
    const m=GmailApp.getMessageById(nexaId_(b.id));if(!m)throw Error('Message not found');
    const recipients=nexaRecipients_(m,action==='replyAll');
    if(!recipients.length||JSON.stringify(recipients)!==JSON.stringify(b.confirmedRecipients))throw Error('Reply recipients changed; review again');
    return ()=>{if(action==='replyAll')m.replyAll(body,{name:'NexaBridge Solutions'});else m.reply(body,{name:'NexaBridge Solutions'});return {ok:true,sent:true,threadId:m.getThread().getId(),mailbox:NEXA_MAILBOX_};};
  }
  const to=nexaAddress_(b.to),subject=nexaText_(b.subject,200,true);if(/[\r\n]/.test(subject))throw Error('Invalid subject');
  const opts={name:'NexaBridge Solutions'};
  if(action==='sendDocument'){
    if(to.toLowerCase()!==nexaAddress_(b.document.bill_to_email).toLowerCase())throw Error('Recipient does not match document');
    opts.attachments=[nexaPdf_(b.document)];
  }else if(b.pdfBase64){
    if(typeof b.pdfBase64!=='string'||b.pdfBase64.length>7000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.pdfBase64))throw Error('PDF attachment invalid or too large');
    const bytes=Utilities.base64Decode(b.pdfBase64);
    if(bytes.length>5000000||bytes.length<5||bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70||bytes[4]!==45)throw Error('PDF attachment invalid or too large');
    opts.attachments=[Utilities.newBlob(bytes,'application/pdf',String(b.filename||'document.pdf').replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,100).replace(/(?:\.pdf)?$/i,'.pdf'))];
  }
  return ()=>{const m=GmailApp.createDraft(to,subject,body,opts).send();return {ok:true,sent:true,id:m.getId(),threadId:m.getThread().getId(),mailbox:NEXA_MAILBOX_};};
}
function nexaDocumentHtml_(d){
  if(!d||!['invoice','estimate'].includes(d.doc_type)||!d.number||!d.bill_to_name||!d.issue_date||!Array.isArray(d.items)||!d.items.length||d.items.length>300)throw Error('Document missing required details');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>{const n=Number(v);if(v===null||v===''||!Number.isFinite(n)||n<0)throw Error('Document invalid financial value');return n;};
  let cents=0;const rows=d.items.map(i=>{const qty=num(i.quantity),price=num(i.unit_price);if(!qty||!String(i.description||'').trim())throw Error('Document invalid line item');const total=Math.round(qty*price*100);cents+=total;return '<tr><td dir="auto">'+esc(i.description)+'</td><td>'+qty+'</td><td>'+price.toFixed(2)+'</td><td>'+(total/100).toFixed(2)+'</td></tr>';}).join('');
  const discount=Math.round(num(d.discount_amount)*100),rate=num(d.tax_rate),tax=Math.round((cents-discount)*rate/100),total=cents-discount+tax;
  if(discount>cents||rate>100||Math.round(num(d.subtotal)*100)!==cents||Math.round(num(d.tax_amount)*100)!==tax||Math.round(num(d.amount)*100)!==total)throw Error('Document totals do not match line items');
  if(!/^[A-Z]{3}$/.test(d.currency||''))throw Error('Document currency missing');
  const money=n=>(n/100).toFixed(2)+' '+esc(d.currency),note=(label,value)=>value?'<h3>'+label+'</h3><p dir="auto">'+esc(value)+'</p>':'';
  return '<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;color:#173248;font-size:11px;line-height:1.5}h1{font-size:28px}h2{font-size:20px;color:#166c85}h3{font-size:12px}p{white-space:pre-wrap;overflow-wrap:break-word}table{width:100%;border-collapse:collapse;margin:20px 0}thead{display:table-header-group}tr{page-break-inside:avoid}td,th{padding:9px;border-bottom:1px solid #dce4e8;text-align:left}th{background:#edf4f6}.totals{margin-left:45%;page-break-inside:avoid}.footer{border-top:2px solid #d9b442;margin-top:30px;font-size:10px}</style></head><body><h1>NexaBridge Solutions</h1><p>BUSINESS SERVICES · '+NEXA_MAILBOX_+'</p><h2>'+(d.doc_type==='estimate'?'ESTIMATE':'INVOICE')+' '+esc(d.number)+'</h2><p>Issue date: '+esc(d.issue_date)+'\n'+(d.doc_type==='estimate'?'Valid until':'Due date')+': '+esc(d.due_date||'Not specified')+'</p><h3>Bill to</h3><p dir="auto">'+[d.bill_to_name,d.bill_to_email,d.bill_to_phone,d.bill_to_address].filter(Boolean).map(esc).join('\n')+'</p>'+note('Reference',d.reference)+'<table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount ('+esc(d.currency)+')</th></tr></thead><tbody>'+rows+'</tbody></table><div class="totals"><p>Subtotal: '+money(cents)+'\nDiscount: '+money(discount)+'\nTax ('+rate+'%): '+money(tax)+'</p><h2>Total: '+money(total)+'</h2></div>'+note('Payment / estimate terms',d.payment_terms)+note('Notes',d.notes)+'<p class="footer" dir="auto">'+esc(d.footer_text||'Thank you for working with NexaBridge Solutions.')+'\nThis document is not proof of payment.</p></body></html>';
}
function nexaPdf_(d){
  const html=nexaDocumentHtml_(d);const pdf=Utilities.newBlob(html,'text/html','document.html').getAs('application/pdf');
  pdf.setName((d.doc_type==='estimate'?'Estimate-':'Invoice-')+String(d.number).replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,80)+'.pdf');
  if(pdf.getBytes().length>5000000)throw Error('PDF attachment too large');return pdf;
}
function testNexaReadOnly(){nexaAccount_();const s=nexaRead_('status',{}),inbox=nexaRead_('inbox',{limit:1}),sent=nexaRead_('sent',{limit:1});if(inbox.messages.length)nexaRead_('read',{id:inbox.messages[0].id});console.log(JSON.stringify({connected:s.connected,mailbox:s.mailbox,inbox:inbox.messages.length,sent:sent.messages.length,read:inbox.messages.length>0}));}
