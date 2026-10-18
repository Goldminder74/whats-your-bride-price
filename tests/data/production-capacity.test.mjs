import assert from 'node:assert/strict';
import test from 'node:test';
import {performance} from 'node:perf_hooks';
import {productionCapacity,workloadPlan,retentionSchedulePlan} from '../../scripts/production-capacity.mjs';
import {setup,credential} from '../helpers/cowrieCommerce.mjs';
import {D1QuestionSelectionRepository} from '../../db/questionSelection.ts';
import {deriveAnonymousSubjectHash} from '../../app/anonymousSession.ts';
import {completeCowrieQuickPlay} from '../../db/cowrieCompletion.ts';
import {runTestRetention} from '../../db/testRetention.ts';

test('approved benchmark requires catch-up capacity after a 48-hour outage; old cadence fails',()=>{
  const old=productionCapacity({gamesPerDay:5000,limit:50,cadenceMinutes:5});
  assert.equal(old.answersPerDay,60000);assert.equal(old.backlogAnswers,120000);
  assert.equal(old.scheduledAnswersPerDay,14400);assert.equal(old.deadlineFeasible,false);
  const proposed=productionCapacity({gamesPerDay:5000});assert.equal(proposed.scheduledAnswersPerDay,144000);
  assert.equal(proposed.catchupDays,10/7);assert.equal(proposed.deadlineFeasible,true);
  assert.equal(proposed.sevenDayAnswerVolume,540000);
  assert.equal(productionCapacity({bytesPerGame:1e6,requestsPerGame:14}).fitsPersonalIncludedCredits,false);
  assert.throws(()=>productionCapacity({limit:101}));assert.throws(()=>productionCapacity({cadenceMinutes:0}));
});

test('retained 5k target preserves deferred scale arithmetic and separates abandonment, retries and abuse',()=>{
  assert.equal(productionCapacity().gamesPerDay,5000);
  assert.equal(workloadPlan().completions,5000);
  assert.equal(productionCapacity({gamesPerDay:500000}).deadlineFeasible,false);
  const plan=workloadPlan(500000),small=workloadPlan();
  assert.equal(plan.completions,500000);
  assert.ok(Math.abs(plan.starts-plan.incomplete-plan.completions)<1e-8);
  assert.equal(plan.answers,12*plan.completions+4*plan.incomplete);
  assert.equal(plan.recoveryRequests,plan.recoveries*8);
  assert.ok(plan.retryRequests>0 && plan.rejectedAbuseRequests>0);
  assert.equal(plan.storedAnswerRows,12*plan.completions);
  assert.equal(plan.outageAnswerBacklog,plan.storedAnswerRows*2);
  assert.equal(small.outageAnswerBacklog,120000);
  assert.equal(small.hourlyPeakCompletions,500);
  assert.equal(productionCapacity().burstPerHour,500);
  assert.equal(plan.installedPurgeRowsPerSecondAt50PercentAvailability,plan.purgeRowsPerSecondFor24hCatchup*2);
  assert.ok(Math.abs(plan.apiRequests/small.apiRequests-100)<1e-10);
  assert.throws(()=>workloadPlan(0));assert.throws(()=>workloadPlan(1.5));
});

test('retention proposal includes ongoing arrivals, a 48-hour backlog and 50% unsuccessful passes',()=>{
 const old=retentionSchedulePlan({intervalSeconds:60});assert.equal(old.effectiveAnswersPerDay,72000);assert.equal(old.catchupDays,10);assert.equal(old.answerDeadlineFeasible,false);
 const proposed=retentionSchedulePlan();assert.equal(proposed.effectiveAnswersPerDay,144000);assert.equal(proposed.catchupDays,10/7);assert.equal(proposed.remainingDeadlineDays,5);assert.equal(proposed.answerDeadlineFeasible,true);
 assert.throws(()=>retentionSchedulePlan({successfulFraction:0}));assert.throws(()=>retentionSchedulePlan({intervalSeconds:0}));
});

test('full existing maintenance path makes bounded progress at representative answer volume',async()=>{
  const large=process.env.WYBP_CAPACITY_BENCHMARK==='1',games=large?45000:30,samplePasses=large?60:4,limit=100;
  const c=await setup(),now=Date.UTC(2026,8,12,12);
  try {
    const beforeGame=c.database.prepare('SELECT total_changes() n').get().n;
    const start=await c.walletService.startQuickPlay({region:'west',anonymousSessionCredential:credential,idempotencyKey:'capacity-fixture'});
    const selected=await new D1QuestionSelectionRepository(c.adapter).getAttempt(start.selection.attemptId,await deriveAnonymousSubjectHash(credential),now);
    await completeCowrieQuickPlay(c.adapter,{attemptId:start.selection.attemptId,anonymousSessionCredential:credential,idempotencyKey:'c'.repeat(32),avatarId:'adjoa',answers:selected.selection.questions.map(q=>({questionStableId:q.stableId,selectedOptionIds:q.acceptedAnswers[0]}))},now);
    const logicalGameWrites=c.database.prepare('SELECT total_changes() n').get().n-beforeGame;
    const attempt={...c.database.prepare('SELECT * FROM quiz_attempts LIMIT 1').get()},result={...c.database.prepare('SELECT * FROM results LIMIT 1').get()},answers=c.database.prepare('SELECT * FROM answers').all();
    const makeInsert=(table,row)=>{const columns=Object.keys(row),statement=c.database.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);return value=>statement.run(...columns.map(k=>value[k]));};
    const addAttempt=makeInsert('quiz_attempts',attempt),addResult=makeInsert('results',result),addAnswer=makeInsert('answers',answers[0]);
    c.database.exec('BEGIN');try {
      for(let i=1;i<games;i++) {
        const id=`capacity_attempt_${i}`;
        addAttempt({...attempt,id,idempotency_key_hash:i.toString(16).padStart(64,'0')});
        addResult({...result,id:`capacity_result_${i}`,attempt_id:id,public_slug:i.toString(16).padStart(48,'0')});
        for(const [j,row] of answers.entries())addAnswer({...row,id:`capacity_answer_${i}_${j}`,attempt_id:id});
      }
      c.database.exec('COMMIT');
    }catch(error){c.database.exec('ROLLBACK');throw error;}
    assert.equal(c.database.prepare('SELECT COUNT(*) n FROM answers').get().n,games*12);
    const times=[];let purged=0;
    for(let i=0;i<samplePasses;i++) {
      const before=c.database.prepare('SELECT COUNT(*) n FROM answers').get().n,t=performance.now();
      await runTestRetention(c.adapter,result.expires_at,limit);times.push(performance.now()-t);
      const delta=before-c.database.prepare('SELECT COUNT(*) n FROM answers').get().n;
      assert.equal(delta,Math.min(limit,before));purged+=delta;
    }
    assert.deepEqual(c.database.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(c.database.prepare('SELECT purchased_balance FROM cowrie_wallets').get().purchased_balance,0);
    times.sort((a,b)=>a-b);
    console.log(JSON.stringify({engine:'local SQLite, actual runTestRetention path; NOT hosted Worker/Drive',logicalGameWrites,logicalWritesAt5000Games:logicalGameWrites*5000,writeQualification:'One free-game fixture; excludes D1 index billing, HTTP rate limits, production journal and purchases',games,initialAnswers:games*12,limit,samplePasses,purged,totalPassMs:Math.round(times.reduce((a,b)=>a+b,0)),p95PassMs:Math.round(times[Math.floor(times.length*.95)]),maxPassMs:Math.round(times.at(-1)),completeBacklogDrained:purged===games*12}));
  }finally{c.database.close();}
});
