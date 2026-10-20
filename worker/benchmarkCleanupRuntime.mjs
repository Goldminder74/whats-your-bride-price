import {benchmarkConfiguration} from './benchmarkRuntime.mjs';
import {benchmarkMeter} from './benchmarkMeter.mjs';
import {d1AuthorityAdapter} from './authorityService.mjs';
import {D1WriterFence} from './d1WriterFence.mjs';
import {driveAccessToken} from './driveOAuth.mjs';
import {D1DriveIndex} from '../scripts/d1-drive-index.mjs';
import {DriveCustody} from '../scripts/drive-custody.mjs';
import {cleanupBenchmarkDrive} from '../scripts/benchmark-drive-cleanup.mjs';

/** Teardown only: never commission, renew a fence or admit benchmark traffic.
 * The expired measurement coordinator is intentionally not called. The operator
 * must reserve cleanup's whole envelope in the same cumulative budget first.
 * Provider requests remain serial, paced, timed and bounded by that envelope.
 */
export async function benchmarkCleanupRuntime(env,stopped,upper,{now=Date.now,pause,request=fetch}={}){
 if(stopped!==true)throw Error('benchmark_cleanup_stop_required');
 const config=benchmarkConfiguration(env),meter=benchmarkMeter({phase:config.phase,upper,now,pause,request});
 const db=d1AuthorityAdapter(meter.database(env.DB));
 // No restore receipt is needed to remove a failed disposable preparation.
 // An unresolved application writer still blocks cleanup; never clear its lock.
 await new D1WriterFence(db,{now}).ready();
 const accessToken=driveAccessToken({clientId:env.WYBP_DRIVE_CLIENT_ID,clientSecret:env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:env.WYBP_DRIVE_REFRESH_TOKEN,fetcher:meter.fetcher,now});
 const root=new DriveCustody({folderId:env.WYBP_DRIVE_FOLDER_ID,index:new D1DriveIndex(db,env.WYBP_DRIVE_FOLDER_ID,{now}),accessToken,fetcher:meter.fetcher});
 const result=await cleanupBenchmarkDrive({root:root.folderId,folders:config.folders,runId:config.runId,stopped,
  request:(...args)=>root.request(...args),indexLookup:(folder,name)=>new D1DriveIndex(db,folder,{now}).get(name)});
 return {result,usage:meter.receipt(),billingKnown:true};
}
