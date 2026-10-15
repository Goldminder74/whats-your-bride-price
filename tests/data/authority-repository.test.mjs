import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setup, now, config, request, checkout, verified, adverse, balance } from '../helpers/cowrieCommerce.mjs';
import { CommerceService, D1CommerceRepository, InMemoryCommerceRateLimiter } from '../../db/commerce.ts';
import { createAuthorityService, applyAuthorityRetentionAction, purgeThroughAuthority } from '../../worker/authorityService.mjs';
import { createJournaledDatabase } from '../../worker/authorityDatabase.mjs';
import { applicationAuthorityDatabase } from '../../db/authorityDatabase.ts';
import { createOperationId } from '../../scripts/authority-runtime.mjs';
import { recoveryHash } from '../../scripts/recovery-crypto.mjs';
import { runtimeCommerceRateLimiter } from '../../db/commerceRateLimit.ts';
import {holdCapacityAttempt} from '../../scripts/isolated-capacity-check.mjs';
import {D1CowrieWalletRepository} from '../../db/cowrieWallet.ts';
import {D1QuestionSelectionRepository} from '../../db/questionSelection.ts';

test('production admission uses shared D1 buckets only with a stable private authority fence',async()=>{
  const c=await setup();try {
    const buckets=c.database.prepare("SELECT COUNT(*) n FROM daily_operation_limits").get().n;
    const authority={async readFence(){return 'verified-fence';}};
    const limiter=()=>runtimeCommerceRateLimiter(c.adapter,'off','production-app',authority);
    const outcomes=await Promise.all(Array.from({length:40},()=>limiter().consume('a'.repeat(64),now)));
    assert.equal(outcomes.filter(x=>x==='allowed').length,20);
    assert.equal(outcomes.filter(x=>x==='limited').length,20);
    assert.equal(await limiter().consume('b'.repeat(64),now),'allowed');
    for(const [profile,role,binding] of [['data','production-app',authority],['off','wrong',authority],['off','production-app',{}]])
      assert.equal(await runtimeCommerceRateLimiter(c.adapter,profile,role,binding).consume('c'.repeat(64),now),'unavailable');
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM daily_operation_limits").get().n,buckets+2);
  }finally{c.database.close();}
});

test('production admission rejects recovery failure and changed fences without granting an order',async()=>{
  const c=await setup();try {
    const buckets=c.database.prepare("SELECT COUNT(*) n FROM daily_operation_limits").get().n;
    let reads=0;
    const changed={async readFence(){return String(++reads);}};
    assert.equal(await runtimeCommerceRateLimiter(c.adapter,'off','production-app',changed).consume('d'.repeat(64),now),'unavailable');
    const failed={async readFence(){throw Error('synthetic recovery pending');}};
    assert.equal(await runtimeCommerceRateLimiter(c.adapter,'off','production-app',failed).consume('e'.repeat(64),now),'unavailable');
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM commerce_orders").get().n,0);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM daily_operation_limits").get().n,buckets+1);
  }finally{c.database.close();}
});

async function fixture() {
  const c = await setup(), files = new Map();
  const db = {
    async query(sql, params = []) { return c.database.prepare(sql).all(...params); },
    async batch(rows) {
      c.database.exec('BEGIN IMMEDIATE');
      try {
        const results = rows.map(({ sql, params = [] }) => {
          const statement = c.database.prepare(sql);
          if (statement.columns().length) return { success:true, results:statement.all(...params), meta:{changes:0} };
          const result = statement.run(...params);
          return {success:true, results:[], meta:{changes:Number(result.changes)}};
        });
        c.database.exec('COMMIT'); return results;
      } catch (error) { c.database.exec('ROLLBACK'); throw error; }
    },
  };
  c.database.prepare("INSERT INTO operational_recovery_checkpoints VALUES('journal','journal',?1,0,?1,0,'idle',1,?2,?3)").run('0'.repeat(64),now,now+30*86400000);
  const custody = { async get(name) {return files.get(name)||null;}, async put(name, bytes) {
    if (files.has(name)) assert.deepEqual(files.get(name),bytes); else files.set(name,bytes);
    return recoveryHash(bytes);
  }, async list() {return [...files.keys()].sort();} };
  const options = {db,custody,key:randomBytes(32),now:()=>now,alert:async()=>{},snapshot:async()=>{
    const bytes=Buffer.from('synthetic-encrypted-snapshot');
    return {files:[{name:'snapshot.enc',sha256:await custody.put('snapshot.enc',bytes)}]};
  }};
  const authority=createAuthorityService(options);
  const database=createJournaledDatabase(c.adapter,authority,{now:()=>now});
  c.service=new CommerceService(new D1CommerceRepository(database),new InMemoryCommerceRateLimiter(),config,()=>now,{cowriePurchasesEnabled:true});
  return {...c,authority,journaled:database,options,files};
}

