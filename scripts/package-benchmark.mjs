// Secret-free, isolated package builder. Never deploys or creates resources.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {assertBenchmarkResource} from './approved-benchmark-budget.mjs';
import {assertSecretFreeBuild} from './secret-free-build.mjs';
export async function packageBenchmark({databaseId,siteId,workerOrigin,synthetic=true}){
 const account='b6b22a9a87b5758725e5c499782160af';
 assertBenchmarkResource('database',{name:'wybp-capacity-d1-r002',id:databaseId,account});
 assertBenchmarkResource('site',{name:'wybp-capacity-private-r002',id:siteId,teamSlug:'goldminder74'});
 const url=new URL(workerOrigin);if(url.protocol!=='https:'||url.origin!==workerOrigin||url.hostname.split('.')[0]!=='wybp-capacity-worker-r002'||(!synthetic&&!url.hostname.endsWith('.workers.dev')))throw Error('benchmark_package_scope');
 const root=resolve('outputs/netlify-worker/benchmark-package');await mkdir(join(root,'assets'),{recursive:true});await mkdir(join(root,'client'),{recursive:true});
 const assetFiles={};
 for(const directory of ['regions','avatars','quiz-art']){
  await mkdir(join(root,'assets',directory),{recursive:true});
  for(const name of (await readdir(resolve('public',directory))).sort()){
   if(!/^[a-zA-Z0-9_.-]+\.(?:webp|svg|png|jpg)$/.test(name))continue;
   const bytes=await readFile(resolve('public',directory,name));await copyFile(resolve('public',directory,name),join(root,'assets',directory,name));assetFiles['/'+directory+'/'+name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
 }
 const config={name:'wybp-capacity-worker-r002',account_id:account,main:resolve('worker/benchmarkEntrypoint.mjs'),compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,observability:{enabled:false},limits:{cpu_ms:100},assets:{directory:join(root,'assets'),binding:'ASSETS',run_worker_first:true},d1_databases:[{binding:'DB',database_name:'wybp-capacity-d1-r002',database_id:databaseId}],services:[{binding:'BENCHMARK_AUTHORITY',service:'wybp-capacity-worker-r002',entrypoint:'BenchmarkAuthority'},{binding:'BENCHMARK_PLAYER',service:'wybp-capacity-worker-r002',entrypoint:'BenchmarkPlayer'}],vars:{CLOUDFLARE_ACCOUNT_ID:account,WYBP_AUTHORITY_ROLE:'benchmark-ops',WYBP_WORKER_NAME:'wybp-capacity-worker-r002',WYBP_BENCHMARK_DATABASE_NAME:'wybp-capacity-d1-r002',WYBP_BENCHMARK_DATABASE_ID:databaseId,PUBLIC_APP_ORIGIN:'https://wybp-capacity-private-r002.netlify.app',WYBP_BENCHMARK_PHASE:'B',WYBP_BENCHMARK_RUN_ID:'synthetic_r002',WYBP_BENCHMARK_SOURCE_SHA256:'0'.repeat(64),WYBP_NETLIFY_PROJECT_ID:siteId,WYBP_NETLIFY_CONTEXT:'production',WYBP_NETLIFY_SITE_URL:'https://wybp-capacity-private-r002.netlify.app',WYBP_OPERATIONS_ENABLED:'false',WYBP_TEST_WEBHOOK_ENABLED:'false',WYBP_TEST_RETENTION_ENABLED:'false',WYBP_HOSTED_REHEARSAL_ENABLED:'false'}};
 const configuration=join(root,'wrangler.json');await writeFile(configuration,JSON.stringify(config,null,2)+'\n');
 const environment={...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'};
 await assertSecretFreeBuild(process.cwd(),environment);
 const output=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--config',configuration,'--outdir',join(root,'worker')],{env:environment,encoding:'utf8'});
 await writeFile(join(root,'dry-run.log'),output.stdout+output.stderr);if(output.status!==0)throw Error('benchmark_package_failed');
 const compiled=await readFile(join(root,'worker','benchmarkEntrypoint.js')),sourceSha256=createHash('sha256').update(compiled).digest('hex');config.vars.WYBP_BENCHMARK_SOURCE_SHA256=sourceSha256;
 // A later deployment must publish the exact audited bytes, not rebuild changed
 // repository source while retaining an old source-hash declaration.
 config.main=join(root,'worker','benchmarkEntrypoint.js');config.no_bundle=true;config.find_additional_modules=false;
 await writeFile(configuration,JSON.stringify(config,null,2)+'\n');
 await writeFile(join(root,'netlify.toml'),'[build]\npublish="client"\n[[redirects]]\nfrom="/*"\nto="'+workerOrigin+'/:splat"\nstatus=200\nforce=true\nsigned="WYBP_NETLIFY_PROXY_SECRET"\n');
 await writeFile(join(root,'client','index.html'),'<!doctype html><title>Private synthetic benchmark</title>');
 const manifest={version:1,synthetic,databaseId,siteId,workerOrigin,sourceSha256,assetFiles,operatorHttpExposed:false,scheduled:false,commerce:false};await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 return {root,sourceSha256,assetCount:Object.keys(assetFiles).length,synthetic};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 packageBenchmark({databaseId:'11111111-1111-4111-8111-111111111111',siteId:'22222222-2222-4222-8222-222222222222',workerOrigin:'https://wybp-capacity-worker-r002.example.invalid'}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('benchmark_package_failed');process.exitCode=1;});
}
