import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {setup,now} from '../helpers/cowrieCommerce.mjs';
import {benchmarkGameService} from '../../worker/benchmarkGameService.mjs';
import {createAuthorityService,d1AuthorityAdapter} from '../../worker/authorityService.mjs';
import {D1Authority} from '../../scripts/authority-runtime.mjs';
import {recoveryHash} from '../../scripts/recovery-crypto.mjs';

function sqliteD1(database){
 const prepare=(sql,params=[])=>({sql,params,bind:(...values)=>prepare(sql,values),
  async all(){const s=database.prepare(sql);return {success:true,results:s.all(...params),meta:{}};},
  async first(column){const row=database.prepare(sql).get(...params);return row?(column===undefined?row:row[column]):null;},
  async run(){const s=database.prepare(sql);if(s.columns().length)return {success:true,results:s.all(...params),meta:{}};const result=s.run(...params);return {success:true,results:[],meta:{changes:Number(result.changes)}};},
 });
 return {prepare,async batch(rows){database.exec('BEGIN IMMEDIATE');try{const result=[];for(const row of rows)result.push(await row.run());database.exec('COMMIT');return result;}catch(error){database.exec('ROLLBACK');throw error;}}};
}

async function fixture(){
 const c=await setup(),key=randomBytes(32),files=new Map();
 const custody={get:async name=>files.get(name)||null,put:async(name,bytes)=>{const prior=files.get(name);if(prior)assert.deepEqual(prior,bytes);files.set(name,bytes);return recoveryHash(bytes);}};
 const binding=sqliteD1(c.database),raw=d1AuthorityAdapter(binding);await new D1Authority(raw,custody,key,{now:()=>now}).initialise();
 const authority=createAuthorityService({db:raw,custody,key,now:()=>now,alert:async()=>{},snapshot:async()=>{throw Error('not a snapshot test');}});
 const options={binding,authority,syntheticKey:randomBytes(32),databaseResource:{name:'wybp-capacity-d1-r002',id:'11111111-1111-4111-8111-111111111111',account:'b6b22a9a87b5758725e5c499782160af'},runId:'synthetic_test',now:()=>now,verifyAssets:async()=>true};
 return {c,options,files,service:benchmarkGameService(options)};
}
test('actual fenced repositories complete twelve answers once and preserve another synthetic wallet',async()=>{
 const f=await fixture();try{
  const before=f.c.database.prepare('SELECT * FROM cowrie_wallets').all();
  const command={identity:'game_1',region:'west'},started=await f.service.execute({...command,kind:'start'});
  assert.equal(started.questionCount,12);
  assert.deepEqual(await f.service.execute({...command,kind:'start'}),started);
  for(let question=1;question<=12;question++){
   const result=await f.service.execute({...command,kind:'answer',question});assert.equal(result.accepted,true);
   if(question===7){const recovery=await benchmarkGameService(f.options).execute({...command,kind:'recover'});assert.equal(recovery.selectionHash,started.selectionHash);assert.equal(recovery.additionalAttempts,0);assert.equal(recovery.chargeCount,0);}
  }
  const completed=await f.service.execute({...command,kind:'complete'});
  assert.equal(completed.persisted,true);assert.equal(completed.answerCount,12);
  assert.deepEqual(await benchmarkGameService(f.options).execute({...command,kind:'complete'}),completed);
  assert.equal(f.c.database.prepare('SELECT COUNT(*) n FROM answers').get().n,12);
  assert.equal(f.c.database.prepare('SELECT COUNT(*) n FROM results').get().n,1);
  assert.equal(f.c.database.prepare('SELECT COUNT(*) n FROM quiz_attempts').get().n,1);
  assert.deepEqual(f.c.database.prepare('SELECT * FROM cowrie_wallets WHERE id=?').all(before[0].id),before);
  assert.ok(f.c.database.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n>0);
  assert.ok([...f.files.keys()].some(name=>name.endsWith('.intent')));
  assert.deepEqual(f.c.database.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal((await f.service.execute({...command,kind:'result'})).sharingVerified,false);
 }finally{f.c.database.close();}
});
test('isolated target, unknown attempt and invalid question fail closed without reset',async()=>{
 const f=await fixture();try{
  assert.throws(()=>benchmarkGameService({...f.options,databaseResource:{...f.options.databaseResource,id:'1a268b28-e6d5-4431-8f84-a886df9369f1'}}),/resource_scope/);
  await assert.rejects(f.service.execute({identity:'missing',kind:'complete'}),/^Error: benchmark_game_unavailable$/);
  await f.service.execute({identity:'game_2',region:'east',kind:'start'});
  await assert.rejects(f.service.execute({identity:'game_2',kind:'answer',question:13}),/^Error: benchmark_game_unavailable$/);
  assert.equal(f.c.database.prepare('SELECT COUNT(*) n FROM results').get().n,0);
 }finally{f.c.database.close();}
});
