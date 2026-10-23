
/** One explicit private invocation, never a scheduler. Missing monitoring stops
 * before purge. Independent provider acceptance is not proof of alert receipt. */
export async function operationalMaintenance(service, {purge, heartbeat, now=Date.now}, boundaryId, limit=50) {
  if(typeof purge!=='function'||typeof heartbeat!=='function'||typeof now!=='function'
    ||!Number.isInteger(limit)||limit<1||limit>100||!/^op_[a-zA-Z0-9_-]{1,70}$/.test(boundaryId)) throw Error('operational_configuration');
  try {
    await service.ready();
    await purge(service,now(),limit);
    // Purge ticks must not take a complete source snapshot or scan Drive history.
    // A verified chunk is delivery progress, not a fresh restore boundary.
    const delivery=await service.flush(boundaryId,25);
    await service.ready();
    await heartbeat({component:'authority',status:delivery.pending?'backlog':'verified'});
    return {verified:true,delivery,limit,snapshotCreated:false};
  }catch{throw Error('operational_maintenance_unavailable');}
}

/** Explicit bounded snapshot driver. Kept separate from frequent purge ticks:
 * progress is durable in the authority service, and monitoring never reports a
 * completed boundary while capture/verification or scratch compaction is pending.
 * This function installs no timer, cron or recovery-access receipt. */
export async function operationalSnapshotMaintenance(service,{heartbeat},boundaryId){
 if(typeof heartbeat!=='function'||!/^[a-zA-Z0-9_-]{1,65}$/.test(boundaryId||''))throw Error('operational_configuration');
 try{
  const snapshot=await service.advanceSnapshot(boundaryId);
  if(!snapshot.complete){await heartbeat({component:'authority',status:'snapshot'});return {verified:false,snapshotComplete:false,cleanupComplete:false};}
  const cleanup=await service.cleanupSnapshotStep(boundaryId);
  if(cleanup.receipt!==snapshot.receipt)throw Error('snapshot_receipt_conflict');
  if(cleanup.complete)await service.ready();
  await heartbeat({component:'authority',status:cleanup.complete?'verified':'snapshot_cleanup'});
  return {verified:cleanup.complete,snapshotComplete:true,cleanupComplete:cleanup.complete,receipt:snapshot.receipt};
 }catch{throw Error('operational_snapshot_maintenance_unavailable');}
}

/** URL may contain a provider credential: install as a Secret, never log it.
 * Exact host allowlisting, no redirects, bounded wait and minimal synthetic-safe payload. */
export function operationalHeartbeat(env, fetcher=globalThis.fetch) {
  let url;
  try {url=new URL(env.WYBP_HEARTBEAT_URL);}catch{throw Error('operational_monitor_configuration');}
  if(url.protocol!=='https:'||url.username||url.password||url.port
    ||url.hostname!==env.WYBP_HEARTBEAT_HOST)throw Error('operational_monitor_configuration');
  return async event=>{
    try {
      const response=await fetcher(url.href,{method:'POST',redirect:'manual',
        signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},
        body:JSON.stringify({component:'authority',status:event.status,at:Date.now()})});
      if(response.status<200||response.status>=300)throw Error('rejected');
    }catch{throw Error('operational_monitor_unavailable');}
  };
}
