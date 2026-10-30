import {assertBenchmarkResource} from '../scripts/approved-benchmark-budget.mjs';
import {createOperationId} from '../scripts/authority-runtime.mjs';
import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
import {operatorRetentionPlan} from '../db/retention.ts';
import {purgeThroughAuthority} from './authorityService.mjs';
import {RETENTION_DAY,RETENTION_POLICY} from '../db/retentionPolicy.ts';
const fail=()=>{throw Error('benchmark_retention_unavailable');};
const digest=v=>recoveryHash(Buffer.from(JSON.stringify(v)));
const insert=(table,row)=>{const columns=Object.keys(row);return {sql:'INSERT INTO '+table+'('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map((_,i)=>'?'+(i+1)).join(',')+')',params:columns.map(c=>row[c])};};
const marker='synthetic_outage_fixture',prefix='synthetic_outage_attempt_';
export function benchmarkRetentionService({binding,db,authority,key,resource,now=Date.now}){
 assertBenchmarkResource('database',resource);
 async function state(){const r=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[marker]))[0];if(!r||r.expires_at<=now())fail();return {row:r,body:decryptRecord(Buffer.from(r.head_hash),key,marker)};}
 async function protectedHash(body){
  const fence=await authority.readFence();
  const values=[];for(const [table,column,id] of [['cowrie_wallets','id',body.wallet],['cowrie_ledger','wallet_id',body.wallet],['retention_closures','wallet_id',body.wallet],['retention_holds','id','synthetic_capacity_wallet_hold'],['retention_holds','id','synthetic_capacity_attempt_hold'],['quiz_attempts','id',body.attempt],['answers','attempt_id',body.attempt],['results','id',body.result],['retention_suppression','subject_id',body.result]])values.push(await db.query('SELECT * FROM '+table+' WHERE '+column+'=?1 ORDER BY 1',[id]));
  if(await authority.readFence()!==fence)fail();return digest(values);
 }
 async function prepare(){
  let r=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[marker]))[0],body;
  if(!r){
   const source=(await db.query('SELECT r.id result,a.id attempt FROM results r JOIN quiz_attempts a ON a.id=r.attempt_id WHERE (SELECT COUNT(*) FROM answers x WHERE x.attempt_id=a.id)=12 AND a.id NOT LIKE ?1 ORDER BY a.id LIMIT 1',[prefix+'%']))[0];
   const wallet=(await db.query('SELECT id FROM cowrie_wallets ORDER BY id LIMIT 1'))[0];if(!source||!wallet)fail();
   const closure=(await db.query('SELECT COUNT(*) n FROM retention_closures WHERE wallet_id=?1',[wallet.id]))[0].n,suppression=(await db.query('SELECT COUNT(*) n FROM retention_suppression WHERE subject_id=?1',[source.result]))[0].n;
   // Closure creates both its authority row and wallet-suppression row.
   body={...source,wallet:wallet.id,at:now(),extraRows:2+(closure?0:2)+(suppression?0:1)};
   await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,3000,?3,0,'importing',1,?4,?5)",params:[marker,digest(body),encryptRecord(body,key,marker).toString(),body.at,body.at+RETENTION_POLICY.backupDays*RETENTION_DAY]}]);
  }else{if(r.expires_at<=now())fail();body=decryptRecord(Buffer.from(r.head_hash),key,marker);if(r.state==='complete')return body;}
  const proof=digest({synthetic:marker}),plan=[{sql:"UPDATE cowrie_wallets SET state='frozen',frozen_at=COALESCE(frozen_at,?2),updated_at=?2,version=version+1 WHERE id=?1 AND state='active'",params:[body.wallet,body.at]},{sql:'UPDATE quiz_attempts SET expires_at=?2,updated_at=?3 WHERE id=?1 AND expires_at>?2',params:[body.attempt,body.at-2*RETENTION_DAY,body.at]}];
  if(!(await db.query('SELECT wallet_id FROM retention_closures WHERE wallet_id=?1',[body.wallet])).length)plan.push(...operatorRetentionPlan({operation:'close-wallet',walletId:body.wallet,evidenceHash:proof},body.at));
  plan.push(...operatorRetentionPlan({operation:'hold',id:'synthetic_capacity_wallet_hold',scope:'wallet',subjectId:body.wallet,reason:'legal',evidenceHash:proof},body.at),...operatorRetentionPlan({operation:'hold',id:'synthetic_capacity_attempt_hold',scope:'attempt',subjectId:body.attempt,reason:'legal',evidenceHash:proof},body.at),...operatorRetentionPlan({operation:'erase',scope:'result',subjectId:body.result,evidenceHash:proof},body.at));
  await authority.transact(createOperationId(now()),plan);body.protectedHash=await protectedHash(body);
  await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='complete',head_hash=?2,version=version+1 WHERE id=?1 AND state='importing'",params:[marker,encryptRecord(body,key,marker).toString()]}]);return body;
 }
 async function fixtureStep(step){
  if(!Number.isInteger(step)||step<0||step>=600)fail();const body=await prepare();
  const start=step*5,end=start+5,ids=Array.from({length:5},(_,i)=>prefix+(start+i)),prior=await db.query('SELECT id FROM quiz_attempts WHERE id IN (?1,?2,?3,?4,?5)',ids);
  if(prior.length){if(prior.length!==5||(await db.query('SELECT COUNT(*) n FROM answers WHERE attempt_id IN (?1,?2,?3,?4,?5)',ids))[0].n!==60||(await db.query('SELECT COUNT(*) n FROM results WHERE attempt_id IN (?1,?2,?3,?4,?5)',ids))[0].n!==5)fail();return {games:5,answers:60,replayed:true};}
  const attempt=(await db.query('SELECT * FROM quiz_attempts WHERE id=?1',[body.attempt]))[0],result=(await db.query('SELECT * FROM results WHERE id=?1',[body.result]))[0],answers=await db.query('SELECT * FROM answers WHERE attempt_id=?1 ORDER BY id',[body.attempt]);if(answers.length!==12)fail();
  const aged=body.at-32*RETENTION_DAY,expires=aged+30*RETENTION_DAY,plan=[];
  for(let i=start;i<end;i++){
   const id=prefix+i,rid='synthetic_outage_result_'+i;
   plan.push(insert('quiz_attempts',{...attempt,id,anonymous_subject_hash:digest(id),idempotency_key_hash:digest('idempotency:'+id),status:'completed',referral_code:null,challenge_code:null,started_at:aged,completed_at:aged,expires_at:expires,anonymized_at:null,deleted_at:null,version:1,created_at:aged,updated_at:aged,selection_seed_reference:digest('selection:'+id),daily_challenge_id:null,cowrie_issued_at:null}));
   plan.push(...answers.map((a,q)=>insert('answers',{...a,id:'synthetic_outage_answer_'+i+'_'+q,attempt_id:id,answered_at:aged,created_at:aged,updated_at:aged})));
   plan.push(insert('results',{...result,id:rid,public_slug:digest(rid).slice(0,48),attempt_id:id,state:'active',expires_at:expires,revoked_at:null,anonymized_at:null,deleted_at:null,created_at:aged,updated_at:aged,version:1,visibility:'private'}));
  }
  await authority.transact(createOperationId(now()),plan);return {games:5,answers:60,replayed:false};
 }
 async function execute(command){
  if(command.kind==='fixture-step')return fixtureStep(command.step);
  const {row,body}=await state();if(row.state!=='complete'||body.protectedHash!==await protectedHash(body))fail();
  if(command.kind==='fixture'){
   const n=(await db.query('SELECT COUNT(*) n FROM answers WHERE attempt_id>=?1 AND attempt_id<?2',[prefix,prefix+'~']))[0].n;
   const parents=(await db.query('SELECT COUNT(*) n FROM quiz_attempts WHERE id>=?1 AND id<?2',[prefix,prefix+'~']))[0].n;
   const results=(await db.query('SELECT COUNT(*) n FROM results WHERE attempt_id>=?1 AND attempt_id<?2',[prefix,prefix+'~']))[0].n;
   if(n!==36000||parents!==3000||results!==3000)fail();return {agedAnswers:n,dependentRows:6000+body.extraRows,protectedAnswers:12,syntheticOnly:true,holdsVerified:true};
  }
  if(command.kind==='arrivals'){
   if(command.rows!==15||!/^arrivals_\d+$/.test(command.id||''))fail();const at=now(),minute=Math.floor(at/60000)*60000;
   const ids=Array.from({length:15},(_,i)=>'synthetic_outage_'+command.id+'_'+i),existing=(await db.query('SELECT COUNT(*) n FROM daily_operation_limits WHERE id>=?1 AND id<?2',['synthetic_outage_'+command.id+'_','synthetic_outage_'+command.id+'_~']))[0].n;
   if(existing!==0&&existing!==15)fail();if(!existing){if((await db.query("SELECT COUNT(*) n FROM daily_operation_limits WHERE id>='synthetic_outage_arrivals_' AND id<'synthetic_outage_arrivals_~'"))[0].n+15>3000)fail();await authority.transact(createOperationId(now()),ids.map(id=>insert('daily_operation_limits',{id,rate_key_hash:digest(id),action:'start',window_started_at:minute,request_count:1,expires_at:minute+86400000,created_at:at,updated_at:at})));}
   return {unexpiredRows:15};
  }
  if(command.kind==='purge'){
   if(command.limit!==100)fail();const count=async()=>(await db.query('SELECT COUNT(*) n FROM answers WHERE attempt_id>=?1 AND attempt_id<?2',[prefix,prefix+'~']))[0].n,before=await count();
   await purgeThroughAuthority(binding,authority,now(),100);const remainingExpired=await count();
   if(remainingExpired>before||before-remainingExpired>100||body.protectedHash!==await protectedHash(body))fail();
   return {deleted:before-remainingExpired,remainingExpired,protectedRowsChanged:0};
  }
  fail();
 }
 return {execute};
}

