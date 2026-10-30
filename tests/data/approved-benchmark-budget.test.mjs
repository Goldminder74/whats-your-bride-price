import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,realpathSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {ApprovedBenchmarkBudget,BENCHMARK_PHASES,verifyBenchmarkPreflight,verifySharedPacingHeadroom,assertBenchmarkResource,peakHourSchedule,executeBudgetedAction,benchmarkTrafficMicrocredits} from '../../scripts/approved-benchmark-budget.mjs';

const at=Date.UTC(2026,9,15);
const facts=()=>({reviewAvailable:true,verifiedAt:at,evidenceSha256:'a'.repeat(64),account:'b6b22a9a87b5758725e5c499782160af',netlifyTeam:'goldminder74',autoTopups:false,standardPaidQuoted:true,standardPaidConfirmed:true,workerCpuLimitMs:100,usageGBPPerUSD:.96,subscriptionGBP:4.8,maximumUsageGBP:2.6,currentWholeAccountGBP:9,otherSubscriptionsKnown:true,netlifyCreditsAvailable:400,includedWritesAvailable:5100000,includedReadsAvailable:71000000,includedStorageBytesAvailable:250*1024*1024});
const vector=(overrides={})=>({...Object.fromEntries(Object.keys(BENCHMARK_PHASES.A.caps).map(key=>[key,0])),...overrides});
const receipt='b'.repeat(64);

test('new B/C preparation preserves all usage and starts its measured clock only once',()=>{
 const db=new DatabaseSync(':memory:');let clock=at;
 const options={runId:'synthetic_prepared',phase:'B',preflight:facts(),now:()=>clock,preparing:true};
 try{
  const budget=new ApprovedBenchmarkBudget(db,options),upper=vector({external:1,writes:20});
  assert.throws(()=>budget.reserve('start',upper),/stopped/);
  assert.throws(()=>budget.reserve('not_setup',upper,{preparation:true}),/preparation_scope/);
  const ticket=budget.reserve('setup_commission',upper,{preparation:true});
  assert.throws(()=>budget.beginMeasurement(),/start_blocked/);
  budget.settle(ticket.ticket,upper,receipt);clock+=120000;
  assert.equal(budget.beginMeasurement(),clock);assert.equal(budget.receipt().used.writes,20);
  const started=clock;clock+=1000;assert.equal(budget.beginMeasurement(),started);
  const resumed=new ApprovedBenchmarkBudget(db,{...options,preflight:{...facts(),verifiedAt:clock}});
  assert.equal(resumed.beginMeasurement(),started);assert.equal(resumed.receipt().used.external,1);
  assert.throws(()=>resumed.reserve('setup_again',upper,{preparation:true}),/preparation_scope/);
  clock+=3600000;assert.throws(()=>resumed.reserve('game_after_deadline',upper),/duration_stop/);
  assert.throws(()=>new ApprovedBenchmarkBudget(db,{...options,phase:'A',preflight:{...facts(),verifiedAt:clock}}),/preparation_scope/);
 }finally{db.close();}
});
test('traffic credits include compute and reserve across phases and replacement instances',()=>{
 assert.equal(benchmarkTrafficMicrocredits({external:10000,transferBytes:1000000000,computeGbMs:3600000}),32000000);
 assert.throws(()=>benchmarkTrafficMicrocredits({external:1,transferBytes:0}),/credit_unknown/);
 const db=new DatabaseSync(':memory:');let clock=at;
 const options={runId:'synthetic_credit',preflight:facts(),now:()=>clock};
 try{
  const b=new ApprovedBenchmarkBudget(db,{...options,phase:'B'});
  // Model a paced multi-request action, below individual phase limits, whose
  // reservation combines with C to exceed the shared credit admission threshold.
  const upper=vector({external:60000,transferBytes:700000000,computeGbMs:2800000});
  b.reserve('credit_b',upper,{pacedExternal:true});
  clock+=1000;
  const c=new ApprovedBenchmarkBudget(db,{...options,phase:'C',preflight:{...facts(),verifiedAt:clock}});
  assert.throws(()=>c.reserve('credit_c',vector({external:20000,transferBytes:150000000,computeGbMs:2800000}),{pacedExternal:true}),/traffic_credit_stop/);
  assert.equal(c.receipt().used.transferBytes,0);
  const replacement=new ApprovedBenchmarkBudget(db,{...options,phase:'B',preflight:{...facts(),verifiedAt:clock}});
  assert.equal(replacement.reserve('credit_b',upper,{pacedExternal:true}).execute,false);
  assert.throws(()=>replacement.reserve('more',vector({computeGbMs:1000000})),/limit_computeGbMs|traffic_credit_stop/);
 }finally{db.close();}
});
function fixture(phase='B'){
 const db=new DatabaseSync(':memory:');let clock=at;
 const options={runId:'synthetic_run',phase,preflight:facts(),now:()=>clock};
 return {db,options,budget:new ApprovedBenchmarkBudget(db,options),advance:ms=>clock+=ms};
}