test('Quick Play admission remains shared and fenced without retaining ephemeral buckets as authority',async()=>{
 const c=await fixture();try{
  const selection=new D1QuestionSelectionRepository(c.journaled),owner='f'.repeat(64);
  const before=c.database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n;
  const results=await Promise.all(Array.from({length:25},()=>selection.consumeRateLimit(owner,'start',now,20)));
  assert.ok(results.includes('limited'));assert.ok(results.filter(x=>x==='allowed').length<=20);
  assert.equal(c.database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,before);
  assert.equal(c.files.size,0);
  c.database.exec("UPDATE operational_recovery_checkpoints SET state='exporting' WHERE id='journal'");
  const buckets=c.database.prepare('SELECT SUM(request_count) n FROM daily_operation_limits').get().n;
  assert.equal(await selection.consumeRateLimit(owner,'start',now,20),'unavailable');
  assert.equal(c.database.prepare('SELECT SUM(request_count) n FROM daily_operation_limits').get().n,buckets);
 }finally{c.database.close();}
});

test('Quick Play changed recovery fences deny admission without creating financial authority',async()=>{
 const c=await setup();try{
  let reads=0,writes=0;
  const database=createJournaledDatabase(c.adapter,{async readFence(){return String(++reads);},async transact(){writes++;throw Error('must not grant financial state');}});
  const selection=new D1QuestionSelectionRepository(database);
  assert.equal(await selection.consumeRateLimit('e'.repeat(64),'start',now,20),'unavailable');
  assert.equal(writes,0);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,0);
 }finally{c.database.close();}
});

