import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHmac,createHash} from 'node:crypto';
import {SignJWT} from 'jose';
import {loadMigrationPlan} from '../scripts/data-migrations.mjs';
import {setup} from './helpers/cowrieCommerce.mjs';
import {BENCHMARK_PHASES} from '../scripts/approved-benchmark-budget.mjs';
const origin='https://wybp-capacity-private-r002.netlify.app';
test('compiled isolated harness enforces private ingress and meters actual D1/authority game with recovery and retry',async()=>{
 const config=JSON.parse(await readFile('outputs/netlify-worker/benchmark-package/wrangler.json','utf8'));
 assert.equal(config.no_bundle,true);assert.equal(config.find_additional_modules,false);
 assert.equal(resolve(config.main),resolve('outputs/netlify-worker/benchmark-package/worker/benchmarkEntrypoint.js'));
 assert.equal(createHash('sha256').update(await readFile(config.main)).digest('hex'),config.vars.WYBP_BENCHMARK_SOURCE_SHA256);
 const bindings={...config.vars,WYBP_BENCHMARK_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),WYBP_DRIVE_CLIENT_ID:'synthetic-client',WYBP_DRIVE_CLIENT_SECRET:'synthetic-secret',WYBP_DRIVE_REFRESH_TOKEN:'synthetic-refresh',WYBP_DRIVE_FOLDER_ID:'synthetic_root_folder',WYBP_DRIVE_SHARD_FOLDER_IDS:JSON.stringify(Array.from({length:16},(_,i)=>'synthetic_child_'+i)),WYBP_RESTORE_RECEIPT_SHA256:'d'.repeat(64),WYBP_NETLIFY_PROXY_SECRET:'synthetic-proxy-'.repeat(4),WYBP_BENCHMARK_ACCESS:Buffer.from('benchmark:synthetic-private-password-1234').toString('base64'),WYBP_BENCHMARK_CONTROLLER_SECRET:'synthetic-controller-'.repeat(4)};
 const files=new Map();let nextId=0;
 const provider=async request=>{
  const url=new URL(request.url);
  if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'synthetic-access',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'});
  assert.equal(url.hostname,'www.googleapis.com');assert.equal(request.headers.get('authorization'),'Bearer synthetic-access');
  if(url.pathname.endsWith('/generateIds'))return Response.json({ids:['synthetic_file_'+nextId++]});
  if(url.pathname.startsWith('/upload/')){
   const bytes=Buffer.from(await request.arrayBuffer()),text=bytes.toString(),metadata=JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]);
   const marker=Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),start=bytes.indexOf(marker)+marker.length,end=bytes.lastIndexOf(Buffer.from('\r\n--'));
   if(files.has(metadata.id))return new Response(null,{status:409});files.set(metadata.id,{...metadata,bytes:bytes.subarray(start,end)});return Response.json({id:metadata.id});
  }
  const id=url.pathname.split('/').at(-1);
  if(id.startsWith('synthetic_child_'))return Response.json({id,mimeType:'application/vnd.google-apps.folder',parents:[bindings.WYBP_DRIVE_FOLDER_ID],trashed:false});
  const file=files.get(id);if(!file)return new Response(null,{status:404});
  return url.searchParams.has('alt')?new Response(file.bytes):Response.json({id,name:file.name,parents:file.parents,trashed:false});
 };
 const mf=new Miniflare({workers:[
  {name:config.name,modules:true,scriptPath:resolve('outputs/netlify-worker/benchmark-package/worker/benchmarkEntrypoint.js'),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings,d1Databases:{DB:'synthetic-benchmark-d1'},outboundService:provider,assets:{directory:resolve('outputs/netlify-worker/benchmark-package/assets'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},serviceBindings:{BENCHMARK_AUTHORITY:{name:config.name,entrypoint:'BenchmarkAuthority'},BENCHMARK_PLAYER:{name:config.name,entrypoint:'BenchmarkPlayer'}}},
  {name:'local-outage-fixture',modules:true,scriptPath:resolve('outputs/netlify-worker/benchmark-package/worker/benchmarkEntrypoint.js'),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...bindings,WYBP_BENCHMARK_PHASE:'C'},d1Databases:{DB:'synthetic-benchmark-d1'},outboundService:provider,assets:{directory:resolve('outputs/netlify-worker/benchmark-package/assets'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},serviceBindings:{BENCHMARK_AUTHORITY:{name:'local-outage-fixture',entrypoint:'BenchmarkAuthority'},BENCHMARK_PLAYER:{name:'local-outage-fixture',entrypoint:'BenchmarkPlayer'}}},
  {name:'local-caller',modules:true,compatibilityDate:config.compatibility_date,serviceBindings:{HTTP:config.name,OP:{name:config.name,entrypoint:'BenchmarkOperator'},OPC:{name:'local-outage-fixture',entrypoint:'BenchmarkOperator'}},script:'export default {async fetch(request,env){const value=await request.json();if(new URL(request.url).pathname==="/http")return env.HTTP.fetch(new Request(value.url,value.init));return Response.json(await (new URL(request.url).pathname==="/outage"?env.OPC:env.OP).execute(value.command,value.upper));}}'},
 ]});
 const c=await setup();
 try{
  const db=await mf.getD1Database('DB');for(const migration of await loadMigrationPlan())await db.batch(migration.statements.map(sql=>db.prepare(sql)));
  for(const table of ['quiz_editions','questions']){
   const rows=c.database.prepare('SELECT * FROM '+table).all(),columns=Object.keys(rows[0]);
   for(let i=0;i<rows.length;i+=25)await db.batch(rows.slice(i,i+25).map(row=>db.prepare('INSERT INTO '+table+'('+columns.map(x=>'"'+x+'"').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').bind(...columns.map(x=>row[x]))));
  }
  await db.prepare("INSERT INTO retention_restore VALUES('active',?,?)").bind(bindings.WYBP_RESTORE_RECEIPT_SHA256,Date.now()).run();
  await db.prepare("INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('journal','journal',?,0,?,0,'idle',1,?,?)").bind('0'.repeat(64),'0'.repeat(64),Date.now(),Date.now()+2592000000).run();
  const worker=await mf.getWorker(config.name);
  const local=await mf.getWorker('local-caller');
  const http=(url,init)=>local.fetch('http://localhost/http',{method:'POST',body:JSON.stringify({url,init})});
  assert.equal((await worker.fetch(origin+'/')).status,404);
  const sign=()=>new SignJWT({netlify_id:bindings.WYBP_NETLIFY_PROJECT_ID,deploy_context:'production',site_url:origin}).setProtectedHeader({alg:'HS256'}).setIssuer('netlify').setExpirationTime('1m').sign(new TextEncoder().encode(bindings.WYBP_NETLIFY_PROXY_SECRET));
  const headers=async auth=>({'x-nf-sign':await sign(),...(auth?{authorization:'Basic '+bindings.WYBP_BENCHMARK_ACCESS}:{})});
  assert.equal((await worker.fetch(origin+'/',{headers:await headers(false)})).status,401);
  assert.equal((await worker.fetch(origin+'/recover-index',{method:'POST',headers:await headers(true)})).status,404);
  const observed=Object.fromEntries(Object.keys(BENCHMARK_PHASES.B.caps).map(k=>[k,0])),perKind={};
  const call=async command=>{
   const body=JSON.stringify({command,upper:BENCHMARK_PHASES.B.caps}),at=String(Date.now());
   const h={...await headers(true),origin,'content-type':'application/json','x-wybp-benchmark-time':at,'x-wybp-benchmark-signature':createHmac('sha256',bindings.WYBP_BENCHMARK_CONTROLLER_SECRET).update(at+'\n'+body).digest('hex')};
   const response=await http(origin+'/game',{method:'POST',headers:h,body});assert.equal(response.status,200);const value=await response.json();assert.equal(value.billingKnown,true);
   for(const [k,n] of Object.entries(value.usage)){assert.ok(Number.isSafeInteger(n)&&n>=0);observed[k]=k==='storageBytes'?Math.max(observed[k],n):observed[k]+n;}
   const peak=perKind[command.kind]||={calls:0,peak:{}};peak.calls++;for(const [k,n] of Object.entries(value.usage))peak.peak[k]=Math.max(peak.peak[k]||0,n);
   return value;
  };
  const command={identity:'synthetic_compiled_west',region:'west'},started=await call({...command,kind:'start'});
  assert.equal(started.result.questionCount,12);assert.ok(started.usage.writes>0);assert.ok(started.usage.reads>0);assert.ok(started.usage.driveObjects>0);assert.ok(started.usage.internal>0);
  for(let question=1;question<=12;question++){
   assert.equal((await call({...command,kind:'answer',question,...started.result.answerPlan[question-1]})).result.accepted,true);
   if(question===7){const recovered=await call({...command,kind:'recover'});assert.equal(recovered.result.selectionHash,started.result.selectionHash);assert.equal(recovered.result.additionalAttempts,0);assert.equal(recovered.result.chargeCount,0);}
  }
  const completed=await call({...command,kind:'complete'});assert.equal(completed.result.persisted,true);
  assert.equal((await call({...command,kind:'complete'})).result.completionReceipt,completed.result.completionReceipt);
  const result=await call({...command,kind:'result'});assert.equal(result.result.sharingVerified,true);assert.equal(result.result.assetsVerified,true);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM answers').first()).n,12);assert.equal((await db.prepare('SELECT COUNT(*) n FROM quiz_attempts').first()).n,1);
  console.log(JSON.stringify({fixture:'local compiled game including refresh and completion replay; not hosted capacity',observed,perKind}));
  const flushResponse=await local.fetch('http://localhost/operator',{method:'POST',body:JSON.stringify({command:{kind:'flush',id:'synthetic_flush_verified'},upper:BENCHMARK_PHASES.B.caps})});
  const flushed=await flushResponse.json();assert.equal(flushed.billingKnown,true);assert.equal(flushed.result.chainVerified,true);assert.equal(flushed.result.durableReadback,true);assert.equal(flushed.result.remainingBacklog,0);
  const before=(await db.prepare('SELECT COUNT(*) n FROM cowrie_wallets').first()).n;
  const invalid=await http(origin+'/game',{method:'POST',headers:{...await headers(true),origin,'content-type':'application/json'},body:'{}'});assert.equal(invalid.status,503);assert.equal((await db.prepare('SELECT COUNT(*) n FROM cowrie_wallets').first()).n,before);
  const fixture=async step=>(await (await local.fetch('http://localhost/outage',{method:'POST',body:JSON.stringify({command:{kind:'fixture-step',step},upper:BENCHMARK_PHASES.C.caps})})).json());
  const aged=await fixture(0);assert.equal(aged.billingKnown,true);assert.equal(aged.result.games,5);assert.equal(aged.result.answers,60);assert.ok(aged.usage.writes>70);assert.ok(aged.usage.reads>0);
  assert.equal((await fixture(0)).result.replayed,true);assert.equal((await db.prepare('SELECT COUNT(*) n FROM quiz_attempts').first()).n,6);assert.equal((await db.prepare('SELECT COUNT(*) n FROM answers').first()).n,72);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM cowrie_wallets w JOIN retention_closures c ON c.wallet_id=w.id WHERE w.state='deleted' AND w.closed_at=c.closed_at").first()).n,1);
  const mappingCount=(await db.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%'").first()).n;
  assert.ok(mappingCount>0);
  await db.prepare("INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('synthetic_loss_replay','restore',?,7,?,7,'complete',1,?,?)").bind('a'.repeat(64),'a'.repeat(64),Date.now(),Date.now()+2592000000).run();
  const replayCommand={kind:'simulate-index-loss',job:'synthetic_loss_replay',pointer:{sha256:'a'.repeat(64)}};
  const replay=async command=>(await (await local.fetch('http://localhost/operator',{method:'POST',body:JSON.stringify({command,upper:BENCHMARK_PHASES.B.caps})})).json());
  assert.equal((await replay(replayCommand)).result.failed,true); // never claim blocked while access is active
  await db.prepare('DELETE FROM retention_restore').run();
  assert.equal((await replay(replayCommand)).result.replayed,true);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%'").first()).n,mappingCount);
  assert.equal((await replay({...replayCommand,pointer:{sha256:'b'.repeat(64)}})).result.failed,true);
  await db.prepare("UPDATE operational_recovery_checkpoints SET state='importing' WHERE id='authority-writer'").run();
  const independentFiles=files.size;
  const busyCapture=await replay({kind:'capture',captureId:'synthetic_busy_capture'});assert.equal(busyCapture.result.failed,true);assert.equal(busyCapture.billingKnown,true);assert.equal(files.size,independentFiles);
  assert.equal((await db.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='journal'").first()).state,'idle');
 }finally{c.database.close();await mf.dispose();}
});