test('pre-purchase headroom rejects unavailable review, unknown costs, old facts and both spending ceilings',()=>{
 const base=facts();assert.equal(verifyBenchmarkPreflight({...base,standardPaidConfirmed:false},at).incrementalMaximumGBP,7.4);
 assert.throws(()=>verifyBenchmarkPreflight({...base,standardPaidConfirmed:false},at,{execution:true}),/account_configuration/);
 assert.throws(()=>verifyBenchmarkPreflight({...base,workerCpuLimitMs:30000},at,{execution:true}),/account_configuration/);
 assert.throws(()=>verifyBenchmarkPreflight({...base,maximumUsageGBP:0},at),/cost_understated/);
 for(const [change,reason] of [[{reviewAvailable:false},'review_unavailable'],[{otherSubscriptionsKnown:false},'cost_unknown'],[{subscriptionGBP:7},'cost_ceiling'],[{currentWholeAccountGBP:44},'cost_ceiling'],[{netlifyCreditsAvailable:369},'headroom_shortfall'],[{includedWritesAvailable:5099999},'headroom_shortfall'],[{autoTopups:true},'account_configuration'],[{verifiedAt:at-3600001},'headroom_unverified']])
  assert.throws(()=>verifyBenchmarkPreflight({...base,...change},at),new RegExp(reason));
});

