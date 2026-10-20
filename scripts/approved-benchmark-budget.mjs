import { createHash, randomUUID } from 'node:crypto';

const MB=1000000; // Conservative decimal MB/GB; never enlarge an approved cap.
// Fixed-point credits: reserve rounded UP before effects. All external requests
// and bytes are conservatively treated as Netlify-billed, including provider I/O.
// computeGbMs is allocated GB * elapsed milliseconds, rounded up by the adapter.
export function benchmarkTrafficMicrocredits(value) {
 if(!value||['external','transferBytes','computeGbMs'].some(k=>!Number.isSafeInteger(value[k])||value[k]<0))throw Error('benchmark_credit_unknown');
 const credits=value.external*200+Math.ceil(value.transferBytes/50)+Math.ceil(value.computeGbMs*25/9);
 if(!Number.isSafeInteger(credits))throw Error('benchmark_credit_unknown');return credits;
}
const TRAFFIC_MICROCREDITS=60000000;
const freezePhase=phase=>Object.freeze({...phase,caps:Object.freeze({...phase.caps,computeGbMs:3600000})});
export const BENCHMARK_PHASES=Object.freeze({
 A:freezePhase({durationMs:30*60000,externalPerSecond:1,internalPerSecond:1,completedGames:22,caps:{external:1000,internal:0,writes:10000,reads:100000,storageBytes:10*MB,transferBytes:100*MB,driveObjects:100,driveBytes:10*MB}}),
 B:freezePhase({durationMs:60*60000,externalPerSecond:10,internalPerSecond:500,completedGames:500,caps:{external:80000,internal:600000,writes:2000000,reads:10000000,storageBytes:100*MB,transferBytes:1000*MB,driveObjects:6000,driveBytes:100*MB}}),
 C:freezePhase({durationMs:60*60000,externalPerSecond:10,internalPerSecond:500,completedGames:0,caps:{external:100000,internal:500000,writes:3000000,reads:60000000,storageBytes:250*MB,transferBytes:750*MB,driveObjects:6000,driveBytes:250*MB}}),
});
export const BENCHMARK_RESOURCE_NAMES=Object.freeze(['wybp-capacity-private-r002','wybp-capacity-worker-r002','wybp-capacity-d1-r002']);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reject=code=>{throw Error(code);};
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0;
const money=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const keys=Object.keys(BENCHMARK_PHASES.A.caps);
const zero=()=>Object.fromEntries(keys.map(key=>[key,0]));

/** An operator attestation backed by saved read-only provider evidence, NOT a
 * substitute for provider authentication or approval review. No purchase/API call.
 * Old receipts and unknown subscription allocations cannot establish headroom. */
