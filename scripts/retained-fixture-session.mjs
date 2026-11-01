// Historical SYNTHETIC fixture preparation after a new grant is installed.
// Uses the actual private metered custody path/IDs. Never seeds production,
// deletes a target, changes flags, installs credentials or invents a completion.
import {DatabaseSync} from 'node:sqlite';import {mkdtemp,rm,realpath,statfs,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
import {retainedRemoteCustody} from './retained-remote-custody.mjs';
import {D1Authority,createOperationId} from './authority-runtime.mjs';
import {createAuthorityService} from '../worker/authorityService.mjs';
import {prepareRetainedVerifiedPlan} from './retained-verified-plan.mjs';
import {PurchaseConfirmations} from '../db/purchaseConfirmations.mjs';
const fail=()=>{throw Error('retained_fixture_preparation_blocked');};
const adapter=db=>({query:async(s,p=[])=>db.prepare(s).all(...p),batch:async rows=>{db.exec('BEGIN');try{const r=rows.map(v=>db.prepare(v.sql).all(...(v.params||[])));db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}});
export async function prepareRetainedFixtureSession({session,sourceDatabase,key,folders,upper,directory,now=Date.now}){
 const status=await session.readback();if(status.phase!=='setup'||status.pending||status.stopped||!sourceDatabase?.prepare||!Buffer.isBuffer(key)||key.length!==32||!sourceDatabase.prepare("SELECT id FROM quiz_attempts WHERE id='retained_attempt_0'").get())fail();
 // Never upload immutable historical contracts encrypted under a different
 // fixture key. Hosted generation must use the SAME private benchmark key.
 const contracts=new PurchaseConfirmations(sourceDatabase,key);for(const row of sourceDatabase.prepare('SELECT * FROM purchase_confirmations').iterate())contracts.open(row);
 const temp=await realpath(tmpdir()),root=resolve(directory);if(!root.startsWith(temp+sep))fail();await mkdir(root,{recursive:true});if(!(await realpath(root)).startsWith(temp+sep))fail();const space=await statfs(temp);if(Number(space.bavail)*Number(space.bsize)<7000000000)fail();
 let serial=0;const step=(packet,bounds)=>{const command={...packet};delete command.id;return session.call(command,bounds);},custody=retainedRemoteCustody({step,key,folders,upper,windows:true,operationId:()=> 'retained_fixture_rpc_'+serial++,mode:'custody'}),db=adapter(sourceDatabase),authority=new D1Authority(db,custody,key,{now});await authority.initialise();
 if((await authority.head()).sequence===0)await authority.mutate(createOperationId(now()),[{sql:'UPDATE quiz_attempts SET id=id WHERE id=?1',params:['retained_attempt_0']}]);
 // This is an offline historical fixture, not the serving-source capture path.
 // Measured source availability uses the corrected mirror RPC instead.
 const service=createAuthorityService({db,custody,key,now,alert:async()=>{},snapshot:async()=>fail()});let capture,n=0;
 do{capture=await service.advanceSnapshot('retained_fixture_base');if(++n>20000)fail();}while(!capture.complete);
 const boundary={name:'retained_fixture_base.boundary',sha256:capture.receipt},scratch=await mkdtemp(join(root,'retained-fixture-plan-'));let plain;
 try{
  plain=new DatabaseSync(join(scratch,'materialised.sqlite'));
  const verification=await session.loop({kind:'verify-boundary',boundary,verificationRound:'fixture-before-materialisation'},upper,{done:'verified',maxSteps:100000});
  const prepared=await prepareRetainedVerifiedPlan({sourceDatabase:plain,custody,key,boundary,verification,id:'retained_fixture_plan',now});
  return {boundary,...prepared,qualification:'Actual metered custody preparation/IDs; historical rows are not measured completed games. Runtime remains inaccessible until separate verified import and receipt configuration.'};
 }finally{plain?.close();if(!scratch.startsWith(root+sep+'retained-fixture-plan-'))fail();await rm(scratch,{recursive:true,force:true});}
}
