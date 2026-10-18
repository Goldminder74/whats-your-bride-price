import {createHash} from 'node:crypto';
import {setMaxListeners} from 'node:events';
import {BENCHMARK_PHASES,assertBenchmarkResource,executeBudgetedAction,peakHourSchedule} from './approved-benchmark-budget.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw Error('benchmark_driver_verification_failed');};
const regions=['west','east','central','north','south'];
const validHash=value=>/^[a-f0-9]{64}$/.test(value||'');
const pauseUntil=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(Error('benchmark_driver_phase_stopped'));return;}
 const done=()=>{signal?.removeEventListener('abort',abort);resolve();};
 const timer=setTimeout(done,ms);
 const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('benchmark_driver_phase_stopped'));};
 signal?.addEventListener('abort',abort,{once:true});
});

/** A private harness adapter must use the real services and return authoritative
 * metering/readback. The driver never treats an HTTP answer as a persisted game.
 * No resource creation, credential installation, plan purchase or flag changes.
 */
export class ApprovedBenchmarkDriver {
 constructor({budget,adapter,resources,now=Date.now,pause=pauseUntil,recover}){
  for(const kind of ['site','worker','database'])assertBenchmarkResource(kind,resources?.[kind]);
  if(!BENCHMARK_PHASES[adapter?.phase]||budget?.id?.split(':').at(-1)!==adapter.phase
   ||typeof adapter.execute!=='function'||typeof adapter.upperBound!=='function'
   ||typeof adapter.verifyInventory!=='function')fail();
  if(recover!==undefined&&typeof recover!=='function')fail();
  this.budget=budget;this.adapter=adapter;this.now=now;this.pause=pause;this.recover=recover;
  this.started=budget.row().started_at;this.pending=new Map();this.samples=[];this.queue=Promise.resolve();this.nextAdmission=0;this.abort=new AbortController();
  // The approved schedule has500 completions plus215 incomplete clients. Their
  // pending timers share one cancellation signal; keep its bound explicit.
  setMaxListeners(720,this.abort.signal);
 }
 async initialise(){
  return this.action({id:'inventory',kind:'inventory'},result=>{
   if(result.syntheticOnly!==true||result.privateIngressVerified!==true||result.commerce!==false
    ||result.webhook!==false||result.cron!==false||result.cpuLimitMs!==100
    ||result.partitionCount!==16||result.eligiblePerRegion?.length!==5
    ||result.eligiblePerRegion.some(x=>x!==30)||!validHash(result.sourceSha256))fail();
  });
 }
 async action(command,verify=()=>{}){
  // Re-entrant identical actions share one in-flight effect. Across processes the
  // durable budget rejects a reserved action, requiring readback, never replay.
  if(this.pending.has(command.id))return this.pending.get(command.id);
  const work=this.queue.then(async()=>{
   try{
    if(this.abort.signal.aborted||this.budget.row().state!=='active')throw Error('benchmark_driver_phase_stopped');
    const upper=this.adapter.upperBound(command),phase=BENCHMARK_PHASES[this.adapter.phase];
    const paced=this.adapter.pacedExternal===true;
    if((!paced&&upper.external>phase.externalPerSecond)||upper.internal>phase.internalPerSecond)fail();
    const delay=this.nextAdmission-this.now();if(delay>0)await this.pause(delay,this.abort.signal);
    this.nextAdmission=this.now()+Math.max(paced?0:1000*upper.external/phase.externalPerSecond,1000*upper.internal/phase.internalPerSecond);
    const result=await executeBudgetedAction(this.budget,command.id,upper,async()=>{
     const began=this.now();
     const outcome=command.kind==='inventory'?await this.adapter.verifyInventory():await this.adapter.execute(command);
     if(!validHash(outcome?.receiptSha256))fail();
     this.samples.push({kind:command.kind,elapsedMs:Math.max(0,this.now()-began)});
     return outcome;
    },{pacedExternal:paced});
    if(result.state!=='settled'||!Object.hasOwn(result,'result')){
     // Settlement receipts do not contain private attempt state. A fresh process
     // must reconstruct from authoritative readback, not issue the mutation again.
     throw Error('benchmark_driver_readback_required');
    }
    verify(result.result);
    if(paced)this.nextAdmission=Math.max(this.nextAdmission,this.now()+1000/phase.externalPerSecond);
    return result.result;
   }catch(error){this.budget.stop();this.abort.abort();throw error;}
  });
  this.queue=work.catch(()=>{});
  this.pending.set(command.id,work);
  return work;
 }
 async wait(afterMs){
  if(this.abort.signal.aborted||this.budget.row().state!=='active')throw Error('benchmark_driver_phase_stopped');
  const remaining=this.started+afterMs-this.now();
  if(remaining>0)await this.pause(remaining,this.abort.signal);
  if(this.abort.signal.aborted||this.budget.row().state!=='active')throw Error('benchmark_driver_phase_stopped');
  if(this.now()-this.started>=BENCHMARK_PHASES[this.adapter.phase].durationMs){this.budget.stop();this.abort.abort();fail();}
 }
 async game(game,incomplete=false){
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(game?.identity||'')||!regions.includes(game.region)
   ||!Number.isSafeInteger(game.startAfterMs)||game.startAfterMs<0
   ||(incomplete&&game.answerCount!==4))fail();
  await this.wait(game.startAfterMs);
  const start=await this.action({id:game.identity+'_start',kind:'start',identity:game.identity,region:game.region},r=>{
   if(!validHash(r.selectionHash)||!validHash(r.ownerHash)||!validHash(r.attemptHash)||r.questionCount!==12)fail();
  });
  const answers=incomplete?game.answerCount:12;
  for(let q=1;q<=answers;q++){
   await this.wait(game.startAfterMs+q*(game.questionIntervalMs||20000));
   await this.action({id:game.identity+'_answer_'+q,kind:'answer',identity:game.identity,region:game.region,question:q},r=>{
    if(r.accepted!==true||r.question!==q||r.attemptHash!==start.attemptHash)fail();
   });
   if(q===game.recoverAfterQuestion)await this.action({id:game.identity+'_recover',kind:'recover',identity:game.identity,region:game.region},r=>{
    if(r.selectionHash!==start.selectionHash||r.attemptHash!==start.attemptHash||r.answerCount!==q
     ||r.chargeCount!==0||r.additionalAttempts!==0)fail();
   });
  }
  if(!incomplete){
   const completion=await this.action({id:game.identity+'_complete',kind:'complete',identity:game.identity},r=>{
    if(r.persisted!==true||r.answerCount!==12||r.attemptHash!==start.attemptHash||r.accountingVerified!==true
     ||r.ownershipVerified!==true||!validHash(r.completionReceipt))fail();
   });
   this.budget.completedGame(game.identity,completion.completionReceipt);
   await this.action({id:game.identity+'_result',kind:'result',identity:game.identity,region:game.region},r=>{
    if(r.resultVerified!==true||r.assetsVerified!==true||r.sharingVerified!==true)fail();
   });
  }
 }
 async runGames(){
  if(!['A','B'].includes(this.adapter.phase))fail();
  await this.initialise();
  const schedule=this.adapter.phase==='B'?peakHourSchedule():{
   games:Array.from({length:22},(_,i)=>({identity:'synthetic_baseline_'+i,region:regions[i%5],startAfterMs:i*65000,questionIntervalMs:1000})),incomplete:[],
  };
  // All outcomes are awaited. A failed game stops admissions globally while
  // already-issued actions remain reserved until their observation is known.
  const results=await Promise.allSettled([...schedule.games.map(g=>this.game(g)),...schedule.incomplete.map(g=>this.game(g,true))]);
  if(results.some(r=>r.status==='rejected')){this.budget.stop();throw Error('benchmark_driver_phase_stopped');}
  return this.receipt();
 }
 async runOutage(){
  if(this.adapter.phase!=='C')fail();
  await this.initialise();
  // A coherent subset: 3,000 twelve-answer games plus their attempts/results.
  // 6,000 parents + 3,000 arrivals leave 1,000 rows for holds/accounting.
  // This measures bounded drain, not the complete 48-hour production backlog.
  await this.action({id:'fixture',kind:'fixture',agedAnswers:36000,dependentRows:7000},r=>{
   if(r.agedAnswers!==36000||!Number.isSafeInteger(r.dependentRows)||r.dependentRows<6000||r.dependentRows>7000||r.syntheticOnly!==true||r.holdsVerified!==true)fail();
  });
  let remainingExpired=36000,remainingAuthority=null;
  for(let i=0;i<2000;i++){
   await this.wait(i*1700);
   if(i<400&&i%2===0)await this.action({id:'arrivals_'+i,kind:'arrivals',rows:15},r=>{if(r.unexpiredRows!==15)fail();});
   await this.action({id:'purge_'+i,kind:'purge',limit:100},r=>{
    if(!Number.isSafeInteger(r.deleted)||r.deleted<0||r.deleted>100||r.deleted>remainingExpired||r.protectedRowsChanged!==0||r.remainingExpired!==remainingExpired-r.deleted)fail();
    remainingExpired=r.remainingExpired;
   });
   await this.action({id:'flush_'+i,kind:'flush',limit:25},r=>{
    if(r.chainVerified!==true||r.durableReadback!==true||!Number.isSafeInteger(r.remainingBacklog)||r.remainingBacklog<0)fail();remainingAuthority=r.remainingBacklog;
   });
   // Once all3,000 bounded arrivals have been exercised and both measured
   // backlogs are empty, reserve the remaining window for actual recovery.
   // 2,000 is an upper limit, not a reason to issue idle mutations for an hour.
   if(i>=399&&remainingExpired===0&&remainingAuthority===0)break;
  }
  if(remainingExpired!==0||remainingAuthority!==0)fail();
  const verifyRecovery=r=>{
   if(r.accountingVerified!==true||r.holdsVerified!==true||r.closedWalletsBlocked!==true
    ||r.deletionsSuppressed!==true||r.interruptedResumeVerified!==true||r.prematureAccess!==false)fail();
  };
  if(this.recover){try{const result=await this.recover();verifyRecovery(result);if(result.verified!==true||result.runtimeAccess!=='blocked_pending_authority_suppression_receipt')fail();}catch(error){this.budget.stop();throw error;}}
  else await this.action({id:'restore',kind:'restore'},verifyRecovery);
  return this.receipt();
 }
 receipt(){
  const latencies=this.samples.map(x=>x.elapsedMs).sort((a,b)=>a-b);
  const percentile=p=>latencies.length?latencies[Math.ceil(latencies.length*p)-1]:null;
  const result={budget:this.budget.receipt(),observedActions:this.samples.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99)};
  return {...result,sha256:digest(result)};
 }
}


