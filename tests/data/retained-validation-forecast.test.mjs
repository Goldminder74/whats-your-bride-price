import test from 'node:test';import assert from 'node:assert/strict';
import {retainedValidationForecast,retainedMaximumCost,proposedRetainedCaps,priorRetainedUpper} from '../../scripts/retained-validation-forecast.mjs';
import {RETAINED_CAPS,PREVIOUS_RETAINED_CAPS} from '../../worker/retainedBenchmarkPolicy.mjs';
test('proposal preserves old reservations and cleanup; historical caps reject the phase graph and the inactive v2 proposal fits it',()=>{
 const f=retainedValidationForecast({assetBytesPerSet:2500000,caps:PREVIOUS_RETAINED_CAPS});assert.equal(f.authorised,false);assert.equal(f.admissibleProjection,false);assert.ok(f.failures.some(r=>r.meter==='external'));assert.ok(f.failures.some(r=>r.meter==='doWrites'));assert.equal(f.total.external,6955163);assert.equal(f.prior.doWrites,1000000);assert.equal(f.total.storageBytes,6800000000);assert.equal(f.total.doStorageBytes,2300000000);assert.equal(PREVIOUS_RETAINED_CAPS.external,5000000);assert.equal(RETAINED_CAPS.external,8000000);
 const proposed=retainedValidationForecast({assetBytesPerSet:2500000,caps:proposedRetainedCaps});assert.equal(proposed.admissibleProjection,true);assert.equal(proposed.authorised,false);assert.equal(proposed.total.writes,118677396);assert.equal(proposed.total.doWrites,74000000);
 assert.equal(RETAINED_CAPS.doGbMs,64000*1000,'GB-ms cap must be64k GB-seconds, never64 million GB-seconds');assert.equal(proposed.total.doGbMs,Math.ceil(112*3600000*.128)+4000*1000);assert.ok(proposed.total.doGbMs<RETAINED_CAPS.doGbMs);
 const bad=retainedValidationForecast({assetBytesPerSet:40000000,caps:proposedRetainedCaps});assert.ok(bad.failures.some(r=>r.meter==='transferBytes'));assert.equal(retainedValidationForecast({assetBytesPerSet:2500000,caps:proposedRetainedCaps,prior:{...priorRetainedUpper,doWrites:6000000}}).admissibleProjection,false);
});
test('cost admits no missing included allowance and counts the paid month once plus all prior authority',()=>{
 const c=retainedMaximumCost();assert.equal(c.usd.d1Writes,110);assert.equal(c.usd.coordinatorSqlWrites,40);assert.equal(c.usd.workerCpu,30);assert.equal(c.usd.existingWorkersMonth,5);assert.ok(Math.abs(c.subtotalUsd-191.4)<.001);assert.ok(Math.abs(c.knownAndReservedGbp-209.312)<.001);assert.ok(c.validationMonthReservedGbp<250);assert.throws(()=>retainedMaximumCost({remainingDoWrites:39000000}),/headroom/);assert.throws(()=>retainedMaximumCost({remainingD1Writes:0}),/headroom/);
});

test('cost rejects nonfinite FX/tax, impossible included headroom and reduced carryover instead of producing a false budget pass',()=>{
 for(const change of [{gbpPerUsd:NaN},{gbpPerUsd:Infinity},{gbpPerUsd:0},{taxFraction:NaN},{taxFraction:Infinity},{taxFraction:-.1},{taxFraction:1.01},{remainingD1Writes:50000001},{remainingDoWrites:50000001}])assert.throws(()=>retainedMaximumCost(change),/forecast_headroom/);
 assert.throws(()=>retainedMaximumCost({caps:{...proposedRetainedCaps,writes:NaN}}),/forecast_vector/);
 assert.throws(()=>retainedValidationForecast({assetBytesPerSet:2500000,prior:{...priorRetainedUpper,external:priorRetainedUpper.external-1}}),/prior_reservations/);
 const expensive=retainedMaximumCost({gbpPerUsd:1.2});assert.equal(expensive.withinProposedCeilings,false);assert.ok(expensive.experimentMarginGbp<0);assert.equal(expensive.authorised,false);
});

test('cleanup and prior uncertainty stay inside225;250 includes225 and leaves only the stated other-account margin',()=>{
 const c=retainedMaximumCost();assert.equal(c.cleanupIncludedGbp,22.27);assert.equal(c.authorised,false);assert.equal(c.withinProposedCeilings,true);assert.ok(Math.abs(c.otherAccountMarginGbp-6.88)<.001);
 assert.ok(Math.abs(c.validationMonthReservedGbp-(c.experimentCeilingGbp+c.netlifyGbp+c.provisionalCustodyGbp))<.001);assert.ok(c.cleanupIncludedGbp<c.knownAndReservedGbp);assert.equal(c.experimentCeilingGbp,225);assert.equal(c.validationMonthCeilingGbp,250);
});