export function verifyBenchmarkPreflight(facts,now=Date.now(),{execution=false}={}) {
 if(facts?.reviewAvailable!==true)reject('benchmark_review_unavailable');
 if(!Number.isSafeInteger(facts.verifiedAt)||facts.verifiedAt>now||now-facts.verifiedAt>3600000
  ||!/^[a-f0-9]{64}$/.test(facts.evidenceSha256||''))reject('benchmark_headroom_unverified');
 if(facts.account!=='b6b22a9a87b5758725e5c499782160af'||facts.netlifyTeam!=='goldminder74'
  ||facts.autoTopups!==false||facts.standardPaidQuoted!==true||(execution&&(facts.standardPaidConfirmed!==true||facts.workerCpuLimitMs!==100)))reject('benchmark_account_configuration');
 if(!money(facts.subscriptionGBP)||!money(facts.maximumUsageGBP)||!money(facts.currentWholeAccountGBP)
  ||!money(facts.usageGBPPerUSD)||facts.usageGBPPerUSD===0||facts.otherSubscriptionsKnown!==true)reject('benchmark_cost_unknown');
 const external=Object.values(BENCHMARK_PHASES).reduce((sum,phase)=>sum+phase.caps.external,0);
 const invocations=Object.values(BENCHMARK_PHASES).reduce((sum,phase)=>sum+phase.caps.external+phase.caps.internal,0);
 const worstUsageGBP=Math.ceil((external*0.3/1000000+invocations*100*0.02/1000000)*facts.usageGBPPerUSD*100)/100;
 if(facts.maximumUsageGBP<worstUsageGBP||facts.subscriptionGBP+1e-9<5*facts.usageGBPPerUSD)reject('benchmark_cost_understated');
 const incremental=facts.subscriptionGBP+facts.maximumUsageGBP;
 if(incremental>8||facts.currentWholeAccountGBP+incremental>50)reject('benchmark_cost_ceiling');
 if(!nonnegative(facts.netlifyCreditsAvailable)||facts.netlifyCreditsAvailable<370
  ||!nonnegative(facts.includedWritesAvailable)||facts.includedWritesAvailable<5100000
  ||!nonnegative(facts.includedReadsAvailable)||facts.includedReadsAvailable<71000000
  ||!nonnegative(facts.includedStorageBytesAvailable)||facts.includedStorageBytesAvailable<250*MB)reject('benchmark_headroom_shortfall');
 return {evidenceSha256:facts.evidenceSha256,verifiedAt:facts.verifiedAt,incrementalMaximumGBP:incremental,wholeAccountMaximumGBP:facts.currentWholeAccountGBP+incremental};
}

export function verifySharedPacingHeadroom(facts,now=Date.now()) {
 const cost=verifyBenchmarkPreflight(facts,now,{execution:true});
 if(!Number.isSafeInteger(facts.durableObjectsVerifiedAt)||facts.durableObjectsVerifiedAt>now||now-facts.durableObjectsVerifiedAt>3600000||facts.durableObjectsComplete!==true||!Number.isSafeInteger(facts.durableObjectRequestsAvailable)||facts.durableObjectRequestsAvailable<150000||!Number.isSafeInteger(facts.durableObjectGbSecondsAvailable)||facts.durableObjectGbSecondsAvailable<4000||!Number.isSafeInteger(facts.durableObjectWritesAvailable)||facts.durableObjectWritesAvailable<1000000||!Number.isSafeInteger(facts.durableObjectReadsAvailable)||facts.durableObjectReadsAvailable<2000000||!Number.isSafeInteger(facts.durableObjectBytesAvailable)||facts.durableObjectBytesAvailable<64000000)reject('benchmark_coordinator_headroom_unverified');
 return cost;
}

export function assertBenchmarkResource(kind,observed) {
 const expected={database:'wybp-capacity-d1-r002',worker:'wybp-capacity-worker-r002',site:'wybp-capacity-private-r002'}[kind];
 if(!expected||observed?.name!==expected||typeof observed.id!=='string'||!observed.id
  ||(['database','site'].includes(kind)&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(observed.id))
  ||['1a268b28-e6d5-4431-8f84-a886df9369f1','a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'].includes(observed.id)
  ||(kind==='site'?observed.teamSlug!=='goldminder74':observed.account!=='b6b22a9a87b5758725e5c499782160af'))reject('benchmark_resource_scope');
 return true;
}

function vector(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length
  ||keys.some(key=>!nonnegative(value[key]))||Object.keys(value).some(key=>!keys.includes(key)))reject('benchmark_meter_unknown');
 return value;
}

/** Local SQLite admission journal: reservations commit BEFORE external action.
 * Unknown responses keep their full reservation. Reopening never resets a run.
 * Only a verified observation can settle a ticket; reusing an action never sends it.
 * The caller must meter provider fetches and internal RPC, not just browser traffic.
 */
