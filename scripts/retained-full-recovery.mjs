// Isolated synthetic recovery only, through the new private metered controller.
// The caller has already journalled replacement of the disposable mirror. This
// code never deletes a database, reads the serving source or opens application access.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdir,realpath,statfs,mkdtemp,rm} from 'node:fs/promises';import {resolve,join,sep} from 'node:path';import {tmpdir} from 'node:os';
import {retainedRemoteCustody} from './retained-remote-custody.mjs';
import {discoverLatestAuthority} from './discover-authority-tail.mjs';
import {prepareRetainedVerifiedPlan} from './retained-verified-plan.mjs';
import {decryptRecord,recoveryHash} from './recovery-crypto.mjs';
const fail=()=>{throw Error('retained_full_recovery_blocked');};
export async function retainedFullRecovery({session,key,folders,snapshot,directory,upper,now=Date.now}){
 if(typeof session?.call!=='function'||typeof session?.loop!=='function'||typeof session?.mark!=='function'||typeof session?.reconcile!=='function'||typeof session?.recoveryPlan!=='function'||!Buffer.isBuffer(key)||key.length!==32)fail();
 await session.reconcile();const initial=await session.readback();if(initial.phase!=='recovery'||initial.pending||initial.stopped)fail();const incident=await session.mark('recovery-incident'),round=randomUUID();
 const temp=await realpath(tmpdir()),root=resolve(directory);if(!root.startsWith(temp+sep))fail();await mkdir(root,{recursive:true});if(!(await realpath(root)).startsWith(temp+sep))fail();const space=await statfs(root);if(Number(space.bavail)*Number(space.bsize)<7000000000)fail();
 const scratch=await mkdtemp(join(root,'retained-materialisation-'));
 let serial=0,materialised;
 const custody=retainedRemoteCustody({step:(packet,bounds)=>{const command={...packet};delete command.id;return session.call(command,bounds);},key,folders,upper,windows:true,operationId:()=> 'retained_remote_'+serial++});
 try{
  // Persistent target file IDs are rebuilt first. Every page is unfiltered and
  // signed; successful metadata streaming alone is not a recovered application.
  for(let folder=0;folder<17;folder++)await session.loop({kind:'recovery-index-page',folder},upper,{maxSteps:100000});
  let recovered=await session.recoveryPlan();
  if(recovered){
   // The verified materialisation/plan is pinned BEFORE the first import. A
   // lost import reply resumes that plan, rather than rebuilding/reuploading
   // the full stock or accepting its old census as a new inventory proof.
   if(recovered.version!==1||recovered.incidentAt!==incident||recovered.initialSnapshotSha256!==snapshot.sha256||recovered.accountingVerified!==true)fail();
   const bytes=await custody.get(recovered.boundary.name);if(!bytes||recoveryHash(bytes)!==recovered.boundary.sha256)fail();const body=decryptRecord(bytes,key,recovered.boundary.name),head=await custody.readLatestCommitHead();
   if(recoveryHash(Buffer.from(JSON.stringify(head)))!==recovered.independentHeadSha256||head?.sequence!==body.sequence||head?.head!==body.head||head.expiresAt<=now()||head.createdAt>now()||body.expiresAt<=now()||body.snapshot?.sha256!==recovered.provenance?.snapshotSha256)fail();
  }else{
  materialised=new DatabaseSync(join(scratch,'materialised.sqlite'));
  if(materialised.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get())fail();
  const tail=await discoverLatestAuthority({database:materialised,custody,key,snapshot,id:'retained_latest_history',writersStopped:true,maxFiles:1600000,maxPages:100000,now});
  // An earlier invocation may have created restore-plan objects before losing
  // its import reply. Its completed census cannot describe that newer stock.
  // Reconcile the pending reply first, then pay for a genuinely fresh proof;
  // original incident time, import identity and cumulative usage never reset.
  const before=await session.loop({kind:'recovery-boundary',boundary:tail.boundary,verificationRound:'before-materialisation:'+round},upper,{done:'verified',maxSteps:100000});
  const prepared=await prepareRetainedVerifiedPlan({sourceDatabase:materialised,custody,key,boundary:tail.boundary,verification:before,id:'retained_full_history_plan',now});
  const badBalances=materialised.prepare("SELECT COUNT(*) n FROM cowrie_wallets w WHERE purchased_balance!=COALESCE((SELECT SUM(delta) FROM cowrie_ledger WHERE wallet_id=w.id AND bucket='purchased'),0) OR bonus_balance!=COALESCE((SELECT SUM(delta) FROM cowrie_ledger WHERE wallet_id=w.id AND bucket='bonus'),0)").get().n;
  const activeClosures=materialised.prepare("SELECT COUNT(*) n FROM retention_closures c JOIN cowrie_wallets w ON w.id=c.wallet_id WHERE w.state!='deleted' OR w.closed_at IS NOT c.closed_at").get().n;
  const activeSuppression=materialised.prepare("SELECT COUNT(*) n FROM retention_suppression s WHERE (scope='wallet' AND EXISTS(SELECT 1 FROM cowrie_wallets w WHERE w.id=s.subject_id AND w.state='active')) OR (scope='attempt' AND EXISTS(SELECT 1 FROM quiz_attempts a WHERE a.id=s.subject_id AND a.status IN ('completed','in_progress'))) OR (scope='result' AND EXISTS(SELECT 1 FROM results r WHERE r.id=s.subject_id AND r.state='active'))").get().n;
  if(badBalances||activeClosures||activeSuppression||materialised.prepare('PRAGMA foreign_key_check').all().length)fail();
  const head=await custody.readLatestCommitHead(),bytes=await custody.get(tail.boundary.name);if(!bytes||recoveryHash(bytes)!==tail.boundary.sha256)fail();const body=decryptRecord(bytes,key,tail.boundary.name);if(head?.sequence!==body.sequence||head?.head!==body.head||head.expiresAt<=now())fail();
  recovered={version:1,incidentAt:incident,initialSnapshotSha256:snapshot.sha256,independentHeadSha256:recoveryHash(Buffer.from(JSON.stringify(head))),plan:prepared.plan,boundary:tail.boundary,provenance:prepared.provenance,accountingVerified:true};await session.recoveryPlan(recovered);
  }
  const job='recovery_retained_full_history',command={plan:recovered.plan,boundary:recovered.boundary,snapshotSha256:recovered.provenance.snapshotSha256,job};
  await session.loop({kind:'recovery-import',...command},upper,{done:'imported',maxSteps:40000});
  await session.loop({kind:'recovery-verify',...command},upper,{done:'verified',maxSteps:40000});
  // Recheck the independent latest head/inventory AFTER the verified import.
  // A newer financial/closure/deletion/hold event makes release fail closed.
  const verification=await session.loop({kind:'recovery-boundary',boundary:recovered.boundary,verificationRound:'after-import:'+round},upper,{done:'verified',maxSteps:100000});
  const finalized=(await session.call({kind:'recovery-finalize',...command,verification},upper)).value;
  const elapsedMs=now()-incident;if(elapsedMs<0||elapsedMs>24*3600000||!/^[a-f0-9]{64}$/.test(finalized?.receipt||''))fail();
  return {verified:true,elapsedMs,latestBoundary:recovered.boundary,accountingVerified:true,closedWalletsBlocked:true,deletionsSuppressed:true,receiptSha256:finalized.receipt,runtimeAccess:'blocked: expected runtime receipt and access flags not installed by this controller'};
 }finally{materialised?.close();if(!scratch.startsWith(root+sep+'retained-materialisation-'))fail();await rm(scratch,{recursive:true,force:true});}
}
