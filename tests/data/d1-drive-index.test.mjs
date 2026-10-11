import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { loadMigrationPlan, applyMigrationPlan } from '../../scripts/data-migrations.mjs';
import { D1DriveIndex } from '../../scripts/d1-drive-index.mjs';
import { DriveCustody } from '../../scripts/drive-custody.mjs';
async function fixture(){
 const sql=new DatabaseSync(':memory:');applyMigrationPlan(sql,await loadMigrationPlan());
 const db={async query(s,p=[]){return sql.prepare(s).all(...p);},async batch(rows){sql.exec('BEGIN');try{const result=rows.map(r=>sql.prepare(r.sql).all(...r.params));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,db};
}
test('independent index instances reserve exactly one durable ID and retries do not renew retention',async()=>{
 const {sql,db}=await fixture();try{let now=Date.now();const a=new D1DriveIndex(db,'synthetic_folder_001',{now:()=>now}),b=new D1DriveIndex(db,'synthetic_folder_001',{now:()=>now});
 const ids=await Promise.all([a.reserve('one.intent','synthetic_file_001'),b.reserve('one.intent','synthetic_file_002')]);assert.equal(ids[0],ids[1]);
 const before=sql.prepare("SELECT created_at,expires_at FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%'").get();now+=86400000;
 assert.equal(await new D1DriveIndex(db,'synthetic_folder_001').get('one.intent'),ids[0]);await a.reserve('one.intent','synthetic_file_003');
 assert.deepEqual(sql.prepare("SELECT created_at,expires_at FROM operational_recovery_checkpoints WHERE id LIKE 'drive_file:%'").get(),before);
 now=before.expires_at;await assert.rejects(a.reserve('one.intent','synthetic_file_004'),/drive_reservation_expired/);
 assert.equal((await a.expired()).length,1);
 }finally{sql.close();}
});
test('failed provider deletion preserves reservation; acknowledged deletion permits bounded cleanup',async()=>{
 const {sql,db}=await fixture();try{let now=Date.now();const index=new D1DriveIndex(db,'synthetic_folder_001',{now:()=>now});await index.reserve('one.intent','synthetic_file_001');now+=30*86400000;
 let fail=true;const c=new DriveCustody({folderId:'synthetic_folder_001',accessToken:async()=> 'synthetic',index,fetcher:async(_url,o)=>{assert.equal(o.method,'DELETE');return new Response(null,{status:fail?503:204});}});
 await assert.rejects(c.cleanupTemporary(now,1),/drive_delete/);assert.equal(await index.get('one.intent'),'synthetic_file_001');fail=false;
 assert.equal(await c.cleanupTemporary(now,1),1);assert.equal(await index.get('one.intent'),null);assert.equal(await c.cleanupTemporary(now,1),0);
 }finally{sql.close();}
});

test('lost D1 mappings rebuild only from a pinned inventory and verified private-folder bytes',async()=>{
 const {recoveryHash}=await import('../../scripts/recovery-crypto.mjs');const {sql,db}=await fixture();try{
 const index=new D1DriveIndex(db,'synthetic_folder_001'),bytes=Buffer.from('encrypted-synthetic'),files=[{name:'one.intent',id:'synthetic_file_001',sha256:recoveryHash(bytes)}];
 const receipt=recoveryHash(Buffer.from(JSON.stringify(files)));let wrongFolder=false;
 const c=new DriveCustody({folderId:'synthetic_folder_001',index,accessToken:async()=> 'synthetic',fetcher:async url=>url.includes('alt=media')?new Response(bytes):Response.json({id:files[0].id,name:files[0].name,parents:[wrongFolder?'another_folder_001':'synthetic_folder_001'],trashed:false})});
 await assert.rejects(c.recoverIndex(files,'0'.repeat(64)),/drive_inventory_receipt/);assert.equal(await index.get('one.intent'),null);
 wrongFolder=true;await assert.rejects(c.recoverIndex(files,receipt),/drive_recovery_scope/);assert.equal(await index.get('one.intent'),null);
 wrongFolder=false;assert.equal(await c.recoverIndex(files,receipt),1);assert.equal(await c.recoverIndex(files,receipt),1);assert.equal(await index.get('one.intent'),files[0].id);
 }finally{sql.close();}
});

test('lost delete acknowledgement retries with the same ID; unexpired reservations are never purged',async()=>{
 const {sql,db}=await fixture();try{let now=Date.now(),calls=0;const index=new D1DriveIndex(db,'synthetic_folder_001',{now:()=>now});await index.reserve('one.intent','synthetic_file_001');
 const c=new DriveCustody({folderId:'synthetic_folder_001',accessToken:async()=> 'synthetic',index,fetcher:async()=>{calls++;if(calls===1)throw Error('lost_after_delete');return new Response(null,{status:404});}});
 assert.equal(await c.cleanupTemporary(now,1),0);assert.equal(calls,0);now+=30*86400000;
 await assert.rejects(c.cleanupTemporary(now,1),/drive_transport/);assert.equal(await index.get('one.intent'),'synthetic_file_001');
 assert.equal(await c.cleanupTemporary(now,1),1);assert.equal(await index.get('one.intent'),null);
 }finally{sql.close();}
});
