import {setup,credential,request,checkout,verified,adverse} from './cowrieCommerce.mjs';
import {D1QuestionSelectionRepository} from '../../db/questionSelection.ts';
import {deriveAnonymousSubjectHash} from '../../app/anonymousSession.ts';
import {completeCowrieQuickPlay} from '../../db/cowrieCompletion.ts';
import {operatorRetentionPlan} from '../../db/retention.ts';
export async function populatedRecoveryFixture(){
 const c=await setup(),now=Date.now(),at=Date.UTC(2026,8,12,12),proof='a'.repeat(64);
 try{
  const started=await c.walletService.startQuickPlay({region:'west',anonymousSessionCredential:credential,idempotencyKey:'hosted-synthetic-recovery'});
  const selected=await new D1QuestionSelectionRepository(c.adapter).getAttempt(started.selection.attemptId,await deriveAnonymousSubjectHash(credential),at);
  await completeCowrieQuickPlay(c.adapter,{attemptId:started.selection.attemptId,anonymousSessionCredential:credential,idempotencyKey:'c'.repeat(32),avatarId:'adjoa',answers:selected.selection.questions.map(q=>({questionStableId:q.stableId,selectedOptionIds:q.acceptedAnswers[0]}))},at);
  const order=await c.service.startOrder(request(c));await c.service.webhook(await verified('checkout.session.completed',checkout(order)));
  await c.walletService.clear({anonymousSessionCredential:credential});await c.service.webhook(await verified('charge.refunded',adverse()));
  const wallet=c.database.prepare('SELECT id FROM cowrie_wallets').get().id,payment=c.database.prepare('SELECT id FROM commerce_orders').get().id,event=c.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type='charge.refunded'").get().id,result=c.database.prepare('SELECT id FROM results').get().id;
  const apply=action=>c.adapter.batch(operatorRetentionPlan(action,now).map(r=>c.adapter.prepare(r.sql).bind(...r.params)));
  await apply({operation:'settlement',orderId:payment,eventId:event,reason:'verified_refund'});
  for(let i=0;i<123;i++){await apply({operation:'open-case',id:'synthetic_recovery_case_'+i,walletId:wallet,kind:'support',evidenceHash:proof});await apply({operation:'close-case',id:'synthetic_recovery_case_'+i,kind:'support'});}
  for(const action of [{operation:'close-wallet',walletId:wallet,evidenceHash:proof},{operation:'hold',id:'synthetic_hosted_hold',scope:'wallet',subjectId:wallet,reason:'legal',evidenceHash:proof},{operation:'erase',scope:'attempt',subjectId:started.selection.attemptId,evidenceHash:proof},{operation:'erase',scope:'result',subjectId:result,evidenceHash:proof}])await apply(action);
  return c;
 }catch(error){c.database.close();throw error;}
}