export class ApprovedBenchmarkBudget {
 constructor(database,{runId,phase,preflight,now=Date.now,preparing=false,carryover}={}) {
  if(!database?.prepare||!database?.exec||!/^[a-zA-Z0-9_-]{1,64}$/.test(runId||'')||!BENCHMARK_PHASES[phase])reject('benchmark_budget_configuration');
  if(typeof preparing!=='boolean'||preparing&&phase==='A')reject('benchmark_preparation_scope');
  this.db=database;this.now=now;this.phase=BENCHMARK_PHASES[phase];this.id=runId+':'+phase;
  const approved=verifyBenchmarkPreflight(preflight,now(),{execution:true});
  const allowed=new Set(['benchmark_runs','benchmark_tickets','benchmark_rate','benchmark_preflights','benchmark_sessions','benchmark_allowance_carryover']);
  if(database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().some(row=>!allowed.has(row.name)))reject('benchmark_journal_database_scope');
  database.exec(`CREATE TABLE IF NOT EXISTS benchmark_runs(id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,version INTEGER NOT NULL,state TEXT NOT NULL,used TEXT NOT NULL,completed INTEGER NOT NULL,burst_at INTEGER,preflight_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS benchmark_tickets(run_id TEXT NOT NULL,action_id TEXT NOT NULL,ticket TEXT NOT NULL,reserved TEXT NOT NULL,actual TEXT,state TEXT NOT NULL,receipt_hash TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(run_id,action_id));
    CREATE TABLE IF NOT EXISTS benchmark_rate(run_id TEXT NOT NULL,second INTEGER NOT NULL,external INTEGER NOT NULL,internal INTEGER NOT NULL,PRIMARY KEY(run_id,second));
    CREATE TABLE IF NOT EXISTS benchmark_preflights(run_id TEXT NOT NULL,sha256 TEXT NOT NULL,verified_at INTEGER NOT NULL,PRIMARY KEY(run_id,sha256));
    CREATE TABLE IF NOT EXISTS benchmark_sessions(id TEXT PRIMARY KEY,state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS benchmark_allowance_carryover(phase TEXT PRIMARY KEY,used TEXT NOT NULL,source_hash TEXT NOT NULL);`);
  if(carryover){
   if(!/^[a-f0-9]{64}$/.test(carryover.sourceSha256||''))reject('benchmark_carryover_unverified');
   this.transaction(()=>{for(const p of ['A','B','C']){const used=vector(carryover.used?.[p]||zero()),prior=database.prepare('SELECT * FROM benchmark_allowance_carryover WHERE phase=?1').get(p);
    if(prior&&(prior.used!==JSON.stringify(used)||prior.source_hash!==carryover.sourceSha256))reject('benchmark_carryover_conflict');
    database.prepare('INSERT INTO benchmark_allowance_carryover VALUES(?1,?2,?3) ON CONFLICT(phase) DO NOTHING').run(p,JSON.stringify(used),carryover.sourceSha256);
   }});
  }
  this.session=runId;database.prepare("INSERT INTO benchmark_sessions VALUES(?1,'active') ON CONFLICT(id) DO NOTHING").run(runId);
  database.prepare("INSERT INTO benchmark_runs VALUES(?1,?2,1,?5,?3,0,NULL,?4) ON CONFLICT(id) DO NOTHING").run(this.id,now(),JSON.stringify(zero()),approved.evidenceSha256,preparing?'preparing':'active');
  const latest=database.prepare('SELECT MAX(verified_at) at FROM benchmark_preflights WHERE run_id=?1').get(this.id).at;
  if(latest!==null&&approved.verifiedAt<latest)reject('benchmark_resume_evidence_stale');
  database.prepare('INSERT INTO benchmark_preflights VALUES(?1,?2,?3) ON CONFLICT(run_id,sha256) DO NOTHING').run(this.id,approved.evidenceSha256,approved.verifiedAt);
 }
 row(){const row=this.db.prepare('SELECT * FROM benchmark_runs WHERE id=?1').get(this.id);if(!row)reject('benchmark_run_missing');return row;}
 carried(phase=this.id.split(':').at(-1)){const row=this.db.prepare('SELECT used FROM benchmark_allowance_carryover WHERE phase=?1').get(phase);return row?JSON.parse(row.used):zero();}
 beginMeasurement(){
  // A one-way transition for a NEW B/C run, never a timer reset. Preparation
  // tickets and their resource/credit reservations remain charged in full.
  return this.transaction(()=>{
   const row=this.row();
   if(row.state==='active')return row.started_at;
   if(row.state!=='preparing'||this.id.endsWith(':A')||this.db.prepare('SELECT state FROM benchmark_sessions WHERE id=?1').get(this.session).state!=='active'
    ||this.db.prepare("SELECT COUNT(*) n FROM benchmark_tickets WHERE run_id=?1 AND state!='settled'").get(this.id).n)reject('benchmark_measurement_start_blocked');
   const at=this.now(),fresh=this.db.prepare('SELECT MAX(verified_at) at FROM benchmark_preflights WHERE run_id=?1').get(this.id).at;
   if(at<row.started_at||at-fresh>3600000)reject('benchmark_measurement_start_blocked');
   this.db.prepare("UPDATE benchmark_runs SET state='active',started_at=?2,version=version+1 WHERE id=?1 AND state='preparing'").run(this.id,at);return at;
  });
 }
 transaction(work){this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 reserve(actionId,upper,{cleanup=false,burst=false,pacedExternal=false,preparation=false}={}) {
  if(typeof cleanup!=='boolean'||typeof burst!=='boolean'||typeof pacedExternal!=='boolean'||typeof preparation!=='boolean')reject('benchmark_action_options');
  vector(upper);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(actionId||''))reject('benchmark_action_identity');
  return this.transaction(()=>{
   const existing=this.db.prepare('SELECT * FROM benchmark_tickets WHERE run_id=?1 AND action_id=?2').get(this.id,actionId);
   if(existing){if(existing.reserved!==JSON.stringify(upper))reject('benchmark_retry_conflict');return {ticket:existing.ticket,state:existing.state,execute:false};}
   const row=this.row(),at=this.now();
   if(cleanup&&!/^cleanup_(delete|verify|reconcile)_/.test(actionId))reject('benchmark_cleanup_scope');
   if(preparation&&(!/^setup_[a-zA-Z0-9_-]+$/.test(actionId)||row.state!=='preparing'||burst))reject('benchmark_preparation_scope');
   if(preparation&&at-this.db.prepare('SELECT MAX(verified_at) at FROM benchmark_preflights WHERE run_id=?1').get(this.id).at>3600000)reject('benchmark_headroom_unverified');
   if((row.state!==(preparation?'preparing':'active')||this.db.prepare('SELECT state FROM benchmark_sessions WHERE id=?1').get(this.session).state!=='active')&&!cleanup)reject('benchmark_stopped');
   if(at<row.started_at||!preparation&&at-row.started_at>=this.phase.durationMs){if(!cleanup)reject('benchmark_duration_stop');}
   const used=JSON.parse(row.used),carried=this.carried(),threshold=cleanup?1:0.8;
   for(const key of keys){
    const fresh=key==='storageBytes'?Math.max(used[key],upper[key]):used[key]+upper[key];
    const projected=key==='storageBytes'?Math.max(carried[key],fresh):carried[key]+fresh;
    if(projected>this.phase.caps[key]*threshold||(!cleanup&&upper[key]>0&&projected===this.phase.caps[key]*threshold))reject('benchmark_limit_'+key);
    used[key]=fresh;
   }
   const other=this.db.prepare('SELECT used FROM benchmark_runs WHERE substr(id,1,?1)=?2 AND id<>?3').all(this.session.length+1,this.session+':',this.id);
   const credits=benchmarkTrafficMicrocredits(used)+other.reduce((sum,r)=>sum+benchmarkTrafficMicrocredits(JSON.parse(r.used)),0)+this.db.prepare('SELECT used FROM benchmark_allowance_carryover').all().reduce((sum,r)=>sum+benchmarkTrafficMicrocredits(JSON.parse(r.used)),0);
   if(credits>TRAFFIC_MICROCREDITS*(cleanup?1:.8)||(!cleanup&&credits===TRAFFIC_MICROCREDITS*.8))reject('benchmark_traffic_credit_stop');
   let burstAt=row.burst_at;
   if(burst){if(!this.id.endsWith(':B'))reject('benchmark_burst_scope');burstAt??=at;if(at-burstAt>=60000)reject('benchmark_burst_expired');}
   const second=Math.floor(at/1000),rate=this.db.prepare('SELECT * FROM benchmark_rate WHERE run_id=?1 AND second=?2').get(this.id,second)||{external:0,internal:0};
   const extLimit=burst?40:this.phase.externalPerSecond;
   // A verified private adapter spaces EVERY provider fetch and the controller
   // serialises whole invocations plus a final interval. Its total reservation
   // can span multiple seconds; this does not authorise a single-second burst.
   const immediateExternal=pacedExternal?0:upper.external;
   if(rate.external+immediateExternal>extLimit||rate.internal+upper.internal>this.phase.internalPerSecond)reject('benchmark_rate_stop');
   this.db.prepare('INSERT INTO benchmark_rate VALUES(?1,?2,?3,?4) ON CONFLICT(run_id,second) DO UPDATE SET external=excluded.external,internal=excluded.internal').run(this.id,second,rate.external+immediateExternal,rate.internal+upper.internal);
   this.db.prepare('DELETE FROM benchmark_rate WHERE run_id=?1 AND second<?2').run(this.id,second-1);
   const ticket=randomUUID();
   this.db.prepare("INSERT INTO benchmark_tickets VALUES(?1,?2,?3,?4,NULL,'reserved',NULL,?5)").run(this.id,actionId,ticket,JSON.stringify(upper),at);
   this.db.prepare('UPDATE benchmark_runs SET used=?2,burst_at=?3,version=version+1 WHERE id=?1').run(this.id,JSON.stringify(used),burstAt);
   return {ticket,state:'reserved',execute:true};
  });
 }
 settle(ticket,actual,receiptSha256) {
  vector(actual);if(!/^[a-f0-9]{64}$/.test(receiptSha256||''))reject('benchmark_receipt_missing');
  return this.transaction(()=>{
   const entry=this.db.prepare('SELECT * FROM benchmark_tickets WHERE run_id=?1 AND ticket=?2').get(this.id,ticket);
   if(!entry)reject('benchmark_ticket_missing');
   if(entry.state!=='reserved'){if(entry.receipt_hash!==receiptSha256||entry.actual!==JSON.stringify(actual))reject('benchmark_receipt_conflict');return false;}
   const reserved=JSON.parse(entry.reserved),row=this.row(),used=JSON.parse(row.used);
   if(keys.some(key=>actual[key]>reserved[key])){
    for(const key of keys)used[key]=key==='storageBytes'?Math.max(used[key],actual[key]):used[key]-reserved[key]+actual[key];
    this.db.prepare("UPDATE benchmark_tickets SET actual=?3,state='overrun',receipt_hash=?4 WHERE run_id=?1 AND ticket=?2").run(this.id,ticket,JSON.stringify(actual),receiptSha256);
    this.db.prepare("UPDATE benchmark_runs SET state='stopped',used=?2,version=version+1 WHERE id=?1").run(this.id,JSON.stringify(used));
    this.db.prepare("UPDATE benchmark_sessions SET state='stopped' WHERE id=?1").run(this.session);
    return {stopped:true,reason:'benchmark_reservation_exceeded'};
   }
   for(const key of keys)if(key!=='storageBytes')used[key]=used[key]-reserved[key]+actual[key];
   // Storage is a conservative peak gauge; an observation never erases an older peak.
   this.db.prepare("UPDATE benchmark_tickets SET actual=?3,state='settled',receipt_hash=?4 WHERE run_id=?1 AND ticket=?2").run(this.id,ticket,JSON.stringify(actual),receiptSha256);
   this.db.prepare('UPDATE benchmark_runs SET used=?2,version=version+1 WHERE id=?1').run(this.id,JSON.stringify(used));return true;
  });
 }
 completedGame(actionId,receiptSha256) {
  if(!/^[a-f0-9]{64}$/.test(receiptSha256||'')||!/^[a-zA-Z0-9_-]{1,100}$/.test(actionId||''))reject('benchmark_receipt_missing');
  return this.transaction(()=>{
   const identity='game_'+actionId,prior=this.db.prepare('SELECT receipt_hash FROM benchmark_tickets WHERE run_id=?1 AND action_id=?2').get(this.id,identity);
   if(prior){if(prior.receipt_hash!==receiptSha256)reject('benchmark_receipt_conflict');return false;}
   const row=this.row();if(row.state!=='active'||row.completed>=this.phase.completedGames||this.now()-row.started_at>=this.phase.durationMs)reject('benchmark_game_stop');
   this.db.prepare("INSERT INTO benchmark_tickets VALUES(?1,?2,?3,?4,?4,'settled',?5,?6)").run(this.id,identity,randomUUID(),JSON.stringify(zero()),receiptSha256,this.now());
   this.db.prepare('UPDATE benchmark_runs SET completed=completed+1,version=version+1 WHERE id=?1').run(this.id);return true;
  });
 }
 stop(){this.transaction(()=>{this.db.prepare("UPDATE benchmark_runs SET state='stopped',version=version+1 WHERE id=?1").run(this.id);this.db.prepare("UPDATE benchmark_sessions SET state='stopped' WHERE id=?1").run(this.session);});}
 receipt(){const row=this.row(),latest=this.db.prepare('SELECT sha256 FROM benchmark_preflights WHERE run_id=?1 ORDER BY verified_at DESC LIMIT 1').get(this.id),fresh=JSON.parse(row.used),carried=this.carried(),used=Object.fromEntries(keys.map(k=>[k,k==='storageBytes'?Math.max(carried[k],fresh[k]):carried[k]+fresh[k]]));const body={run:this.id,state:row.state,elapsedMs:Math.max(0,this.now()-row.started_at),completedGames:row.completed,used,windowUsed:fresh,uncertainActions:this.db.prepare("SELECT COUNT(*) n FROM benchmark_tickets WHERE run_id=?1 AND state='reserved'").get(this.id).n,preflightEvidence:row.preflight_hash,latestPreflightEvidence:latest.sha256};return {...body,sha256:hash(body)};}
}

