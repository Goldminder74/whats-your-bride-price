// Exact r002 session. Creating a session does not start traffic or create hosted
// resources. Protected setup, B and C are explicit separately journalled calls.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {getPlatformProxy} from 'wrangler';
import {ApprovedBenchmarkBudget,assertBenchmarkResource,BENCHMARK_PHASES} from './approved-benchmark-budget.mjs';
import {ApprovedBenchmarkDriver} from './approved-benchmark-driver.mjs';
import {hostedBenchmarkAdapter} from './hosted-benchmark-adapter.mjs';
import {benchmarkOperationBounds} from './benchmark-operation-bounds.mjs';
import {meteredBenchmarkController} from './benchmark-metered-controller.mjs';
import {runBenchmarkRecovery} from './benchmark-recovery-controller.mjs';
import {privatePath} from './operational-backup.mjs';
import {recoveryHash,encryptRecord,decryptRecord} from './recovery-crypto.mjs';
const fail=code=>{throw Error(code||'benchmark_session_unavailable');};
const account='b6b22a9a87b5758725e5c499782160af';
export async function createHostedBenchmarkSession({phase,preflight,resources,manifest,hosted,secrets,directory,now=Date.now,platform=getPlatformProxy}){
 if(!['B','C'].includes(phase)||hosted?.phase!==phase||manifest?.synthetic!==false||hosted?.cpuMs!==100||hosted?.schedules!==0||hosted?.offFlags!==true||hosted?.unsignedStatus!==404||hosted.sourceSha256!==manifest.sourceSha256||!Number.isSafeInteger(hosted.verifiedAt)||now()-hosted.verifiedAt>3600000||hosted.verifiedAt>now())fail();
 for(const kind of ['site','worker','database'])assertBenchmarkResource(kind,resources?.[kind]);
 if(manifest.databaseId!==resources.database.id||manifest.siteId!==resources.site.id||hosted.databaseIds?.length!==1||hosted.databaseIds[0]!==resources.database.id)fail();
 const required=['WYBP_DRIVE_CLIENT_ID','WYBP_DRIVE_CLIENT_SECRET','WYBP_DRIVE_REFRESH_TOKEN','WYBP_BENCHMARK_KEY_BASE64','WYBP_BENCHMARK_ACCESS','WYBP_BENCHMARK_CONTROLLER_SECRET','WYBP_NETLIFY_PROXY_SECRET'];
 if(required.some(n=>!hosted.secretNames?.includes(n)))fail('benchmark_secure_install_required');
 const key=Buffer.from(secrets?.WYBP_BENCHMARK_KEY_BASE64||'','base64');if(key.length!==32||key.toString('base64')!==secrets.WYBP_BENCHMARK_KEY_BASE64)fail();
 directory=await privatePath(directory);await mkdir(directory,{recursive:true});
 const proxyPath=join(directory,'private-proxy.json');
 await writeFile(proxyPath,JSON.stringify({name:'wybp-local-capacity-controller',account_id:account,compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],services:[{binding:'OP',service:'wybp-capacity-worker-r002',entrypoint:'BenchmarkOperator',remote:true}]}));
 const database=new DatabaseSync(join(directory,'budget.sqlite'));
 let proxy;
 try{
  const budget=new ApprovedBenchmarkBudget(database,{runId:'synthetic_r002',phase,preflight,now,preparing:true});
  if(phase==='C'){
   const previous=database.prepare("SELECT used FROM benchmark_runs WHERE id='synthetic_r002:B'").get();
   if(!previous||database.prepare("SELECT COUNT(*) n FROM benchmark_tickets WHERE run_id='synthetic_r002:B' AND state!='settled'").get().n)fail('benchmark_prior_stock_unverified');
   // Retained B files still occupy the same private folders. Charge their
   // conservative uploaded bytes/object count before admitting any C work;
   // changing phase must not reset the physical storage allowance.
   const stock=JSON.parse(previous.used),upper=Object.fromEntries(Object.keys(BENCHMARK_PHASES.C.caps).map(k=>[k,0]));upper.driveBytes=stock.driveBytes;upper.driveObjects=stock.driveObjects;
   const reservation=budget.reserve('setup_existing_drive_stock',upper,{preparation:true,pacedExternal:true});
   budget.settle(reservation.ticket,upper,recoveryHash(Buffer.from(JSON.stringify({source:'synthetic_r002:B',upper}))));
  }
  proxy=await platform({configPath:proxyPath,persist:false,envFiles:[]});
  const adapter=hostedBenchmarkAdapter({phase,operator:proxy.env.OP,access:secrets.WYBP_BENCHMARK_ACCESS,controllerSecret:secrets.WYBP_BENCHMARK_CONTROLLER_SECRET,workerOrigin:manifest.workerOrigin,sourceSha256:manifest.sourceSha256,assets:manifest.assetFiles,bounds:benchmarkOperationBounds({phase,storageBytes:hosted.storageBytes,assets:manifest.assetFiles}),now});
  const action=await meteredBenchmarkController({budget,adapter,key,directory:join(directory,'receipts')});
  const checkReady=()=>{if(hosted.folderCount!==16||hosted.restoreReceiptPresent!==true)fail('benchmark_commissioning_required');};
  const persist=async(name,value)=>{await writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n');return value;};
  return {
   budget,
   async prepareDrive(){if(phase!=='B')fail();return action({id:'setup_drive_folders',kind:'provision'},{preparation:true});},
   async commission(){if(phase!=='B'||hosted.folderCount!==16)fail();return action({id:'setup_commission',kind:'commission'},{preparation:true});},
   async prepareOutage(){
    if(phase!=='C')fail();checkReady();
    for(let step=0;step<600;step++){const result=await action({id:'setup_fixture_'+step,kind:'fixture-step',step},{preparation:true});if(result.games!==5||result.answers!==60)fail();}
    return persist('outage-preparation.json',budget.receipt());
   },
   async run(){
    checkReady();budget.beginMeasurement();
    const flagsPath=join(directory,'recovery-interruptions.enc'),drainedPath=join(directory,'outage-drained.enc');
    const read=async(path,aad)=>{try{return decryptRecord(await readFile(path),key,aad);}catch(e){if(e.code==='ENOENT')return null;fail('benchmark_checkpoint_invalid');}};
    let driver;
    const recovery=async()=>{
     if(!await read(drainedPath,'outage-drained'))await writeFile(drainedPath,encryptRecord({run:budget.id,receipt:driver.receipt()},key,'outage-drained'),{mode:0o600});
     const flags=await read(flagsPath,'recovery-interruptions')||{index:false,import:false};let result;
     for(let tries=0;tries<3;tries++){
      try{result=await runBenchmarkRecovery({action,key,directory:join(directory,'recovery'),id:'synthetic_r002_recovery',now,fault:async stage=>{
       const kind=stage==='index_removed'?'index':stage==='import_resumed'?'import':null;
       if(kind&&!flags[kind]){flags[kind]=true;await writeFile(flagsPath,encryptRecord(flags,key,'recovery-interruptions'),{mode:0o600});throw Error('benchmark_controlled_interruption');}
      }});break;}catch(e){if(e.message!=='benchmark_controlled_interruption')throw e;}
     }
     if(!result?.verified||!flags.index||!flags.import)fail('benchmark_interruption_evidence_required');
     return persist('recovery-result.json',{...result,interruptedResumeVerified:true});
    };
    driver=new ApprovedBenchmarkDriver({budget,adapter,resources,now,...(phase==='C'?{recover:recovery}:{})});
    const drained=phase==='C'?await read(drainedPath,'outage-drained'):null;let result;
    if(drained){if(drained.run!==budget.id||budget.row().state!=='active')fail();await recovery();result={...drained.receipt,budget:budget.receipt(),resumedRecovery:true};}
    else result=phase==='B'?await driver.runGames():await driver.runOutage();
    if(result.budget.elapsedMs>=BENCHMARK_PHASES[phase].durationMs)fail('benchmark_duration_stop');
    return persist('phase-'+phase+'-result.json',result);
   },
   async close(){await proxy.dispose();database.close();},
  };
 }catch(e){await proxy?.dispose();database.close();throw e;}
}
export async function verifyBenchmarkPackageBytes(manifest,configuration){
 if(configuration?.no_bundle!==true||configuration.find_additional_modules!==false||configuration.vars?.WYBP_BENCHMARK_SOURCE_SHA256!==manifest?.sourceSha256||recoveryHash(await readFile(configuration.main))!==manifest.sourceSha256)fail('benchmark_package_changed');return true;
}
