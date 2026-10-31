import {DurableObject} from 'cloudflare:workers';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID,createHash} from 'node:crypto';
import {installedRetainedGrant,retainedHash} from './retainedBenchmarkPolicy.mjs';
import {RetainedBenchmarkLedger} from './retainedBenchmarkLedger.mjs';
import {RetainedJobs} from './retainedJobs.mjs';
const fail=()=>{throw Error('retained_coordinator_stopped');},hash=b=>createHash('sha256').update(b).digest('hex');
// The one isolated coordinator accounts for SQL with conservative measured upper
// bounds. Actual cursor metadata must fit that bound; otherwise stop, never zero.
export class RetainedCoordinator extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);this.grant=installedRetainedGrant(env);this.scope=new AsyncLocalStorage();this.bootstrap={reads:0,writes:0};this.next=0;this.active=0;this.queued=0;this.gate=Promise.resolve();this.profiles=new Map();
  if(ctx.id.toString()!==env.RETAINED_COORDINATOR.idFromName(this.grant.id).toString())fail();
  const observe=(text,args)=>{const cursor=ctx.storage.sql.exec(text,...args),rows=cursor.toArray(),s=this.scope.getStore()||this.bootstrap;if(!Number.isSafeInteger(cursor.rowsRead)||!Number.isSafeInteger(cursor.rowsWritten))fail();s.reads+=cursor.rowsRead;s.writes+=cursor.rowsWritten;return rows;};
  this.db={exec:text=>observe(text,[]),prepare:text=>({get:(...args)=>observe(text,args)[0],all:(...args)=>observe(text,args),run:(...args)=>{observe(text,args);return {};}})};
  this.ledger=new RetainedBenchmarkLedger(this.db,this.grant,{transaction:f=>ctx.storage.transactionSync(f),cold:true});
  this.db.exec("CREATE TABLE IF NOT EXISTS retained_io(id TEXT PRIMARY KEY,parent TEXT NOT NULL,identity TEXT NOT NULL,state TEXT NOT NULL,status INTEGER,receipt TEXT); CREATE TABLE IF NOT EXISTS retained_responses(id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS retained_rate(id INTEGER PRIMARY KEY,next_at INTEGER NOT NULL); INSERT INTO retained_rate VALUES(1,0) ON CONFLICT(id) DO NOTHING;");
  this.db.exec('CREATE INDEX IF NOT EXISTS retained_io_parent ON retained_io(parent);');
  this.next=this.db.prepare('SELECT next_at FROM retained_rate WHERE id=1').get().next_at;
  this.jobs=new RetainedJobs(this.db,Buffer.from(env.WYBP_BENCHMARK_KEY_BASE64||'','base64'),this.ledger,{cold:true});
  this.db.exec('CREATE TABLE IF NOT EXISTS retained_metrics(kind TEXT NOT NULL,bucket INTEGER NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(kind,bucket));');
 }
 async #call(work,{largeRead=false,writes=8,readLimit,runnerInvocations=0,profile='ledger',controllerIngress=false}={}){
  const counters={reads:this.bootstrap.reads,writes:this.bootstrap.writes},bootstrap=counters.reads>0||counters.writes>0;this.bootstrap={reads:0,writes:0};const bound={reads:(readLimit??(largeRead?20000:48))+(bootstrap?100:0)+2,writes:writes+(bootstrap?64:0)+2};
  return this.scope.run(counters,async()=>{
   if(!this.ledger.overhead({...bound,runnerInvocations,controllerIngress,storageBytes:this.ctx.storage.sql.databaseSize}))fail();
   try{const value=await work(),charged={reads:counters.reads+2,writes:counters.writes+2};if(charged.reads>bound.reads||charged.writes>bound.writes)fail();const unusedRunners=runnerInvocations&&Array.isArray(value)?runnerInvocations-value.length:0;if(unusedRunners<0)fail();this.ledger.measuredOverhead({reserved:bound,charged,unusedRunners});
    const prior=this.profiles.get(profile)||{reads:0,writes:0};this.profiles.set(profile,{reads:Math.max(prior.reads,counters.reads),writes:Math.max(prior.writes,counters.writes),reserved:{reads:Math.max(prior.reserved?.reads||0,bound.reads),writes:Math.max(prior.reserved?.writes||0,bound.writes)}});if(counters.reads>charged.reads||counters.writes>charged.writes)fail();return value?.billingKnown===true?{...value,coordinatorSql:{reads:counters.reads,writes:counters.writes,reserved:bound,charged}}:value;}
   catch{this.ledger.stop();const prior=this.profiles.get(profile)||{reads:0,writes:0};this.profiles.set(profile,{reads:Math.max(prior.reads,counters.reads),writes:Math.max(prior.writes,counters.writes),reserved:bound,failed:true});throw Error('retained_coordinator_stopped');}
  });
 }
 reserve(id,identity,upper,options){return this.#call(()=>this.ledger.reserve(id,identity,upper,options));}
 settle(id,identity,actual,receipt,response,completion,sizes,observation){return this.#call(()=>{
  if(typeof response!=='string'||response.length>120000)fail();
  if(sizes)this.ledger.sizes(sizes);
  if(completion)this.ledger.completed(completion.id,completion.receipt);
  const result=this.ledger.settle(id,identity,actual,receipt);if(result.stopped)fail();
  const prior=this.db.prepare('SELECT body FROM retained_responses WHERE id=?').get(id);if(prior&&prior.body!==response)fail();
  if(!prior&&observation){
   if(!['wallet','start','answer','complete','order','webhook','confirmation','document','asset','other'].includes(observation.group)||![observation.applicationMs,observation.providerWaitMs,observation.status].every(n=>Number.isSafeInteger(n)&&n>=0)||observation.status<100||observation.status>599)fail();
   for(const [kind,n]of [[observation.group+':application',observation.applicationMs],[observation.group+':harness-provider-wait',observation.providerWaitMs],[observation.group+':status',observation.status]]){
    const bucket=kind.endsWith(':status')?n:[5,10,25,50,100,250,500,1000,2000,5000,10000,30000,60000,3600000].find(v=>n<=v);if(bucket===undefined)fail();
    this.db.prepare('INSERT INTO retained_metrics VALUES(?,?,1) ON CONFLICT(kind,bucket) DO UPDATE SET n=n+1').run(kind,bucket);
   }
  }
  this.db.prepare('INSERT INTO retained_responses VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(id,response);
  const io=this.db.prepare('SELECT state FROM retained_io WHERE parent=? LIMIT 1001').all(id);if(io.length>1000||io.some(r=>r.state!=='settled'))fail();
  // A durable parent receipt/cache now forbids execution on retry. Known child
  // I/O traces can be removed; unresolved parents/children are never compacted.
  this.db.prepare("DELETE FROM retained_io WHERE parent=? AND state='settled'").run(id);return result;
 },{largeRead:true,writes:3024});}
 operatorResponse(id){return this.#call(()=>{const r=this.db.prepare("SELECT r.body,t.actual,t.receipt FROM retained_responses r JOIN retained_tickets t ON t.id=r.id WHERE r.id=? AND t.state='settled'").get(id);return r?{body:r.body,usage:JSON.parse(r.actual),receipt:r.receipt}:null;},{writes:2});}
 response(id){return this.#call(()=>this.db.prepare('SELECT body FROM retained_responses WHERE id=?').get(id)?.body||null);}
 replayArrival(bytes){return this.#call(()=>{this.ledger.replayArrival(bytes);return {counted:true};},{writes:3});}
 started(id){return this.#call(()=>this.ledger.started(id),{writes:6});}
 phase(){return this.#call(()=>this.ledger.row().phase,{writes:2});}
 transition(phase,proof,controllerIngress=false){return this.#call(()=>{this.ledger.transition(phase,proof);if(phase==='cleanup')this.jobs.suspendOrdinary();},{largeRead:true,writes:phase==='cleanup'?320:4,controllerIngress});}
 stop(){return this.#call(()=>{this.ledger.stop();return {stopped:true};},{writes:4});}
 readback(controllerIngress=false){return this.#call(()=>({...this.ledger.readback(),databaseSizes:this.db.prepare('SELECT * FROM retained_sizes').all(),metrics:this.db.prepare('SELECT * FROM retained_metrics ORDER BY kind,bucket LIMIT 500').all(),ioCounts:this.db.prepare('SELECT state,COUNT(*) n FROM retained_io GROUP BY state').all(),instanceSqlDiagnostics:Object.fromEntries(this.profiles)}),{largeRead:true,writes:2,controllerIngress});}
 async acceptJob(definition,controllerIngress=false){const result=await this.#call(()=>this.jobs.accept(definition),{readLimit:128,writes:8,controllerIngress});const due=this.jobs.next();if(due!==null)await this.ctx.storage.setAlarm(Math.max(Date.now()+1,due));return result;}
 jobStatus(id,controllerIngress=false){return this.#call(()=>this.jobs.status(id),{writes:2,controllerIngress});}
 async dayPlan(definition,controllerIngress=false){const value=await this.#call(()=>this.jobs.plan(definition),{writes:5,controllerIngress});await this.ctx.storage.setAlarm(Date.now()+1);return value;}
 async alarm(){
  // At most8 admissions, each counting an indexed <=64 active queue. The
  // 5k-history query-plan regression prevents a hidden completed-job scan.
  await this.#call(()=>this.jobs.fill(),{readLimit:1024,writes:64,profile:'job-fill'});
  const jobs=await this.#call(()=>this.jobs.claim(),{readLimit:128,writes:36,runnerInvocations:8,profile:'job-claim'});
  const results=await Promise.all(jobs.map(async job=>{try{return await this.env.RETAINED_JOB_RUNNER.execute(job);}catch{return {known:false};}}));
  await this.#call(()=>{jobs.forEach((job,i)=>this.jobs.finish(job,results[i]));},{readLimit:128,writes:36,profile:'job-finish'});
  const due=this.jobs.next();if(due!==null)await this.ctx.storage.setAlarm(Math.max(Date.now()+1,due));
 }
 async dispatch(parent,input,init={}){
  const url=new URL(input),method=init.method||'GET';
  if(url.protocol!=='https:'||url.username||url.password||url.hash||!(url.hostname==='oauth2.googleapis.com'&&url.pathname==='/token'&&method==='POST'||url.hostname==='www.googleapis.com'&&/^\/(?:upload\/)?drive\/v3\//.test(url.pathname))||!['GET','POST','PUT','PATCH','DELETE'].includes(method))fail();
  const body=init.body==null?null:typeof init.body==='string'?Buffer.from(init.body):init.body instanceof URLSearchParams?Buffer.from(init.body.toString()):Buffer.from(init.body);
  if(body&&body.length>4000000||this.queued>=64)fail();this.queued++;const received=Date.now();let issued=false;
  const identity=retainedHash([parent,url.href,method,init.headers||{},body?.toString('base64')||'']),id=hash(randomUUID());
  return this.#call(async()=>{
   const admission=this.gate.then(async()=>{
    while(this.active>=16)await new Promise(r=>setTimeout(r,10));
    while(this.next>Date.now())await new Promise(r=>setTimeout(r,this.next-Date.now()));
    const state=this.ledger.row(),ticket=this.db.prepare('SELECT state FROM retained_tickets WHERE id=?').get(parent),cleanup=this.db.prepare('SELECT id FROM retained_cleanup_tickets WHERE id=?').get(parent);
    if((state.stopped&&!cleanup)||Date.now()>=state.deadline||ticket?.state!=='pending'||cleanup&&!(url.hostname==='oauth2.googleapis.com'&&url.pathname==='/token'||url.hostname==='www.googleapis.com'&&method==='GET'||url.hostname==='www.googleapis.com'&&method==='DELETE'&&/^\/drive\/v3\/files\/[a-zA-Z0-9_-]{10,160}$/.test(url.pathname)))fail();
    this.db.prepare("INSERT INTO retained_io VALUES(?,?,?,'pending',NULL,NULL)").run(id,parent,identity);
    this.queued--;this.active++;issued=true;this.next=Date.now()+40;
    this.db.prepare('UPDATE retained_rate SET next_at=? WHERE id=1').run(this.next);
    // Release pacing before awaiting I/O. One dispatch is ONE DO invocation;
    // its admission and final SQL both fit the pre-reserved SQL upper bound.
    return {at:Date.now(),response:fetch(url.href,{method,headers:init.headers,body,redirect:'manual',signal:AbortSignal.timeout(15000)})};
   });this.gate=admission.then(()=>{},()=>{});
   try{
    const {at,response:pending}=await admission,response=await pending,parts=[];let length=0;const reader=response.body?.getReader();if(reader)try{for(;;){const r=await reader.read();if(r.done)break;length+=r.value.byteLength;if(length>4000000)fail();parts.push(Buffer.from(r.value));}}catch{await reader.cancel().catch(()=>{});fail();}const bytes=Buffer.concat(parts);
    this.db.prepare("UPDATE retained_io SET state='settled',status=?,receipt=? WHERE id=? AND identity=? AND state='pending'").run(response.status,hash(bytes),id,identity);
    return {status:response.status,headers:Object.fromEntries([...response.headers].filter(([k])=>['content-type','cache-control','etag'].includes(k))),body:new Uint8Array(bytes),billingKnown:true,timing:{issuedAtMs:at,pacingWaitMs:at-received,fetchMs:Date.now()-at}};
   }finally{if(issued)this.active--;else this.queued--;}
  // Fixed SQL: overhead UPDATE1 + I/O INSERT2 + pacing UPDATE1 + final UPDATE1.
  // Actual workerd success/concurrency/timeout/stop maximum5; reserve7 with
  // margin. The same actual-metadata check STILL stops on any larger result.
  },{writes:7,profile:'provider'});
 }
 fetch(){return new Response(null,{status:404,headers:{'cache-control':'private, no-store'}});}
}
