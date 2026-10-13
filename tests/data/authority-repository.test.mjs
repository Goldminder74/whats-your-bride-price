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
