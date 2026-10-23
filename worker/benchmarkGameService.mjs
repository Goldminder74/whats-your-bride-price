// Isolated synthetic harness only. No HTTP endpoint, feature override, Stripe
// configuration or production/test database target is introduced here.
import {createHmac} from 'node:crypto';
import {D1QuestionSelectionRepository} from '../db/questionSelection.ts';
import {QuestionSelectionService} from '../db/questionSelectionService.ts';
import {CowrieWalletService,D1CowrieWalletRepository} from '../db/cowrieWallet.ts';
import {completeCowrieQuickPlay} from '../db/cowrieCompletion.ts';
import {deriveAnonymousSubjectHash} from '../app/anonymousSession.ts';
import {createJournaledDatabase} from './authorityDatabase.mjs';
import {recoveryHash} from '../scripts/recovery-crypto.mjs';
import {assertBenchmarkResource} from '../scripts/approved-benchmark-budget.mjs';

const hash=value=>recoveryHash(Buffer.from(JSON.stringify(value)));
const unavailable=()=>{throw Error('benchmark_game_unavailable');};

/** The caller supplies the approved isolated D1 and private authority binding.
 * Actual repositories, limits, accounting and writer fences remain in use.
 * Fixtures exercise internal free-play services; customer commerce stays OFF.
 * HTTP/RPC/provider metering and the deployment adapter remain separate duties.
 */
