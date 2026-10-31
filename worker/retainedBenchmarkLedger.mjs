import {retainedHash,retainedVector,retainedZero,RETAINED_CAPS,RETAINED_GAUGES} from './retainedBenchmarkPolicy.mjs';
const fail=()=>{throw Error('retained_benchmark_stopped');};
const json=JSON.stringify,gauge=k=>RETAINED_GAUGES.includes(k);
// Adapter is either node:sqlite (local) or private DO SQL. No provider effects.
// Reservations persist before effects; duplicate tickets never execute again.
export class RetainedBenchmarkLedger {
 constructor(db,grant,{now=Date.now,transaction,cold=false}={}){
  this.db=db;this.grant=grant;this.now=now;this.transaction=transaction||((f)=>{db.exec('BEGIN');try{const r=f();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}});
  retainedVector(grant.carried);
  db.exec("CREATE TABLE IF NOT EXISTS retained_run(id INTEGER PRIMARY KEY,grant_hash TEXT NOT NULL,started INTEGER NOT NULL,deadline INTEGER NOT NULL,stopped INTEGER NOT NULL,used TEXT NOT NULL,phase TEXT NOT NULL,measure_at INTEGER,recovery_at INTEGER,cleanup TEXT NOT NULL); CREATE TABLE IF NOT EXISTS retained_tickets(id TEXT PRIMARY KEY,identity TEXT NOT NULL,upper TEXT NOT NULL,actual TEXT,state TEXT NOT NULL,receipt TEXT,created INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS retained_pending ON retained_tickets(state); CREATE TABLE IF NOT EXISTS retained_games(id TEXT PRIMARY KEY,receipt TEXT NOT NULL,completed INTEGER NOT NULL);");
  this.transaction(()=>{
   db.prepare("INSERT INTO retained_run VALUES(1,?,?,?,0,?,'setup',NULL,NULL,?) ON CONFLICT(id) DO NOTHING").run(retainedHash(grant),grant.startsAt,grant.endsAt,json(grant.carried),json(retainedZero()));
   const r=this.row();if(r.grant_hash!==retainedHash(grant)||r.started!==grant.startsAt||r.deadline!==grant.endsAt)fail();
   if(cold&&db.prepare("SELECT id FROM retained_tickets WHERE state='pending' LIMIT 1").get())this.stop();
  });
  db.exec('CREATE TABLE IF NOT EXISTS retained_cleanup_tickets(id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS retained_sizes(id TEXT PRIMARY KEY,bytes INTEGER NOT NULL);');
  db.exec('CREATE TABLE IF NOT EXISTS retained_starts(id TEXT PRIMARY KEY);CREATE TABLE IF NOT EXISTS retained_start_count(id INTEGER PRIMARY KEY,n INTEGER NOT NULL);INSERT INTO retained_start_count VALUES(1,0) ON CONFLICT(id) DO NOTHING;');
 }
 row(){const r=this.db.prepare('SELECT * FROM retained_run WHERE id=1').get();if(!r)fail();return r;}
 reserve(id,identity,upper,{cleanup=false,escrow}={}){
  if(!/^[a-f0-9]{64}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(identity||''))fail();retainedVector(upper);
  return this.transaction(()=>{
   const r=this.row(),at=this.now(),old=this.db.prepare('SELECT * FROM retained_tickets WHERE id=?').get(id);
   if(old){if(old.identity!==identity||old.upper!==json(upper))fail();return {execute:false,state:old.state,receipt:old.receipt};}
   if(at<r.started||at>=r.deadline||!cleanup&&(r.stopped||r.phase==='cleanup'||at>=r.deadline-16*3600000))fail();
   const used=JSON.parse(r.used),priorEscrow=JSON.parse(r.cleanup),reserve=escrow===undefined?priorEscrow:retainedVector(escrow);
   if(Object.keys(RETAINED_CAPS).some(k=>reserve[k]<priorEscrow[k]&&!cleanup))fail();
   const next=Object.fromEntries(Object.keys(RETAINED_CAPS).map(k=>[k,gauge(k)?Math.max(used[k],upper[k]):used[k]+upper[k]]));
   if(Object.keys(RETAINED_CAPS).some(k=>next[k]>RETAINED_CAPS[k]||!cleanup&&(next[k]>RETAINED_CAPS[k]*.8||!gauge(k)&&next[k]+reserve[k]>RETAINED_CAPS[k])))fail();
   if(cleanup&&Object.keys(RETAINED_CAPS).some(k=>!gauge(k)&&upper[k]>priorEscrow[k]))fail();
   const after=cleanup?Object.fromEntries(Object.keys(RETAINED_CAPS).map(k=>[k,gauge(k)?priorEscrow[k]:priorEscrow[k]-upper[k]])):reserve;
   this.db.prepare("INSERT INTO retained_tickets VALUES(?,?,?,NULL,'pending',NULL,?)").run(id,identity,json(upper),at);
   if(cleanup)this.db.prepare('INSERT INTO retained_cleanup_tickets VALUES(?)').run(id);
   this.db.prepare('UPDATE retained_run SET used=?,cleanup=? WHERE id=1').run(json(next),json(after));return {execute:true};
  });
 }
 settle(id,identity,actual,receipt){
  retainedVector(actual);if(!/^[a-f0-9]{64}$/.test(receipt||''))fail();
  return this.transaction(()=>{
   const r=this.row(),ticket=this.db.prepare('SELECT * FROM retained_tickets WHERE id=?').get(id);
   if(!ticket||ticket.identity!==identity)fail();
   if(ticket.state==='settled'){if(ticket.receipt!==receipt||ticket.actual!==json(actual))fail();return {replay:true};}
   const upper=JSON.parse(ticket.upper);if(Object.keys(RETAINED_CAPS).some(k=>actual[k]>upper[k])){this.stop();return {stopped:true};}
   const used=JSON.parse(r.used);for(const k of Object.keys(RETAINED_CAPS))if(!gauge(k))used[k]=used[k]-upper[k]+actual[k];
   if(this.db.prepare('SELECT id FROM retained_cleanup_tickets WHERE id=?').get(id)){
    // Return only the proven-unused part of a settled cleanup reservation.
    // Consumed work and every unknown reservation remain charged permanently.
    const escrow=JSON.parse(r.cleanup);for(const k of Object.keys(RETAINED_CAPS))if(!gauge(k))escrow[k]+=upper[k]-actual[k];this.db.prepare('UPDATE retained_run SET cleanup=? WHERE id=1').run(json(escrow));
   }
   this.db.prepare("UPDATE retained_tickets SET actual=?,state='settled',receipt=? WHERE id=? AND state='pending'").run(json(actual),receipt,id);this.db.prepare('UPDATE retained_run SET used=? WHERE id=1').run(json(used));return {replay:false};
  });
 }
 // Only the private verified controller may change phases. Completion of elapsed
 // setup or a local test never supplies a successful hosted measurement.
 transition(phase,proof){return this.transaction(()=>{
  const r=this.row(),at=this.now();if(at>=r.deadline)fail();
  if(phase==='cleanup'){this.db.prepare("UPDATE retained_run SET stopped=1,phase='cleanup' WHERE id=1").run();return;}
  if(this.db.prepare("SELECT id FROM retained_tickets WHERE state='pending' LIMIT 1").get())fail();
  if(r.stopped||!/^[a-f0-9]{64}$/.test(proof?.receiptSha256||''))fail();
  if(phase==='measure'){
   if(r.phase!=='setup'||at-r.started>48*3600000||proof.fullStockVerified!==true||proof.mirrorVerified!==true||proof.applicationRoutesVerified!==true)fail();
   const start=proof.measureStartsAt??at;if(!Number.isSafeInteger(start)||start<at||start>at+900000)fail();
   this.db.prepare("UPDATE retained_run SET phase='measure',measure_at=? WHERE id=1").run(start);
  }else if(phase==='recovery'){
   if(r.phase!=='measure'||at-r.measure_at<24*3600000||proof.capacityVerified!==true||this.db.prepare('SELECT COUNT(*) n FROM retained_games WHERE completed>=? AND completed<?').get(r.measure_at,r.measure_at+24*3600000).n<5000||this.db.prepare('SELECT COUNT(*) n FROM retained_games WHERE completed>=? AND completed<?').get(r.measure_at,r.measure_at+3600000).n<500)fail();
   this.db.prepare("UPDATE retained_run SET phase='recovery',recovery_at=? WHERE id=1").run(at);
  }else fail();
 });}
 completed(id,receipt){if(!/^[a-f0-9]{64}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(receipt||''))fail();return this.transaction(()=>{
  const r=this.row(),old=this.db.prepare('SELECT receipt FROM retained_games WHERE id=?').get(id);if(old){if(old.receipt!==receipt)fail();return false;}
  const at=this.now();if(r.stopped||r.phase!=='measure'||at<r.measure_at||at>=r.measure_at+24*3600000||this.db.prepare('SELECT COUNT(*) n FROM retained_games').get().n>=5100)fail();
  this.db.prepare('INSERT INTO retained_games VALUES(?,?,?)').run(id,receipt,at);return true;
 });}
 stop(){this.db.prepare('UPDATE retained_run SET stopped=1 WHERE id=1').run();}
 started(id){return this.transaction(()=>{
  if(!/^[a-f0-9]{64}$/.test(id||''))fail();const r=this.row();if(r.stopped||!['setup','measure'].includes(r.phase)||this.now()>=r.deadline-16*3600000)fail();
  if(this.db.prepare('SELECT id FROM retained_starts WHERE id=?').get(id))return false;
  if(this.db.prepare('SELECT n FROM retained_start_count WHERE id=1').get().n>=7350)fail();
  // Reserve before the application call. Failed or unknown starts retain their
  // slot, while domain-identical retries cannot create another start allowance.
  this.db.prepare('INSERT INTO retained_starts VALUES(?)').run(id);this.db.prepare('UPDATE retained_start_count SET n=n+1 WHERE id=1').run();return true;
 });}
 replayArrival(bytes){return this.transaction(()=>{
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>4100000)fail();
  const r=this.row(),at=this.now();if(r.stopped||r.phase==='cleanup'||at<r.started||at>=r.deadline-16*3600000)fail();
  const used=JSON.parse(r.used),escrow=JSON.parse(r.cleanup);
  used.external++;used.workerCpuMs+=100;used.transferBytes+=bytes;
  if(Object.keys(RETAINED_CAPS).some(k=>used[k]>RETAINED_CAPS[k]*.8||!gauge(k)&&used[k]+escrow[k]>RETAINED_CAPS[k])){this.stop();fail();}
  this.db.prepare('UPDATE retained_run SET used=? WHERE id=1').run(json(used));
 });}
 sizes(value){return this.transaction(()=>{
  if(!value||Object.keys(value).sort().join()!=='mirror,source'||Object.values(value).some(n=>!Number.isSafeInteger(n)||n<0||n>8000000000))fail();
  for(const [id,bytes]of Object.entries(value))this.db.prepare('INSERT INTO retained_sizes VALUES(?,?) ON CONFLICT(id) DO UPDATE SET bytes=MAX(bytes,excluded.bytes)').run(id,bytes);
  const sizes=Object.fromEntries(this.db.prepare('SELECT * FROM retained_sizes').all().map(r=>[r.id,r.bytes]));if(sizes.source+sizes.mirror>RETAINED_CAPS.storageBytes)fail();return sizes;
 });}
 overhead({reads=32,writes=12,storageBytes=0,runnerInvocations=0,controllerIngress=false}={}){return this.transaction(()=>{
  if(!Number.isSafeInteger(runnerInvocations)||runnerInvocations<0||runnerInvocations>8||typeof controllerIngress!=='boolean')fail();
  const r=this.row(),used=JSON.parse(r.used);used.doReads+=reads;used.doWrites+=writes;used.doRequests++;used.doStorageBytes=Math.max(used.doStorageBytes,storageBytes);used.doGbMs=Math.max(used.doGbMs,this.grant.carried.doGbMs+Math.ceil(Math.max(0,this.now()-r.started)*.128));
  used.workerCpuMs+=100*(1+runnerInvocations);used.internal+=1+runnerInvocations;if(controllerIngress){used.external++;used.workerCpuMs+=100;used.transferBytes+=2048;}
  const escrow=JSON.parse(r.cleanup),ordinary=!r.stopped&&r.phase!=='cleanup';
  const over=Object.keys(RETAINED_CAPS).some(k=>used[k]>RETAINED_CAPS[k]||ordinary&&(used[k]>RETAINED_CAPS[k]*.8||!gauge(k)&&used[k]+escrow[k]>RETAINED_CAPS[k]));this.db.prepare('UPDATE retained_run SET used=?,stopped=? WHERE id=1').run(json(used),over?1:r.stopped);return !over;
 });}
 measuredOverhead({reserved,charged,unusedRunners=0}){
  // Called only after successful, instrumented SQL. Retain a two-read/two-write
  // allowance for THIS atomic accounting update. Unknown/crashed calls never
  // reach it and keep their full original reservation. No deadline/cap changes.
  if(!Number.isSafeInteger(unusedRunners)||unusedRunners<0||unusedRunners>8)fail();
  if(![reserved?.reads,reserved?.writes,charged?.reads,charged?.writes].every(n=>Number.isSafeInteger(n)&&n>=0)||charged.reads>reserved.reads||charged.writes>reserved.writes)fail();
  const reads=reserved.reads-charged.reads,writes=reserved.writes-charged.writes;
  const changed=this.db.prepare("UPDATE retained_run SET used=json_set(used,'$.doReads',json_extract(used,'$.doReads')-?1,'$.doWrites',json_extract(used,'$.doWrites')-?2,'$.workerCpuMs',json_extract(used,'$.workerCpuMs')-?3,'$.internal',json_extract(used,'$.internal')-?4) WHERE id=1 AND json_extract(used,'$.doReads')>=?1 AND json_extract(used,'$.doWrites')>=?2 AND json_extract(used,'$.workerCpuMs')>=?3 AND json_extract(used,'$.internal')>=?4 RETURNING id").get(reads,writes,unusedRunners*100,unusedRunners);
  if(changed?.id!==1)fail();
 }
 readback(){const r=this.row();return {grantSha256:r.grant_hash,startedAt:r.started,deadlineAt:r.deadline,stopped:!!r.stopped,phase:r.phase,measureAt:r.measure_at,recoveryAt:r.recovery_at,used:JSON.parse(r.used),cleanup:JSON.parse(r.cleanup),pending:this.db.prepare("SELECT COUNT(*) n FROM retained_tickets WHERE state='pending'").get().n,completedGames:this.db.prepare('SELECT COUNT(*) n FROM retained_games').get().n};}
}
