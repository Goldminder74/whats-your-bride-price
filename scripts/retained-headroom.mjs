// Immutable approval plus a fresh read-only account observation. Neither an
// updated observation nor a reconnect renews allowances or the deadline.
import {RETAINED_ACCOUNT} from '../worker/retainedBenchmarkPolicy.mjs';
export function assertRetainedHeadroom(observation,at){
 if(observation?.account!==RETAINED_ACCOUNT||!Number.isSafeInteger(observation.observedAt)||observation.observedAt>at||at-observation.observedAt>3600000||observation.noAutomaticTopups!==true||observation.headroomVerified!==true||observation.forecastWithinAuthority!==true)throw Error('retained_fresh_headroom_required');
}
