// Public fabricated test authority only; never a hosted grant or real key.
import {createHmac} from 'node:crypto';
import {RETAINED_CAPS,RETAINED_PRIOR_USAGE,RETAINED_ACCOUNT,RETAINED_ORIGIN} from '../../worker/retainedBenchmarkPolicy.mjs';
export const syntheticRetainedKey='synthetic-approval-key-'.repeat(4);
export function syntheticRetainedGrant(at=Date.now(),overrides={}){
 const value={version:2,kind:'retained-direct-v2',id:'retained_local_fixture',sourceRevision:'a'.repeat(40),approvalEvidenceSha256:'b'.repeat(64),preflightEvidenceSha256:'c'.repeat(64),caps:RETAINED_CAPS,startsAt:at,endsAt:at+112*3600000,maximumExperimentGBP:225,maximumValidationMonthGBP:250,cleanupPageSize:50,cleanupConcurrency:2,operatingCeilingGBP:50,autoTopups:false,businessCustodyVerified:true,businessAccountPaid:true,businessTrial:false,custodyQuoteSha256:'d'.repeat(64),processingContractSha256:'e'.repeat(64),priorUsageReconciled:true,headroomVerified:true,carried:{...RETAINED_PRIOR_USAGE},...overrides};
 return {value,signature:createHmac('sha256',syntheticRetainedKey).update(JSON.stringify(value)).digest('hex')};
}
export function syntheticRetainedEnv(at=Date.now()){
 return {WYBP_AUTHORITY_ROLE:'retained-benchmark',CLOUDFLARE_ACCOUNT_ID:RETAINED_ACCOUNT,WYBP_WORKER_NAME:'wybp-capacity-worker-r002',PUBLIC_APP_ORIGIN:RETAINED_ORIGIN,WYBP_BENCHMARK_DATABASE_NAME:'wybp-capacity-d1-r002',WYBP_BENCHMARK_DATABASE_ID:'11111111-1111-4111-8111-111111111111',WYBP_MIRROR_DATABASE_NAME:'wybp-capacity-recovery-d1-r002',WYBP_MIRROR_DATABASE_ID:'22222222-2222-4222-8222-222222222222',WYBP_PRIVATE_TEST_PROFILE:'off',WYBP_PUBLIC_ACCESS_ENABLED:'false',WYBP_LIVE_WEBHOOK_ENABLED:'false',WYBP_OPERATIONS_ENABLED:'false',WYBP_RETAINED_BENCHMARK_ENABLED:'true',WYBP_RETAINED_BENCHMARK_APPROVAL_JSON:JSON.stringify(syntheticRetainedGrant(at)),WYBP_RETAINED_BENCHMARK_APPROVAL_KEY:syntheticRetainedKey};
}
