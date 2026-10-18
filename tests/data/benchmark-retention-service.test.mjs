import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {populatedRecoveryFixture} from '../helpers/populatedRecovery.mjs';
import {benchmarkRetentionService} from '../../worker/benchmarkRetentionService.mjs';
import {createAuthorityService,d1AuthorityAdapter} from '../../worker/authorityService.mjs';
import {D1Authority} from '../../scripts/authority-runtime.mjs';
import {recoveryHash} from '../../scripts/recovery-crypto.mjs';
const resource={name:'wybp-capacity-d1-r002',id:'11111111-1111-4111-8111-111111111111',account:'b6b22a9a87b5758725e5c499782160af'};
function returningBinding(database){
 const prepare=(sql,params=[])=>({bind:(...values)=>prepare(sql,values),async all(){return {success:true,results:database.prepare(sql).all(...params),meta:{}};},async run(){const statement=database.prepare(sql);if(statement.columns().length)return {success:true,results:statement.all(...params),meta:{}};const r=statement.run(...params);return {success:true,results:[],meta:{changes:Number(r.changes)}};}});
 return {prepare,async batch(statements){database.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());database.exec('COMMIT');return results;}catch(e){database.exec('ROLLBACK');throw e;}}};
}
test('actual retention fixture drains 36,000 child rows while held accounting, closure and deletion authority remain intact',async()=>{
 const c=await populatedRecoveryFixture(),files=new Map(),key=randomBytes(32),at=Date.now();
 const custody={get:async name=>files.get(name)||null,put:async(name,bytes)=>{if(files.has(name))assert.deepEqual(files.get(name),bytes);files.set(name,bytes);return recoveryHash(bytes);}};
 const binding=returningBinding(c.database),db=d1AuthorityAdapter(binding);await new D1Authority(db,custody,key,{now:()=>at}).initialise();
 const authority=createAuthorityService({db,custody,key,now:()=>at,snapshot:async()=>{throw Error('not a snapshot');},alert:async()=>{}});
 const service=benchmarkRetentionService({binding,db,authority,key,resource,now:()=>at});
 try{
  await assert.rejects(service.execute({kind:'fixture-step',step:600}),/unavailable/);
  await service.execute({kind:'fixture-step',step:0});
  const before=Object.fromEntries(['cowrie_wallets','cowrie_ledger','commerce_orders','stripe_webhook_events','retention_holds','retention_closures','retention_suppression'].map(t=>[t,c.database.prepare('SELECT * FROM '+t+' ORDER BY 1').all()]));
  assert.equal((await service.execute({kind:'fixture-step',step:0})).replayed,true);
  await assert.rejects(service.execute({kind:'fixture'}),/unavailable/);
  for(let step=1;step<600;step++)await service.execute({kind:'fixture-step',step});
  assert.deepEqual(await service.execute({kind:'fixture'}),{agedAnswers:36000,dependentRows:6002,protectedAnswers:12,syntheticOnly:true,holdsVerified:true});
  await service.execute({kind:'arrivals',id:'arrivals_0',rows:15});await service.execute({kind:'arrivals',id:'arrivals_0',rows:15});
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM daily_operation_limits WHERE id LIKE 'synthetic_outage_arrivals_%'").get().n,15);
  let remaining=36000,pending;
  for(let i=0;i<360;i++){const r=await service.execute({kind:'purge',id:'purge_'+i,limit:100});assert.equal(r.deleted,100);assert.equal(r.protectedRowsChanged,0);remaining-=100;assert.equal(r.remainingExpired,remaining);pending=(await authority.flush('synthetic_retention_'+i,25)).pending;}
  assert.equal(pending,0);
  assert.equal((await service.execute({kind:'purge',limit:100})).remainingExpired,0);
  for(const [t,rows] of Object.entries(before)){
   const actual=c.database.prepare('SELECT * FROM '+t+' ORDER BY 1').all();
   if(t==='retention_suppression'){
    assert.deepEqual(actual.filter(row=>rows.some(prior=>prior.subject_id===row.subject_id)),rows);
    const added=actual.filter(row=>!rows.some(prior=>prior.subject_id===row.subject_id));assert.equal(added.length,6000);
    assert.ok(added.every(row=>row.subject_id.startsWith('synthetic_outage_')&&row.forget_after-row.unavailable_at===2592000000));
   }else assert.deepEqual(actual,rows);
  }
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM quiz_attempts WHERE id LIKE 'synthetic_outage_attempt_%' AND status='anonymized' AND anonymous_subject_hash IS NULL").get().n,3000);
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM results WHERE id LIKE 'synthetic_outage_result_%' AND state='anonymized'").get().n,3000);
  assert.equal(c.database.prepare('SELECT COUNT(*) n FROM answers').get().n,12);
  assert.throws(()=>c.database.exec("UPDATE cowrie_wallets SET state='active'"),/cannot reopen/);
  assert.throws(()=>c.database.exec('UPDATE cowrie_wallets SET purchased_balance=99'),/cache mismatch/);
  await assert.rejects(service.execute({kind:'fixture-step',step:0}),/unavailable/); // never reseed after purge
  await assert.rejects(service.execute({kind:'purge',limit:101}),/unavailable/);
  console.log(JSON.stringify({environment:'local synthetic only',fixtureCompletions:3000,purgedAnswers:36000,independentObjects:files.size,ciphertextBytes:[...files.values()].reduce((n,b)=>n+b.length,0),maximumObjectBytes:Math.max(...[...files.values()].map(b=>b.length)),qualification:'Includes actual precommit intents and journal chunks; excludes prior hosted B stock, snapshots, restore plans, provider metadata/transfer and hosted billing. Not a capacity guarantee.'}));
 }finally{c.database.close();}
});
