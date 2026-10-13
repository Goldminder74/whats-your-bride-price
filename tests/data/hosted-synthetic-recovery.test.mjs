import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {populatedRecoveryFixture} from '../helpers/populatedRecovery.mjs';
import {buildHostedRecoveryBundle} from '../../scripts/prepare-hosted-recovery.mjs';
import {hostedSyntheticRecovery} from '../../worker/hostedSyntheticRecovery.mjs';
import {applyMigrationPlan,loadMigrationPlan} from '../../scripts/data-migrations.mjs';
import {recoveryHash} from '../../scripts/recovery-crypto.mjs';
test('pinned hosted rehearsal resumes committed pages, blocks premature completion and restores original empty schema',async()=>{
 const c=await populatedRecoveryFixture(),target=new DatabaseSync(':memory:'),files=new Map(),key=randomBytes(32);
 try{
  applyMigrationPlan(target,await loadMigrationPlan());
  const triggers=target.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name NOT LIKE 'operational_%' ORDER BY name").all();
  const bundle=buildHostedRecoveryBundle(c.database,triggers),hash=recoveryHash(Buffer.from(JSON.stringify(bundle)));
  const db={query:async(s,p=[])=>target.prepare(s).all(...p),async batch(rows){target.exec('BEGIN');try{const result=rows.map(r=>target.prepare(r.sql).all(...r.params));target.exec('COMMIT');return result;}catch(e){target.exec('ROLLBACK');throw e;}}};
  const custody={get:async name=>files.get(name)||null,async put(name,bytes){if(files.has(name))assert.deepEqual(files.get(name),bytes);else files.set(name,bytes);return recoveryHash(bytes);}};
  const env={WYBP_AUTHORITY_ROLE:'production-ops',WYBP_AUTHORITY_DATABASE_NAME:'wybp-prod-d1-r001',WYBP_SYNTHETIC_RESTORE_PLAN_SHA256:hash};
  const make=()=>hostedSyntheticRecovery({env,db,custody,key});
  await assert.rejects(make().stage({...bundle,scope:'unapproved'}));await make().stage(bundle);
  await assert.rejects(make().finish());const first=await make().step({interrupt:true});assert.equal(first.cursor,1);assert.equal(first.accessBlocked,true);
  let step;do{step=await make().step();assert.equal(step.accessBlocked,true);}while(!step.imported);
  let verified;do{verified=await make().finish();}while(!verified.verified);await make().finish();assert.equal((await make().verifyProtection()).verified,true);
  const repeated=await make().step();assert.equal(repeated.imported,true);assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_cases').get().n,123);
  do{step=await make().step({cleanup:true});assert.equal(step.accessBlocked,true);}while(!step.imported);
  do{verified=await make().finish(true);}while(!verified.verified);assert.equal(target.prepare('SELECT COUNT(*) n FROM cowrie_wallets').get().n,0);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,14);assert.deepEqual(target.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{c.database.close();target.close();}
});
