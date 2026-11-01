import { spawnSync } from "node:child_process";
import { PRIVATE_TEST } from "../app/privateTestProfile.ts";
import { featureFlagNames,featureFlagEnvironmentName } from "../app/featureFlags.ts";

// In-memory database identity only; never an existing hosted database or deployment.
const env={...process.env,WYBP_PRIVATE_TEST_PROFILE:"payments",WYBP_HOSTING_ENVIRONMENT:"test",PUBLIC_APP_ORIGIN:PRIVATE_TEST.origin,
  WYBP_NETLIFY_PROJECT_ID:PRIVATE_TEST.projectId,WYBP_NETLIFY_CONTEXT:"production",WYBP_WORKER_NAME:PRIVATE_TEST.workerName,
  WYBP_WORKER_ORIGIN:PRIVATE_TEST.workerOrigin,WYBP_TEST_D1_DATABASE_ID:"11111111-2222-4333-8444-555555555555",
  WRANGLER_SEND_METRICS:"false",WRANGLER_WRITE_LOGS:"false"};
for(const flag of featureFlagNames) env[featureFlagEnvironmentName(flag)]=["commerce","random_quick_play","cowrie_economy"].includes(flag)?"true":"false";
for(const [key,value] of Object.entries(env)) if(key.startsWith("WYBP_REVIEW_") && value && value!=="false") throw new Error("Review fixtures cannot test real D1 wiring");
for(const args of [["scripts/build-netlify-worker.mjs"],["tests/private-runtime-built.test.mjs"]]){
  const result=spawnSync(process.execPath,args,{env,stdio:"inherit"});if(result.status!==0)process.exit(result.status||1);
}
