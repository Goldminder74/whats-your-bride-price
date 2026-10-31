import test from 'node:test';import assert from 'node:assert/strict';
import {localStockRecovery} from '../helpers/localStockRecovery.mjs';
test('actual-schema recovery preserves accounting and suppression through total index loss and interrupted import',async()=>{
 const report=await localStockRecovery({games:30});
 assert.equal(report.verifiedAnswerRows,360);assert.equal(report.restorePageSize,50);assert.equal(report.sourceIndexLossVerified,true);assert.equal(report.importInterruptedAndResumed,true);assert.equal(report.accountingHoldsClosuresSuppressionVerified,true);assert.equal(report.hostedRequests,0);assert.equal(report.runtimeAccess,'blocked_pending_latest_authority_and_suppression');assert.ok(report.snapshotObjects>3);assert.ok(report.localTransferredBytes>report.snapshotCiphertextBytes);assert.ok(report.sourceBytes>0);
});
test('local stock rehearsal rejects unbounded or invalid volume before creating fixtures',async()=>{
 for(const games of [0,-1,45001,1.5,NaN])await assert.rejects(localStockRecovery({games}),/local_stock_scope/);
});
