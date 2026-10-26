// The private Worker has performed the complete bounded inventory verifier.
// Accept only its authenticated completed proof, independently check the current
// head and index totals, then use the unchanged materialisation/replay/plan code.
// This does not release runtime access or replace post-import verification.
import {decryptRecord,recoveryHash} from './recovery-crypto.mjs';import {materializeSegmentedSnapshot} from './worker-snapshot-restore.mjs';import {replayVerifiedAuthorityTail} from './authority-tail-restore.mjs';import {prepareStreamedRestore} from './streamed-d1-restore.mjs';import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const fail=()=>{throw Error('retained_verified_plan_blocked');},hash=v=>recoveryHash(Buffer.from(JSON.stringify(v)));
export async function prepareRetainedVerifiedPlan({sourceDatabase,custody,key,boundary,verification,id,now=Date.now}){
 const at=now(),window=RETENTION_POLICY.backupDays*RETENTION_DAY;
 if(!Buffer.isBuffer(key)||key.length!==32||custody?.supportsCommitHead!==true||custody.all?.length!==17||new Set(custody.all.map(f=>f.folderId)).size!==17||!/^[a-f0-9]{64}$/.test(boundary?.sha256||'')||typeof verification?.progress!=='string'||verification.progress.length>3000000||verification.verified!==true)fail();
 const bytes=await custody.get(boundary.name);if(!bytes||recoveryHash(bytes)!==boundary.sha256)fail();const body=decryptRecord(bytes,key,boundary.name),state=decryptRecord(Buffer.from(verification.progress,'base64'),key,'verify-authority:'+boundary.sha256);
 if(![2,3,4].includes(body.version)||body.format!=='wybp-authority-boundary-v'+body.version||boundary.name!==body.id+'.boundary'||!Number.isSafeInteger(body.sequence)||body.sequence<1||!Number.isSafeInteger(body.createdAt)||!Number.isSafeInteger(body.expiresAt)||body.createdAt>at||body.expiresAt<=at||body.expiresAt-body.createdAt>window||state.version!==1||state.phase!=='complete'||state.receipt!==boundary.sha256||state.legacyBootstrap||!Number.isSafeInteger(state.inventory?.asOf)||state.inventory.asOf>at||state.inventory.asOf<body.createdAt||!Number.isSafeInteger(state.inventory.total)||state.inventory.total<0||!/^[a-f0-9]{64}$/.test(state.inventory.digest||''))fail();
 const head=await custody.readLatestCommitHead();if(!head||head.sequence!==body.sequence||head.head!==body.head||head.createdAt>at||head.expiresAt<=at||hash(head)!==hash(state.independentHead))fail();let count=0;
 for(const folder of custody.all){await custody.check(folder);const n=await folder.index.activeCount(state.inventory.asOf);if(!Number.isSafeInteger(n)||n<0)fail();count+=n;}if(count!==state.inventory.total)fail();
 const restored=await materializeSegmentedSnapshot(custody,key,body.snapshot,sourceDatabase);if(restored.sourceReceipt!==body.snapshot.sha256)fail();if(body.version===3)await replayVerifiedAuthorityTail({database:sourceDatabase,custody,key,pointer:boundary,verification,now});
 const provenance={boundarySha256:boundary.sha256,snapshotSha256:body.snapshot.sha256,createdAt:body.expiresAt-window,expiresAt:body.expiresAt},plan=await prepareStreamedRestore(sourceDatabase,custody,key,id,{pageSize:50,packPages:true,now:now(),provenance});
 return {plan,provenance,runtimeAccess:'blocked_pending_verified_import_and_latest_authority'};
}