/** Pure schedule, not a generator against a host. Each completion is a player game.
 * Starts span the hour, allow four minutes/game and leave a five-second deadline
 * margin. Resource admission can delay/stop it; never report planned as completed. */
export function peakHourSchedule() {
 const regions=['west','east','central','north','south'];
 const games=Array.from({length:500},(_,i)=>({identity:'synthetic_game_'+i,region:regions[i%5],startAfterMs:Math.floor(i*(3600000-240000-5000)/499),questionCount:12,questionIntervalMs:20000,recoverAfterQuestion:i%5===0?7:null}));
 const incomplete=Array.from({length:215},(_,i)=>({identity:'synthetic_incomplete_'+i,region:regions[i%5],startAfterMs:Math.floor(i*(3600000-80000-5000)/214),answerCount:4}));
 return {games,incomplete,qualification:'Synthetic descriptors only. Does not send requests, reserve provider capacity or establish throughput.'};
}

export async function executeBudgetedAction(budget,actionId,upper,work,options) {
 const admission=budget.reserve(actionId,upper,options);
 if(!admission.execute)return admission;
 try{
  const outcome=await work();
  const settlement=budget.settle(admission.ticket,outcome.usage,outcome.receiptSha256);
  if(settlement?.stopped)throw Error('overrun');
  return {state:'settled',result:outcome.result};
 }catch{
  budget.stop();
  // The reservation stays charged if billing/response was uncertain. Never log
  // provider text, SQL, body, credentials, wallet or payment identifiers.
  throw Error('benchmark_action_uncertain');
 }
}
