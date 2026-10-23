// Explicit offline recovery preparation. Caller supplies protected local SQLite
// files/custody; no credentials, target deletion, migration or access release.
import {verifyAuthorityBoundaryStep} from '../worker/boundedAuthority.mjs';
import {materializeSegmentedSnapshot} from './worker-snapshot-restore.mjs';
import {prepareStreamedRestore} from './streamed-d1-restore.mjs';
import {decryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
export async function prepareAuthorityRestore({checkpointDatabase,sourceDatabase,custody,key,boundary,id,now=Date.now}){
 let verification,progress=null;
 do{verification=await verifyAuthorityBoundaryStep(checkpointDatabase,custody,key,boundary,progress,{now});progress=verification.progress;}while(!verification.verified);
 const bytes=await custody.get(boundary.name);if(!bytes||recoveryHash(bytes)!==boundary.sha256)throw Error('authority_restore_plan_unavailable');
 const body=decryptRecord(bytes,key,boundary.name);
 const materialized=await materializeSegmentedSnapshot(custody,key,body.snapshot,sourceDatabase);
 if(materialized.sourceReceipt!==body.snapshot.sha256)throw Error('authority_restore_plan_unavailable');
 const provenance={boundarySha256:boundary.sha256,snapshotSha256:body.snapshot.sha256,createdAt:body.expiresAt-RETENTION_POLICY.backupDays*RETENTION_DAY,expiresAt:body.expiresAt};
 const plan=await prepareStreamedRestore(sourceDatabase,custody,key,id,{packPages:true,now:now(),provenance});
 return {plan,provenance,runtimeAccess:'blocked_pending_verified_import_and_latest_authority'};
}
