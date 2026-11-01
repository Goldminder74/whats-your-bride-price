import {retainedIdentity,RETAINED_ORIGIN} from '../worker/retainedBenchmarkPolicy.mjs';
// Build-time synthetic capability only. This can never satisfy production gates.
export function retainedBuildReadiness(env,flags){
 if(env.WYBP_DEPLOY_TARGET!=='cloudflare-retained-benchmark'||env.WYBP_HOSTING_ENVIRONMENT!=='test'||env.PUBLIC_APP_ORIGIN!==RETAINED_ORIGIN||env.WYBP_RETAINED_BUILD!=='synthetic-only')throw Error('retained_build_scope');
 retainedIdentity(env);
 if(Object.entries(flags).some(([k,on])=>on&&!['random_quick_play','cowrie_economy','commerce'].includes(k))||!flags.random_quick_play||!flags.cowrie_economy||!flags.commerce||Object.entries(env).some(([k,v])=>k.startsWith('WYBP_REVIEW_')&&v&&v!=='false'))throw Error('retained_build_scope');
 return true;
}