test('approved exact names cannot target an existing application database or another account',()=>{
 const sample={name:'wybp-capacity-d1-r002',id:'11111111-1111-4111-8111-111111111111',account:facts().account};assert.equal(assertBenchmarkResource('database',sample),true);
 for(const changed of [{...sample,name:'wybp-prod-d1-r001'},{...sample,id:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'},{...sample,account:'other'}])assert.throws(()=>assertBenchmarkResource('database',changed),/resource_scope/);
 assert.throws(()=>assertBenchmarkResource('site',{name:'wybp-capacity-private-r002',id:sample.id,teamSlug:'another'}),/resource_scope/);
});

test('phase caps are immutable and the control journal cannot alter an application database',()=>{
 assert.equal(Object.isFrozen(BENCHMARK_PHASES.B.caps),true);assert.throws(()=>{BENCHMARK_PHASES.B.caps.writes=99999999;},TypeError);
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE cowrie_wallets(id TEXT PRIMARY KEY); INSERT INTO cowrie_wallets VALUES(\'preserved\')');
  assert.throws(()=>new ApprovedBenchmarkBudget(db,{runId:'unsafe',phase:'B',preflight:facts(),now:()=>at}),/journal_database_scope/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cowrie_wallets').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name LIKE 'benchmark_%'").get().n,0);
 }finally{db.close();}
});

test('committed reservations survive replacement and an uncertain request is never blindly sent again',()=>{
 const f=fixture();try{
  const upper=vector({external:1,writes:100,reads:1000});const ticket=f.budget.reserve('provider_query',upper);assert.equal(ticket.execute,true);
  const replacement=new ApprovedBenchmarkBudget(f.db,f.options);assert.equal(replacement.reserve('provider_query',upper).execute,false);
  assert.equal(replacement.receipt().uncertainActions,1);assert.equal(replacement.receipt().used.writes,100);
  assert.throws(()=>replacement.reserve('provider_query',vector({external:1,writes:101})),/retry_conflict/);
  assert.equal(replacement.settle(ticket.ticket,vector({external:1,writes:20,reads:200}),receipt),true);
  assert.equal(replacement.settle(ticket.ticket,vector({external:1,writes:20,reads:200}),receipt),false);
  assert.equal(replacement.receipt().used.writes,20);assert.equal(replacement.receipt().uncertainActions,0);
 }finally{f.db.close();}
});

test('file-backed reservations survive database close/reopen without repeating an action',()=>{
 const root=resolve('outputs/benchmark-budget-tests');mkdirSync(root,{recursive:true});
 assert.ok(realpathSync(root).startsWith(realpathSync(process.cwd())+sep));
 const directory=mkdtempSync(join(root,'synthetic-')),path=join(directory,'budget.sqlite');
 const options={runId:'file_fixture',phase:'B',preflight:facts(),now:()=>at};let db=new DatabaseSync(path);
 try{
  const first=new ApprovedBenchmarkBudget(db,options);first.reserve('persisted',vector({external:1,writes:17}));db.close();db=new DatabaseSync(path);
  const resumed=new ApprovedBenchmarkBudget(db,options);assert.equal(resumed.reserve('persisted',vector({external:1,writes:17})).execute,false);assert.equal(resumed.receipt().used.writes,17);
 }finally{db.close();unlinkSync(path);rmdirSync(directory);}
});

test('independent controllers share request-rate admission and cannot cross the 80 percent boundary',()=>{
 const f=fixture('A');try{
  const second=new ApprovedBenchmarkBudget(f.db,f.options);f.budget.reserve('one',vector({external:1}));
  assert.throws(()=>second.reserve('two',vector({external:1})),/rate_stop/);f.advance(1000);second.reserve('two',vector({external:1}));
  assert.throws(()=>f.budget.reserve('writes',vector({writes:8000})),/limit_writes/);
  assert.equal(f.budget.receipt().used.writes,0);assert.equal(f.budget.receipt().used.external,2);
 }finally{f.db.close();}
});

test('storage is a peak gauge while transfer, objects and internal RPC retain their separate caps',()=>{
 const f=fixture();try{
  f.budget.reserve('storage_one',vector({storageBytes:50000000}));f.budget.reserve('storage_same',vector({storageBytes:50000000}));
  assert.equal(f.budget.receipt().used.storageBytes,50000000);
  for(const [field,value] of [['storageBytes',80000000],['transferBytes',800000000],['driveObjects',4800]])assert.throws(()=>f.budget.reserve('limit_'+field,vector({[field]:value})),new RegExp('limit_'+field));
  f.budget.reserve('rpc_batch',vector({internal:500}));assert.throws(()=>f.budget.reserve('rpc_over',vector({internal:1})),/rate_stop/);
  f.advance(1000);f.budget.reserve('rpc_later',vector({internal:1}));assert.equal(f.budget.receipt().used.internal,501);
 }finally{f.db.close();}
});

test('unknown or underestimated billing stops admission and records the actual overrun exactly once',()=>{
 const f=fixture();try{
  assert.throws(()=>f.budget.reserve('unknown',{external:1}),/meter_unknown/);
  assert.throws(()=>f.budget.reserve('bad_option',vector({external:1}),{cleanup:'false'}),/action_options/);
  const ticket=f.budget.reserve('underestimate',vector({writes:10}));
  assert.deepEqual(f.budget.settle(ticket.ticket,vector({writes:11}),receipt),{stopped:true,reason:'benchmark_reservation_exceeded'});
  assert.equal(f.budget.receipt().used.writes,11);assert.equal(f.budget.receipt().state,'stopped');
  assert.equal(f.budget.settle(ticket.ticket,vector({writes:11}),receipt),false);assert.equal(f.budget.receipt().used.writes,11);
  assert.throws(()=>f.budget.reserve('more',vector({writes:1})),/stopped/);
 }finally{f.db.close();}
});

test('duration and one-minute burst window cannot reset on process restart; cleanup remains capped',()=>{
 const f=fixture();try{
  f.budget.reserve('burst_one',vector({external:40}),{burst:true});f.advance(60000);
  const replacement=new ApprovedBenchmarkBudget(f.db,f.options);
  assert.throws(()=>replacement.reserve('burst_two',vector({external:1}),{burst:true}),/burst_expired/);
  f.advance(3540000);assert.throws(()=>replacement.reserve('late',vector({external:1})),/duration_stop/);
  replacement.stop();assert.equal(replacement.reserve('cleanup_delete_one',vector({external:1}),{cleanup:true}).execute,true);
  assert.throws(()=>replacement.reserve('cleanup_delete_over',vector({writes:2000001}),{cleanup:true}),/limit_writes/);
  assert.throws(()=>replacement.reserve('game_not_cleanup',vector({external:1}),{cleanup:true}),/cleanup_scope/);
 }finally{f.db.close();}
});

test('peak schedule covers five regions, 500 completions sought, 215 incomplete starts and 100 recoveries',()=>{
 const schedule=peakHourSchedule();assert.equal(schedule.games.length,500);assert.equal(schedule.incomplete.length,215);
 assert.equal(schedule.games.filter(game=>game.recoverAfterQuestion===7).length,100);
 for(const region of ['west','east','central','north','south'])assert.equal(schedule.games.filter(game=>game.region===region).length,100);
 assert.equal(schedule.games.at(-1).startAfterMs+240000,3595000);assert.equal(new Set(schedule.games.map(game=>game.identity)).size,500);
});

test('lost response stops all phases, preserves reservation and never automatically repeats a side effect',async()=>{
 const f=fixture();try{
  let writes=0;
  await assert.rejects(executeBudgetedAction(f.budget,'uncertain',vector({external:1,writes:10}),async()=>{writes++;throw Error('sensitive provider text');}),/^Error: benchmark_action_uncertain$/);
  const again=await executeBudgetedAction(f.budget,'uncertain',vector({external:1,writes:10}),async()=>{writes++;});
  assert.equal(again.execute,false);assert.equal(writes,1);assert.equal(f.budget.receipt().uncertainActions,1);
  const nextPhase=new ApprovedBenchmarkBudget(f.db,{...f.options,phase:'C'});
  assert.throws(()=>nextPhase.reserve('must_not_start',vector({writes:1})),/stopped/);
 }finally{f.db.close();}
});

test('completed games count verified unique receipts and preserve the approved cap',()=>{
 const f=fixture('A');try{
  for(let i=0;i<22;i++)assert.equal(f.budget.completedGame('game_'+i,receipt),true);
  assert.equal(f.budget.completedGame('game_0',receipt),false);assert.throws(()=>f.budget.completedGame('over',receipt),/game_stop/);
  assert.equal(f.budget.receipt().completedGames,22);
 }finally{f.db.close();}
});

test('fresh preflight evidence can resume an existing stopped run without resetting its counters or deadline',()=>{
 const f=fixture();try{
  f.budget.reserve('one',vector({writes:20}));f.budget.stop();f.advance(1000);
  const resumed=new ApprovedBenchmarkBudget(f.db,{...f.options,preflight:{...facts(),verifiedAt:at+1000,evidenceSha256:'c'.repeat(64)}});
  assert.equal(resumed.receipt().used.writes,20);assert.equal(resumed.receipt().state,'stopped');assert.equal(resumed.receipt().elapsedMs,1000);
  assert.throws(()=>resumed.reserve('two',vector({writes:1})),/stopped/);
 }finally{f.db.close();}
});

 test("approved C revision leaves B and integrity reserve unchanged",()=>{assert.equal(BENCHMARK_PHASES.C.caps.driveBytes,250000000);assert.equal(BENCHMARK_PHASES.C.caps.transferBytes,750000000);assert.equal(BENCHMARK_PHASES.C.caps.external,100000);assert.equal(BENCHMARK_PHASES.C.caps.internal,500000);assert.equal(BENCHMARK_PHASES.B.caps.driveBytes,100000000);assert.equal(BENCHMARK_PHASES.C.caps.driveObjects,6000);assert.equal(BENCHMARK_PHASES.C.durationMs,3600000);});

test('replacement windows retain old settled and uncertain reservations and reject changed carryover',()=>{
 const db=new DatabaseSync(':memory:');const used={B:vector({external:63000,writes:5000,transferBytes:1000000})};
 const options={runId:'synthetic_new_window',phase:'B',preflight:facts(),now:()=>at,carryover:{sourceSha256:'c'.repeat(64),used}};
 try{
  const budget=new ApprovedBenchmarkBudget(db,options);assert.equal(budget.receipt().used.external,63000);assert.equal(budget.receipt().windowUsed.external,0);
  const reservation=budget.reserve('uncertain',vector({external:9,writes:10}),{pacedExternal:true});assert.ok(reservation.ticket);
  const replacement=new ApprovedBenchmarkBudget(db,options);assert.equal(replacement.receipt().used.external,63009);
  assert.throws(()=>replacement.reserve('too_much',vector({external:1000}),{pacedExternal:true}),/limit_external/);
  assert.throws(()=>new ApprovedBenchmarkBudget(db,{...options,carryover:{sourceSha256:'d'.repeat(64),used}}),/carryover_conflict/);
  assert.equal(replacement.receipt().used.writes,5010);
 }finally{db.close();}
});

test('coordinator headroom is mandatory and cannot rely on unknown or stale included allocations',()=>{const value={...facts(),durableObjectsVerifiedAt:at,durableObjectsComplete:true,durableObjectRequestsAvailable:150000,durableObjectGbSecondsAvailable:4000,durableObjectWritesAvailable:1000000,durableObjectReadsAvailable:2000000,durableObjectBytesAvailable:64000000};assert.equal(verifySharedPacingHeadroom(value,at).incrementalMaximumGBP,7.4);for(const key of ['durableObjectRequestsAvailable','durableObjectGbSecondsAvailable','durableObjectWritesAvailable','durableObjectReadsAvailable','durableObjectBytesAvailable'])assert.throws(()=>verifySharedPacingHeadroom({...value,[key]:value[key]-1},at),/coordinator_headroom/);assert.throws(()=>verifySharedPacingHeadroom({...value,durableObjectsVerifiedAt:at-3600001},at),/coordinator_headroom/);});
