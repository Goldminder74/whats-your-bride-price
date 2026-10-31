// OFFLINE proposal arithmetic only. This module cannot install a grant, change
// runtime caps, contact a provider, provision resources or approve expenditure.
import {RETAINED_CAPS,RETAINED_PRIOR_USAGE,RETAINED_GAUGES,RETAINED_PROPOSAL,retainedZero} from '../worker/retainedBenchmarkPolicy.mjs';
export const proposedRetainedCaps=RETAINED_CAPS;
export const priorRetainedUpper=RETAINED_PRIOR_USAGE;
// Old coordinator/CPU values are deliberately FULL reservation ceilings, not
// observed bills or a refund of unknown outcomes. Six pending tickets stay held.
export function retainedValidationForecast({assetBytesPerSet,caps=RETAINED_CAPS,prior=priorRetainedUpper}={}){
 if(!Number.isSafeInteger(assetBytesPerSet)||assetBytesPerSet<1||assetBytesPerSet>40000000)throw Error('forecast_asset_bytes');
 for(const v of [caps,prior])if(Object.keys(v).length!==Object.keys(RETAINED_CAPS).length||Object.keys(RETAINED_CAPS).some(k=>!Number.isSafeInteger(v[k])||v[k]<0))throw Error('forecast_vector');
 if(Object.keys(RETAINED_PRIOR_USAGE).some(k=>prior[k]<RETAINED_PRIOR_USAGE[k]))throw Error('forecast_prior_reservations');
 const v=x=>({...retainedZero(),...x}),phases={
  setup:v({external:2900000,internal:3300000,writes:72000000,reads:100000000,storageBytes:6500000000,transferBytes:26000000000,driveObjects:1220000,driveBytes:11800000000,workerCpuMs:600000000,doRequests:4000000,doWrites:35000000,doReads:100000000,doStorageBytes:1800000000,doGbMs:22118400}),
  measure:v({external:700000,internal:900000,writes:3000000,reads:60000000,storageBytes:6800000000,transferBytes:5000000000+assetBytesPerSet*14000,driveObjects:35000,driveBytes:1000000000,workerCpuMs:160000000,doRequests:1000000,doWrites:8000000,doReads:50000000,doStorageBytes:2000000000,doGbMs:11059200}),
  recovery:v({external:1950000,internal:2100000,writes:43000000,reads:180000000,storageBytes:6800000000,transferBytes:14000000000,driveObjects:16000,driveBytes:1000000000,workerCpuMs:330000000,doRequests:2500000,doWrites:16000000,doReads:180000000,doStorageBytes:2300000000,doGbMs:11059200}),
  cleanup:v({external:1400000,internal:1600000,writes:500000,reads:8000000,storageBytes:6800000000,transferBytes:1500000000,workerCpuMs:170000000,doRequests:1800000,doWrites:14000000,doReads:80000000,doStorageBytes:2300000000,doGbMs:7372800})
 };
 const sum=values=>Object.fromEntries(Object.keys(RETAINED_CAPS).map(k=>[k,RETAINED_GAUGES.includes(k)?Math.max(...values.map(v=>v[k])):values.reduce((n,v)=>n+v[k],0)])),ordinary=sum([prior,phases.setup,phases.measure,phases.recovery]),total=sum([ordinary,phases.cleanup]);
 const failures=Object.keys(caps).flatMap(k=>[...(ordinary[k]>Math.floor(caps[k]*.8)?[{meter:k,stage:'ordinary80percent',used:ordinary[k],limit:Math.floor(caps[k]*.8)}]:[]),...(total[k]>caps[k]?[{meter:k,stage:'includingCleanup',used:total[k],limit:caps[k]}]:[])]);
 return {proposalOnly:true,authorised:false,phases,prior,ordinary,total,failures,admissibleProjection:failures.length===0,qualification:'Phase envelopes are unmeasured planning reservations, not provider telemetry or permission to run. Admission still requires exact fixture/control counts, current account headroom, contracts and separately signed authority. Asset bytes are from the actual compiled manifest; all control requests and cleanup are included.'};
}
export function retainedMaximumCost({caps=proposedRetainedCaps,remainingD1Writes=40000000,remainingDoWrites=40000000,gbpPerUsd=.9,taxFraction=.2}={}){
 if(![remainingD1Writes,remainingDoWrites].every(n=>Number.isSafeInteger(n)&&n>=40000000&&n<=50000000)||!Number.isFinite(gbpPerUsd)||gbpPerUsd<.01||!Number.isFinite(taxFraction)||taxFraction<0||taxFraction>1)throw Error('forecast_headroom');
 if(!caps||Object.keys(caps).length!==Object.keys(RETAINED_CAPS).length||Object.keys(RETAINED_CAPS).some(k=>!Number.isSafeInteger(caps[k])||caps[k]<RETAINED_PRIOR_USAGE[k]))throw Error('forecast_vector');
 const usd={existingWorkersMonth:5,d1Writes:Math.max(0,caps.writes-remainingD1Writes)/1000000,workerCpu:caps.workerCpuMs/1000000*.02,workerRequests:caps.external/1000000*.3,d1ReadRounding:.5,d1Storage112Hours:2,coordinatorRequests:Math.ceil(caps.doRequests/1000000)*.15,coordinatorSqlWrites:Math.max(0,caps.doWrites-remainingDoWrites)/1000000};
 const subtotalUsd=Object.values(usd).reduce((n,v)=>n+v,0),factor=gbpPerUsd*(1+taxFraction),subtotalGbp=subtotalUsd*factor;
 // Hold all old GBP8 authority rather than calling it actual consumption.
 const oldUnreconciledReserveGbp=Math.max(0,8-usd.existingWorkersMonth*factor),knownAndReservedGbp=subtotalGbp+oldUnreconciledReserveGbp;
 // This marginal cleanup bound is ALREADY inside the experiment cap. Charge
 // every cleanup write/request and all storage allowance without using free
 // units twice; never add it to225 or use its escrow for ordinary work.
 const cleanup=retainedValidationForecast({assetBytesPerSet:1}).phases.cleanup;
 const cleanupUsd=cleanup.writes/1000000+cleanup.doWrites/1000000+cleanup.workerCpuMs/1000000*.02+cleanup.external/1000000*.3+Math.ceil(cleanup.doRequests/1000000)*.15+usd.d1Storage112Hours;
 const experimentCeilingGbp=RETAINED_PROPOSAL.maximumExperimentGBP,validationMonthCeilingGbp=RETAINED_PROPOSAL.maximumValidationMonthGBP,netlifyGbp=9*factor,provisionalCustodyGbp=8.4,validationMonthReservedGbp=experimentCeilingGbp+netlifyGbp+provisionalCustodyGbp;
 return {proposalOnly:true,authorised:false,usd,subtotalUsd,subtotalGbp,oldUnreconciledReserveGbp,knownAndReservedGbp,experimentCeilingGbp,experimentMarginGbp:experimentCeilingGbp-knownAndReservedGbp,cleanupIncludedGbp:Math.ceil((cleanupUsd*factor-1e-9)*100)/100,netlifyGbp,provisionalCustodyGbp,validationMonthCeilingGbp,validationMonthReservedGbp,otherAccountMarginGbp:validationMonthCeilingGbp-validationMonthReservedGbp,withinProposedCeilings:knownAndReservedGbp<=experimentCeilingGbp&&validationMonthReservedGbp<=validationMonthCeilingGbp,qualification:'Maximum software budget proposal, not a provider hard cap, final custody quote or approved purchase. Cleanup and prior reservations are included, never added twice. Paid USD bases use budget FX/tax, not verified GBP card charges; subtract only reconciled actual charges to quote additional cash from now. Included DO duration/storage and D1 reads, all other-account activity and final custody tax must be verified before execution. No trial, renewal crossing or automatic top-up is included.'};
}