export function benchmarkGameService({binding,authority,syntheticKey,databaseResource,runId,now=Date.now,verifyAssets,verifySharing=async()=>false}) {
 assertBenchmarkResource('database',databaseResource);
 if(!/^synthetic_[a-zA-Z0-9_-]{1,48}$/.test(runId||'')
  ||!Buffer.isBuffer(syntheticKey)||syntheticKey.length!==32||typeof verifyAssets!=='function')unavailable();
 const db=createJournaledDatabase(binding,authority,{now});
 const selectionRepo=new D1QuestionSelectionRepository(db);
 const questions=new QuestionSelectionService(selectionRepo,{now});
 const wallets=new CowrieWalletService(new D1CowrieWalletRepository(db,selectionRepo),{now});
 const identity=name=>{
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(name||''))unavailable();
  return createHmac('sha256',syntheticKey).update('wybp-isolated-benchmark-v1\0'+runId+'\0'+name).digest('hex');
 };
 async function context(name){
  const credential=identity(name).slice(0,32),owner=await deriveAnonymousSubjectHash(credential);
  const attempts=(await db.prepare('SELECT id,status FROM quiz_attempts WHERE anonymous_subject_hash=?1 ORDER BY created_at,id LIMIT 2').bind(owner).all()).results;
  if(attempts.length!==1)unavailable();
  return {credential,owner,attempt:attempts[0]};
 }
 async function projection(ctx){
  const selection=await questions.resume({attemptId:ctx.attempt.id,anonymousSessionCredential:ctx.credential});
  return {selection,selectionHash:hash(selection),attemptHash:hash(ctx.attempt.id)};
 }
 async function completed(ctx){
  const rows=(await db.prepare(`SELECT r.id,r.public_slug,r.score,r.total,qa.status,
   (SELECT COUNT(*) FROM answers a WHERE a.attempt_id=qa.id) answer_count
   FROM quiz_attempts qa JOIN results r ON r.attempt_id=qa.id
   WHERE qa.id=?1 AND qa.anonymous_subject_hash=?2 AND qa.status='completed'
   AND r.state='active' AND r.expires_at>?3`).bind(ctx.attempt.id,ctx.owner,now()).all()).results;
  if(rows.length!==1||rows[0].answer_count!==12||rows[0].total!==12)unavailable();
  const wallet=await wallets.projection({anonymousSessionCredential:ctx.credential});
  // Projection verifies ledger/cache agreement; this harness never resets value.
  if(!wallet||wallet.state!=='active')unavailable();
  return {persisted:true,answerCount:12,attemptHash:hash(ctx.attempt.id),accountingVerified:true,
   ownershipVerified:true,completionReceipt:hash({attempt:ctx.attempt.id,result:rows[0].id,score:rows[0].score,total:12})};
 }
 return {async execute(command){
  try{
   const credential=identity(command.identity).slice(0,32);
   if(command.kind==='start'){
    if(!['west','east','central','north','south'].includes(command.region))unavailable();
    await wallets.createOrGet({anonymousSessionCredential:credential});
    await wallets.startQuickPlay({region:command.region,anonymousSessionCredential:credential,idempotencyKey:'benchmark-start-'+identity(command.identity)});
    const ctx=await context(command.identity),view=await projection(ctx);
    return {selectionHash:view.selectionHash,ownerHash:hash(ctx.owner),attemptHash:view.attemptHash,questionCount:view.selection.questions.length,answerPlan:view.selection.questions.map(q=>({questionRef:q.questionRef,selectedOptionIds:[q.options[0].id],assetRefs:q.kind==='image'?[...q.imageAssets]:[]}))};
   }
   const ctx=await context(command.identity);
   if(command.kind==='complete'){
    if(ctx.attempt.status!=='completed'){
     const view=await projection(ctx);
     await completeCowrieQuickPlay(db,{attemptId:ctx.attempt.id,anonymousSessionCredential:credential,
      idempotencyKey:'benchmark-complete-'+identity(command.identity),avatarId:'adjoa',
      answers:view.selection.questions.map(q=>({questionStableId:q.questionRef,selectedOptionIds:[q.options[0].id]}))},now());
    }
    return completed(ctx);
   }
   if(command.kind==='result'){
    const receipt=await completed(ctx);
    const result=(await db.prepare('SELECT qe.edition_key FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id JOIN quiz_editions qe ON qe.id=r.edition_id WHERE qa.id=?1 AND qa.anonymous_subject_hash=?2 AND r.state=\'active\'').bind(ctx.attempt.id,ctx.owner).all()).results;
    if(result.length!==1)unavailable();
    if(await verifyAssets(result[0].edition_key)!==true)unavailable();
    // Generic sharing uses the real safe projection/copy helpers without making
    // the private result public or disclosing synthetic owner credentials.
    const sharingVerified=await verifySharing(result[0].edition_key)===true;
    return {resultVerified:receipt.persisted,assetsVerified:true,sharingVerified};
   }
   if(command.kind==='answer'){
    if(!Number.isInteger(command.question)||command.question<1||command.question>12)unavailable();
    // The real browser retains its visible selection. Do not add a second
    // server-side resume merely to choose a synthetic option for every answer.
    await questions.answer({attemptId:ctx.attempt.id,anonymousSessionCredential:credential,questionRef:command.questionRef,selectedOptionIds:command.selectedOptionIds});
    return {accepted:true,question:command.question,attemptHash:hash(ctx.attempt.id)};
   }
   if(command.kind==='recover'){
    const view=await projection(ctx);
    // These answers are the deterministic synthetic client's previous choices,
    // not invented server-persisted answer rows. Rejudge read-only, as recovery does.
    for(const question of view.selection.questions.slice(0,7))await questions.answer({attemptId:ctx.attempt.id,anonymousSessionCredential:credential,questionRef:question.questionRef,selectedOptionIds:[question.options[0].id]});
    const wallet=await wallets.projection({anonymousSessionCredential:credential});
    if(wallet.freeQuickPlaysRemaining!==1)unavailable();
    return {selectionHash:view.selectionHash,attemptHash:view.attemptHash,answerCount:7,chargeCount:0,additionalAttempts:0};
   }
   unavailable();
  }catch(error){
   const candidate=error?.cause||error?.message,diagnostic=['authority_read_changed','authority_writer_busy','authority_writer_unavailable','authority_result_recovery_required','drive_commit_head_gap','drive_commit_head_conflict','drive_commit_head_unavailable'].includes(candidate)?candidate:undefined;
   throw Error('benchmark_game_unavailable',{cause:diagnostic});
  }
 }};
}
