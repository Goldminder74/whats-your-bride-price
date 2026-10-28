// Separate proposed experiment. Nothing in this module renews an old grant,
// creates resources or authorises expenditure. Installed approval stays absent
// until the owner's exact scope/cost decision and preflight evidence exist.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export const RETAINED_ORIGIN='https://wybp-capacity-worker-r002.ayo-m-ayeni.workers.dev';
export const RETAINED_ACCOUNT='b6b22a9a87b5758725e5c499782160af';
// Inactive proposal only. No real grant exists; v1 can never revive old scope.
export const PREVIOUS_RETAINED_CAPS=Object.freeze({external:5000000,internal:8000000,writes:150000000,reads:500000000,storageBytes:16000000000,transferBytes:60000000000,driveObjects:1600000,driveBytes:18000000000,workerCpuMs:1300000000,doRequests:6000000,doWrites:50000000,doReads:500000000,doStorageBytes:3000000000,doGbMs:64000000});
export const RETAINED_CAPS=Object.freeze({...PREVIOUS_RETAINED_CAPS,external:8000000,internal:10000000,transferBytes:110000000000,workerCpuMs:1500000000,doRequests:10000000,doWrites:80000000});
export const RETAINED_PROPOSAL=Object.freeze({version:2,kind:'retained-direct-v2',maximumExperimentGBP:225,maximumValidationMonthGBP:250,cleanupPageSize:50,cleanupConcurrency:2});
export const RETAINED_GAUGES=Object.freeze(['storageBytes','doStorageBytes']);
export const retainedHash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const retainedZero=()=>Object.fromEntries(Object.keys(RETAINED_CAPS).map(k=>[k,0]));
// Preserve the full recorded upper bounds where final receipts were lost.
export const RETAINED_PRIOR_USAGE=Object.freeze({...retainedZero(),external:5163,internal:6619,writes:177396,reads:2747826,storageBytes:80000000,transferBytes:324768009,driveObjects:128,driveBytes:3141284,workerCpuMs:25000000,doRequests:150000,doWrites:1000000,doReads:2000000,doStorageBytes:64000000,doGbMs:4000000});
const fail=()=>{throw Error('retained_benchmark_scope');};
export function retainedVector(v){if(!v||Object.keys(v).length!==Object.keys(RETAINED_CAPS).length||Object.keys(RETAINED_CAPS).some(k=>!Number.isSafeInteger(v[k])||v[k]<0)||Object.keys(v).some(k=>!Object.hasOwn(RETAINED_CAPS,k)))fail();return v;}
export function retainedIdentity(env){
 const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v||'');
 const ids=[env.WYBP_BENCHMARK_DATABASE_ID,env.WYBP_MIRROR_DATABASE_ID];
 if(env.WYBP_AUTHORITY_ROLE!=='retained-benchmark'||env.CLOUDFLARE_ACCOUNT_ID!==RETAINED_ACCOUNT||env.WYBP_WORKER_NAME!=='wybp-capacity-worker-r002'||env.PUBLIC_APP_ORIGIN!==RETAINED_ORIGIN||env.WYBP_BENCHMARK_DATABASE_NAME!=='wybp-capacity-d1-r002'||env.WYBP_MIRROR_DATABASE_NAME!=='wybp-capacity-recovery-d1-r002'||ids.some(v=>!uuid(v)||['a5b2b409-ed08-48c9-ac1d-36699fc6c4b9','1a268b28-e6d5-4431-8f84-a886df9369f1'].includes(v))||ids[0]===ids[1]||env.WYBP_PRIVATE_TEST_PROFILE&&env.WYBP_PRIVATE_TEST_PROFILE!=='off'||env.WYBP_PUBLIC_ACCESS_ENABLED!=='false'||env.WYBP_LIVE_WEBHOOK_ENABLED!=='false'||env.WYBP_OPERATIONS_ENABLED!=='false'||env.WYBP_LEGACY_CONTINUITY_ENABLED==='true'||Object.values(env).some(v=>typeof v==='string'&&/^sk_live_/.test(v)))fail();
 return {source:ids[0],mirror:ids[1],account:RETAINED_ACCOUNT,origin:RETAINED_ORIGIN};
}
export function verifyRetainedGrant(envelope,key,at=Date.now()){
 if(typeof key!=='string'||key.length<43||!envelope||typeof envelope!=='object'||typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature))fail();
 const value=envelope.value,expected=createHmac('sha256',key).update(JSON.stringify(value)).digest();
 if(!timingSafeEqual(expected,Buffer.from(envelope.signature,'hex')))fail();
 if(value?.version!==RETAINED_PROPOSAL.version||value.kind!==RETAINED_PROPOSAL.kind||!/^retained_[a-zA-Z0-9_-]{1,48}$/.test(value.id||'')||!/^[a-f0-9]{40}$/.test(value.sourceRevision||'')||!/^[a-f0-9]{64}$/.test(value.approvalEvidenceSha256||'')||!/^[a-f0-9]{64}$/.test(value.preflightEvidenceSha256||'')||retainedHash(value.caps)!==retainedHash(RETAINED_CAPS)||!Number.isSafeInteger(value.startsAt)||!Number.isSafeInteger(value.endsAt)||value.endsAt-value.startsAt!==112*3600000||value.startsAt>at||value.endsAt<=at||value.maximumExperimentGBP!==RETAINED_PROPOSAL.maximumExperimentGBP||value.maximumValidationMonthGBP!==RETAINED_PROPOSAL.maximumValidationMonthGBP||value.cleanupPageSize!==RETAINED_PROPOSAL.cleanupPageSize||value.cleanupConcurrency!==RETAINED_PROPOSAL.cleanupConcurrency||value.operatingCeilingGBP!==50||value.autoTopups!==false||value.businessCustodyVerified!==true||value.businessAccountPaid!==true||value.businessTrial!==false||!/^[a-f0-9]{64}$/.test(value.custodyQuoteSha256||'')||!/^[a-f0-9]{64}$/.test(value.processingContractSha256||'')||value.priorUsageReconciled!==true||value.headroomVerified!==true)fail();
 retainedVector(value.carried);if(Object.keys(RETAINED_CAPS).some(k=>value.carried[k]>RETAINED_CAPS[k]||value.carried[k]<RETAINED_PRIOR_USAGE[k]))fail();
 return value;
}
export function retainedCustodyEvidence(preflight,grant){return preflight?.businessAccountPaid===true&&preflight.businessTrial===false&&preflight.custodyQuoteSha256===grant.custodyQuoteSha256&&preflight.processingContractSha256===grant.processingContractSha256;}
export function installedRetainedGrant(env,at=Date.now()){
 retainedIdentity(env);if(env.WYBP_RETAINED_BENCHMARK_ENABLED!=='true')fail();
 let envelope;try{envelope=JSON.parse(env.WYBP_RETAINED_BENCHMARK_APPROVAL_JSON);}catch{fail();}
 return verifyRetainedGrant(envelope,env.WYBP_RETAINED_BENCHMARK_APPROVAL_KEY,at);
}
