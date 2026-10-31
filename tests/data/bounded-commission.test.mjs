import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {loadMigrationPlan,applyMigrationPlan} from '../../scripts/data-migrations.mjs';
import {populatedRecoveryFixture} from '../helpers/populatedRecovery.mjs';
import {boundedCommissionStep} from '../../worker/boundedCommission.mjs';
import {recoveryHash} from '../../scripts/recovery-crypto.mjs';
test('lost upload and rolled-back final receipt resume without opening access or duplicating the initial baseline',async()=>{
 const sql=new DatabaseSync(':memory:'),key=randomBytes(32),files=new Map();let loseUpload=true,loseCommit=true;
 applyMigrationPlan(sql,(await loadMigrationPlan()).slice(0,14));
 const db={query:async(s,p=[])=>sql.prepare(s).all(...p),batch:async rows=>{sql.exec('BEGIN');try{const result=rows.map(r=>sql.prepare(r.sql).all(...(r.params||[])));if(loseCommit&&rows.some(r=>r.sql.startsWith('INSERT INTO retention_restore'))){loseCommit=false;throw Error('synthetic_rollback');}sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const custody={get:async n=>files.get(n)||null,put:async(n,b)=>{if(files.has(n))assert.deepEqual(files.get(n),b);files.set(n,b);if(loseUpload){loseUpload=false;throw Error('synthetic_upload_response_lost');}return recoveryHash(b);},async *inventoryPages(){yield [...files.keys()].map(name=>({name}));}};
 let progress=null,result,interruptions=0;
 try{
  for(let i=0;i<30;i++){
   try{result=await boundedCommissionStep(db,custody,key,progress);if(result.complete)break;progress=result.progress;}
   catch(error){assert.match(error.message,/synthetic_/);interruptions++;assert.equal(sql.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);assert.equal(sql.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='journal'").get().state,'exporting');}
  }
  assert.equal(interruptions,2);assert.equal(result.verified,true);assert.match(result.receipt,/^[a-f0-9]{64}$/);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id='baseline'").get().n,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,1);
  assert.deepEqual(await boundedCommissionStep(db,custody,key,progress),result);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM cowrie_wallets').get().n,0);
 }finally{sql.close();}
});
test('populated financial/closure/hold data can never be initialised as an empty baseline',async()=>{
 const c=await populatedRecoveryFixture();let io=0;
 try{const db={query:async(s,p=[])=>c.database.prepare(s).all(...p),batch:async()=>{assert.fail('no mutation authorised');}};
  await assert.rejects(boundedCommissionStep(db,{get:async()=>{io++;},put:async()=>{io++;}},randomBytes(32)));assert.equal(io,0);
 }finally{c.database.close();}
});