test('production-authority bonus availability and expiry preserve FIFO and reject unsafe read forms',async()=>{
  const c=await fixture();try {
    const id=c.database.prepare('SELECT id FROM cowrie_wallets').get().id;
    const credit=c.database.prepare("INSERT INTO cowrie_ledger(id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES(?1,?2,'bonus','bonus_credit',?3,'bonus',?4,?1,'perfect_region_day',?5,?6)");
    credit.run('ledger_'+'a'.repeat(32),id,3,'a'.repeat(64),now,now-180*86400000);
    credit.run('ledger_'+'b'.repeat(32),id,2,'b'.repeat(64),now+180*86400000,now);
    const repository=new D1CowrieWalletRepository(c.journaled,new D1QuestionSelectionRepository(c.journaled));
    assert.equal(await repository.getExpiredBonusBalance(id,now),3);
    assert.equal(await repository.expireBonuses({walletId:id,now,limit:1}),3);
    assert.equal(await repository.getExpiredBonusBalance(id,now),0);
    assert.equal(await repository.expireBonuses({walletId:id,now,limit:1}),0);
    assert.equal(c.database.prepare('SELECT bonus_balance FROM cowrie_wallets WHERE id=?').get(id).bonus_balance,2);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_ledger WHERE entry_type='bonus_expiry'").get().n,1);
    for(const sql of ['WITH hidden AS (SELECT 1) SELECT * FROM hidden','PRAGMA foreign_keys','UPDATE cowrie_wallets SET bonus_balance=0 RETURNING id'])
      await assert.rejects(c.journaled.prepare(sql).all(),/authority_read_scope/);
    assert.equal(await c.authority.ready(),true);
    assert.equal(c.database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{c.database.close();}
});

test('capacity hold reaches durable authority and repeat execution preserves one hold without accounting changes',async()=>{
  const c=await fixture();try {
    const before=c.database.prepare('SELECT COUNT(*) n FROM cowrie_ledger').get().n;
    await holdCapacityAttempt(c.authority,'synthetic_attempt',now);
    await holdCapacityAttempt(c.authority,'synthetic_attempt',now);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM retention_holds WHERE id='capacity_hold' AND scope='attempt' AND subject_id='synthetic_attempt' AND released_at IS NULL").get().n,1);
    assert.equal(c.database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,2);
    assert.equal(c.database.prepare('SELECT COUNT(*) n FROM cowrie_ledger').get().n,before);
    assert.equal(await c.authority.ready(),true);
    assert.equal(c.database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{c.database.close();}
});

test('real purchase, replay and full refund preserve accounting through authority',async()=>{
  const c=await fixture();try {
    const order=await c.service.startOrder(request(c));
    const event=await verified('checkout.session.completed',checkout(order));
    await c.service.webhook(event);await c.service.webhook(event);
    assert.equal(balance(c).purchased_balance,5);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_ledger WHERE entry_type='purchase_credit'").get().n,1);
    await c.service.webhook(await verified('charge.refunded',adverse()));
    assert.equal(balance(c).purchased_balance,0);
    assert.ok(c.database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n>=3);
    assert.ok([...c.files.keys()].some(name=>name.endsWith('.intent')));
    await c.authority.deliver('repository_delivery');
    assert.equal(await c.authority.ready(),true);
    assert.equal(c.database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{c.database.close();}
});

test('production-selected limiter permits a journalled purchase and exact refund without duplicate credit',async()=>{
  const c=await fixture();try {
    const service=new CommerceService(new D1CommerceRepository(c.journaled),runtimeCommerceRateLimiter(c.adapter,'off','production-app',c.authority),config,()=>now,{cowriePurchasesEnabled:true});
    const order=await service.startOrder(request(c));
    const event=await verified('checkout.session.completed',checkout(order));
    await service.webhook(event);await service.webhook(event);
    assert.equal(balance(c).purchased_balance,5);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_ledger WHERE entry_type='purchase_credit'").get().n,1);
    await service.webhook(await verified('charge.refunded',adverse()));
    assert.equal(balance(c).purchased_balance,0);
    assert.ok(c.database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n>=3);
  }finally{c.database.close();}
});

test('closure and bounded deletion use existing authority, holds and immutable closure rules',async()=>{
  const c=await fixture();try {
    const id=c.database.prepare('SELECT id FROM cowrie_wallets').get().id;
    await applyAuthorityRetentionAction(c.authority,createOperationId(now),{operation:'hold',id:'synthetic_hold',scope:'wallet',subjectId:id,reason:'legal',evidenceHash:'a'.repeat(64)},now);
    await assert.rejects(applyAuthorityRetentionAction(c.authority,createOperationId(now),{operation:'close-wallet',walletId:id,evidenceHash:'b'.repeat(64)},now));
    assert.equal(c.database.prepare('SELECT COUNT(*) n FROM retention_closures').get().n,0);
    // A rejected SQL plan leaves an unresolved durable intent and correctly fences
    // later access; it is not silently discarded to make a closure succeed.
    await assert.rejects(c.authority.ready());
  }finally{c.database.close();}
  const clean=await fixture();try {
    const id=clean.database.prepare('SELECT id FROM cowrie_wallets').get().id;
    await applyAuthorityRetentionAction(clean.authority,createOperationId(now),{operation:'close-wallet',walletId:id,evidenceHash:'b'.repeat(64)},now);
    assert.equal(clean.database.prepare('SELECT closed_at FROM cowrie_wallets').get().closed_at,now);
    await purgeThroughAuthority(clean.adapter,clean.authority,now,2);
    assert.equal(clean.database.prepare('SELECT closed_at FROM cowrie_wallets').get().closed_at,now);
    assert.equal(clean.database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{clean.database.close();}
});

test('unknown retry outcome never repeats a write or invents affected rows',async()=>{
  const c=await fixture();try {
    const op=createOperationId(now),rows=[{sql:"UPDATE cowrie_wallets SET state='frozen',frozen_at=?1 WHERE state='active'",params:[now]}];
    const first=await c.authority.transact(op,rows);assert.equal(first[0].meta.changes,1);
    await assert.rejects(c.authority.transact(op,rows),/authority_result_recovery_required/);
    assert.equal(await c.authority.ready(),true);
    assert.equal(c.database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,1);
    assert.equal(c.database.prepare('SELECT state FROM cowrie_wallets').get().state,'frozen');
  }finally{c.database.close();}
});

test('production cannot fall back to raw D1; foreign statements and disguised writes reject',async()=>{
  const c=await fixture();try {
    assert.equal(applicationAuthorityDatabase({DB:c.adapter},false),null);
    assert.equal(applicationAuthorityDatabase({DB:c.adapter},true),c.adapter);
    await assert.rejects(c.journaled.batch([c.adapter.prepare('SELECT 1')]),/foreign_statement/);
    await assert.rejects(c.journaled.prepare('WITH x AS (SELECT 1) DELETE FROM cowrie_wallets').all(),/read_scope/);
    assert.equal(c.database.prepare('SELECT COUNT(*) n FROM cowrie_wallets').get().n,1);
  }finally{c.database.close();}
});

test('a lost durable upload retries the same statement without a second financial write',async()=>{
  const c=await fixture();try {
    const put=c.options.custody.put;let fail=true;
    c.options.custody.put=async(name,bytes)=>{const result=await put(name,bytes);if(name.endsWith('.intent')&&fail){fail=false;throw Error('lost_upload_ack');}return result;};
    const statement=c.journaled.prepare("UPDATE cowrie_wallets SET state='frozen',frozen_at=?1 WHERE state='active'").bind(now);
    await assert.rejects(statement.run(),/lost_upload_ack/);
    await assert.rejects(c.journaled.prepare('SELECT state FROM cowrie_wallets').first());
    assert.equal((await statement.run()).meta.changes,1);
    assert.equal(c.database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,1);
    assert.equal([...c.files.keys()].filter(name=>name.endsWith('.intent')).length,1);
  }finally{c.database.close();}
});

test('concurrent owners cannot cross a writer fence; a retry reads the winning order',async()=>{
  const c=await fixture();try {
    const outcomes=await Promise.allSettled([c.service.startOrder(request(c)),c.service.startOrder(request(c))]);
    assert.ok(outcomes.some(row=>row.status==='fulfilled'));
    const recovered=await c.service.startOrder(request(c));
    assert.equal(c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,1);
    assert.ok(outcomes.filter(row=>row.status==='fulfilled').every(row=>row.value.publicOrderReference===recovered.publicOrderReference));
  }finally{c.database.close();}
});

test('a closure committed during a read rejects the stale active-wallet projection',async()=>{
  const c=await fixture();try {
    const id=c.database.prepare('SELECT id FROM cowrie_wallets').get().id;
    const raw={prepare(sql){const statement=c.adapter.prepare(sql);return {bind(...params){const bound=statement.bind(...params);return {async all(){
      const result=await bound.all();
      await applyAuthorityRetentionAction(c.authority,createOperationId(now),{operation:'close-wallet',walletId:id,evidenceHash:'c'.repeat(64)},now);
      return result;
    }};}};}};
    const database=createJournaledDatabase(raw,c.authority,{now:()=>now});
    await assert.rejects(database.prepare('SELECT state FROM cowrie_wallets').first(),/read_changed/);
    assert.equal(c.database.prepare('SELECT closed_at FROM cowrie_wallets').get().closed_at,now);
  }finally{c.database.close();}
});

test('missing recovery suppression blocks repository reads and writes before durable intent',async()=>{
  const c=await fixture();try {
    const authority=createAuthorityService({...c.options,recoveryReady:async()=>{throw Error('restore_review_required');}});
    const database=createJournaledDatabase(c.adapter,authority,{now:()=>now});
    await assert.rejects(database.prepare('SELECT state FROM cowrie_wallets').first(),/restore_review_required/);
    await assert.rejects(database.prepare("UPDATE cowrie_wallets SET state='frozen'").run(),/restore_review_required/);
    assert.equal(c.files.size,0);
    assert.equal(c.database.prepare('SELECT state FROM cowrie_wallets').get().state,'active');
  }finally{c.database.close();}
});
