// Offline release validation/materialisation only: no credentials or API client.
import {readFile,writeFile,readdir,mkdir,realpath,lstat} from 'node:fs/promises';import {resolve,dirname,sep} from 'node:path';import {createHash} from 'node:crypto';
import {assertRetainedServices} from './retained-mail-capability.mjs';
import {retainedIdentity,RETAINED_ORIGIN,RETAINED_ACCOUNT} from '../worker/retainedBenchmarkPolicy.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),fail=()=>{throw Error('retained_release_unavailable');};
const safe=p=>typeof p==='string'&&/^(?:server|client)\/[A-Za-z0-9_./@~-]+$/.test(p)&&!p.split('/').some(v=>!v||v==='..'||v.startsWith('.'))&&!p.endsWith('.map');
export async function verifyRetainedRelease(directory){
 const root=await realpath(directory),manifest=JSON.parse(await readFile(resolve(root,'release.json'),'utf8'));
 if(manifest?.version!==1||manifest.synthetic!==true||manifest.origin!==RETAINED_ORIGIN||manifest.grantInstalled!==false||manifest.deployed!==false||!manifest.files||!manifest.files['server/index.js'])fail();
 const listed=[];async function walk(path,prefix=''){for(const entry of await readdir(path,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isSymbolicLink())fail();if(entry.isDirectory())await walk(resolve(path,entry.name),name+'/');else if(entry.isFile())listed.push(name);else fail();}}await walk(root);
 if(listed.filter(p=>p!=='release.json').sort().join()!==Object.keys(manifest.files).sort().join())fail();
 for(const [p,sha]of Object.entries(manifest.files)){if(p!=='wrangler.json'&&!safe(p)||!/^[a-f0-9]{64}$/.test(sha)||hash(await readFile(resolve(root,p)))!==sha)fail();}
 if(hash(JSON.stringify(manifest.files))!==manifest.releaseId)fail();
 const config=JSON.parse(await readFile(resolve(root,'wrangler.json'),'utf8'));retainedIdentity(config.vars);
 if(config.name!=='wybp-capacity-worker-r002'||config.account_id!==RETAINED_ACCOUNT||config.main!=='server/index.js'||config.no_bundle!==true||config.limits?.cpu_ms!==100||config.preview_urls!==false||config.observability?.enabled!==false||config.vars.WYBP_RETAINED_BENCHMARK_ENABLED!=='false'||config.triggers||config.routes||config.env||config.workflows||config.queues)fail();
 if(config.d1_databases?.map(v=>v.binding).sort().join()!=='DB,MIRROR_DB'||config.d1_databases.some(v=>v.database_id!==config.vars[v.binding==='DB'?'WYBP_BENCHMARK_DATABASE_ID':'WYBP_MIRROR_DATABASE_ID']||v.database_name!==config.vars[v.binding==='DB'?'WYBP_BENCHMARK_DATABASE_NAME':'WYBP_MIRROR_DATABASE_NAME']))fail();
 assertRetainedServices(config.services,manifest.syntheticMailApproval);
 if(JSON.stringify(config.durable_objects?.bindings)!==JSON.stringify([{name:'RETAINED_COORDINATOR',class_name:'RetainedCoordinator'}])||JSON.stringify(config.migrations)!==JSON.stringify([{tag:'retained-coordinator-r001',new_sqlite_classes:['RetainedCoordinator']}]))fail();
 return {manifest,config,root};
}
export async function materializeRetainedRelease(directory,destination,resources){
 const {manifest,config,root}=await verifyRetainedRelease(directory);if(manifest.sourceCommitted!==true||!/^[a-f0-9]{40}$/.test(manifest.sourceRevision||'')||resources?.inventoryComplete!==true||resources.journalled!==true||resources.account!==RETAINED_ACCOUNT)fail();
 if(await lstat(destination).then(()=>true,()=>false))fail();const vars={...config.vars,WYBP_BENCHMARK_DATABASE_ID:resources.sourceId,WYBP_MIRROR_DATABASE_ID:resources.mirrorId};retainedIdentity(vars);
 const next={...config,vars,d1_databases:config.d1_databases.map(r=>({...r,database_id:r.binding==='DB'?resources.sourceId:resources.mirrorId}))};
 const to=resolve(destination);if(to===root||to.startsWith(root+sep))fail();await mkdir(to,{recursive:true});const files={};
 for(const p of Object.keys(manifest.files)){const bytes=p==='wrangler.json'?Buffer.from(JSON.stringify(next,null,2)+'\n'):await readFile(resolve(root,p));const path=resolve(to,p);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx'});files[p]=hash(bytes);}
 const result={...manifest,files,releaseId:hash(JSON.stringify(files)),parentReleaseId:manifest.releaseId};await writeFile(resolve(to,'release.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});await verifyRetainedRelease(to);return result;
}
