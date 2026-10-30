import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {RetainedJobs} from '../../worker/retainedJobs.mjs';import {RetainedBenchmarkLedger} from '../../worker/retainedBenchmarkLedger.mjs';import {retainedHash,retainedZero} from '../../worker/retainedBenchmarkPolicy.mjs';import {syntheticRetainedGrant} from '../helpers/retainedBenchmark.mjs';
test('encrypted accepted jobs survive replacement; a lost running result stops rather than repeating an uncertain effect',()=>{
 const db=new DatabaseSync(':memory:'),key=Buffer.alloc(32,7);let at=1000000000000;const grant=syntheticRetainedGrant(at).value,ledger=new RetainedBenchmarkLedger(db,grant,{now:()=>at}),jobs=new RetainedJobs(db,key,ledger,{now:()=>at});
 try{
  const definition={id:retainedHash('job'),flow:'game',region:'west',due:at+10,upper:retainedZero(),maxSteps:16};assert.equal(jobs.accept(definition).accepted,true);assert.equal(jobs.accept(definition).replay,true);assert.throws(()=>jobs.accept({...definition,region:'north'}));assert.equal(jobs.claim().length,0);
  at+=10;const [job]=new RetainedJobs(db,key,ledger,{now:()=>at,cold:true}).claim();assert.equal(job.step,0);jobs.finish(job,{known:true,receipt:retainedHash('step'),done:false,state:{syntheticCredential:'must remain encrypted'}});
  assert.equal(db.prepare('SELECT payload FROM retained_jobs').get().payload.includes('syntheticCredential'),false);at++;assert.equal(jobs.claim().length,1);
  new RetainedJobs(db,key,ledger,{now:()=>at,cold:true});assert.equal(ledger.readback().stopped,true);assert.equal(jobs.status(definition.id).state,'uncertain');assert.equal(jobs.claim().length,0);
 }finally{db.close();key.fill(0);}
});
test('day plan replenishes at most64 queued jobs and active-count reads use the state index despite5000 historical receipts',()=>{
 const db=new DatabaseSync(':memory:'),key=Buffer.alloc(32,7),at=1000000000000,ledger=new RetainedBenchmarkLedger(db,syntheticRetainedGrant(at).value,{now:()=>at}),jobs=new RetainedJobs(db,key,ledger,{now:()=>at});
 try{
  const add=db.prepare("INSERT INTO retained_jobs VALUES(?,?,NULL,'complete',1,?,?,'ordinary')");for(let i=0;i<5000;i++)add.run(retainedHash(['old',i]),retainedHash(i),at,retainedHash(i));db.prepare('UPDATE retained_job_count SET n=5000 WHERE id=1').run();
  ledger.transition('measure',{receiptSha256:retainedHash('verified'),fullStockVerified:true,mirrorVerified:true,applicationRoutesVerified:true,measureStartsAt:at+1000});jobs.plan({startsAt:at+1000,completed:5000,peakHour:500,upper:retainedZero()});
  for(let i=0;i<20;i++)jobs.fill();assert.equal(db.prepare("SELECT COUNT(*) n FROM retained_jobs WHERE state='waiting'").get().n,64);assert.equal(db.prepare('SELECT cursor FROM retained_job_plan').get().cursor,64);
  assert.ok(db.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM retained_jobs WHERE state IN ('waiting','running')").all().some(r=>r.detail.includes('retained_job_state')));
  ledger.transition('cleanup',{});jobs.suspendOrdinary();assert.equal(db.prepare("SELECT COUNT(*) n FROM retained_jobs WHERE state IN ('waiting','running')").get().n,0);assert.equal(db.prepare('SELECT n FROM retained_job_count').get().n,5064);
 }finally{db.close();key.fill(0);}
});
test('job completion removes encrypted payload; queue, step and duration limits fail closed',()=>{
 const db=new DatabaseSync(':memory:'),key=Buffer.alloc(32,7),at=1000000000000,ledger=new RetainedBenchmarkLedger(db,syntheticRetainedGrant(at).value,{now:()=>at}),jobs=new RetainedJobs(db,key,ledger,{now:()=>at});
 try{
  const d={id:retainedHash('one'),flow:'operator-loop',command:{kind:'mirror-capture',captureId:'retained_job_test'},doneField:'complete',upper:retainedZero(),maxSteps:2,due:at};jobs.accept(d);const [job]=jobs.claim();jobs.finish(job,{known:true,done:true,receipt:retainedHash('receipt')});assert.equal(jobs.status(d.id).state,'complete');assert.equal(db.prepare('SELECT payload FROM retained_jobs').get().payload,null);assert.equal(jobs.next(),null);
  assert.throws(()=>jobs.accept({...d,id:retainedHash('late'),due:at+112*3600000}));assert.throws(()=>jobs.accept({...d,id:retainedHash('unbounded'),maxSteps:100001}));
  for(let i=0;i<64;i++)jobs.accept({...d,id:retainedHash(i),due:at+1});assert.throws(()=>jobs.accept({...d,id:retainedHash('65th'),due:at+1}));
 }finally{db.close();key.fill(0);}
});

// A real hour includes completion time; historical rows never count here.
test('mixed day schedules exactly5000 completions,2150 abandonments and1000 seven-answer refreshes',async()=>{
 const {retainedDayEntry,retainedGameStep}=await import('../../worker/retainedGameSteps.mjs'),rows=Array.from({length:7150},(_,i)=>retainedDayEntry(i,{incomplete:2150,recoveries:1000}));
 assert.equal(rows.filter(r=>r.flow==='game').length,5000);assert.equal(rows.filter(r=>r.flow==='incomplete').length,2150);assert.equal(rows.filter(r=>r.recover).length,1000);assert.equal(rows.filter(r=>r.flow==='game'&&r.offsetMs<3600000).length,500);assert.ok(Math.max(...rows.filter(r=>r.flow==='game'&&r.offsetMs<3600000).map(r=>r.offsetMs))<3000000);
 const state={selection:{attemptId:'synthetic',questions:Array.from({length:12},(_,i)=>({questionRef:String(i),options:[{id:'o1'}]}))},resultSlug:'a'.repeat(48)},d={flow:'game',recover:true,region:'west'},steps=Array.from({length:24},(_,i)=>retainedGameStep(d,state,i,'a'.repeat(32),'b'.repeat(32)));
 assert.equal(steps.filter(r=>r.answer).length,19);assert.equal(steps.filter(r=>r.selection).length,2);assert.equal(steps.filter(r=>r.completion).length,1);assert.deepEqual(steps.filter(r=>r.answer).map(r=>Number(r.value.questionRef)),[0,1,2,3,4,5,6,0,1,2,3,4,5,6,7,8,9,10,11]);
});
