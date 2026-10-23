import {readFile,readdir,mkdir,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {validateHostingOrigin} from '../app/hostingOrigin.ts';
const hash=b=>createHash('sha256').update(b).digest('hex');
const extensions=new Set(['.js','.css','.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.webmanifest']);
const account='b6b22a9a87b5758725e5c499782160af';
export function directConfiguration(env){
 const config={platform:'cloudflare-direct',environment:env.WYBP_HOSTING_ENVIRONMENT,origin:env.PUBLIC_APP_ORIGIN,workerName:'wybp-prod-app-r001'};
 validateHostingOrigin(config);
 if(!['https://classesforculture.com','https://wybp-prod-app-r001.ayo-m-ayeni.workers.dev'].includes(config.origin)||env.WYBP_WORKER_NAME!==config.workerName||env.WYBP_PRIVATE_TEST_PROFILE&&env.WYBP_PRIVATE_TEST_PROFILE!=='off')throw Error('direct_release_identity');
 return config;
}
async function files(root,prefix=''){
 const found=[];for(const item of await readdir(resolve(root,prefix),{withFileTypes:true})){
  const path=prefix?prefix+'/'+item.name:item.name;if(item.isSymbolicLink())throw Error('direct_release_symlink');
  if(item.isDirectory())found.push(...await files(root,path));else if(item.isFile())found.push(path);
 }return found.sort();
}
export async function packageDirectRelease(root,config){
 if(JSON.stringify(directConfiguration({WYBP_HOSTING_ENVIRONMENT:config.environment,PUBLIC_APP_ORIGIN:config.origin,WYBP_WORKER_NAME:config.workerName}))!==JSON.stringify(config))throw Error('direct_release_identity');
 const entries={};for(const kind of ['server','client'])for(const path of await files(resolve(root,'dist',kind))){
  if(path.split('/').some(p=>p.startsWith('.'))||kind==='server'&&!path.endsWith('.js')||kind==='client'&&!extensions.has(extname(path)))continue;
  entries[kind+'/'+path]=await readFile(resolve(root,'dist',kind,path));
 }
 if(!entries['server/index.js']||!Object.keys(entries).some(p=>p.startsWith('client/')&&p.endsWith('.js')))throw Error('direct_release_incomplete');
 const build=JSON.parse(await readFile(resolve(root,'dist/direct-build.json'),'utf8'));
 if(JSON.stringify(build.configuration)!==JSON.stringify(config)||build.serverEntrySha256!==hash(entries['server/index.js']))throw Error('direct_build_pairing');
 entries['direct-build.json']=Buffer.from(JSON.stringify(build)+'\n');
 const generated=JSON.parse(await readFile(resolve(root,'dist/server/wrangler.json'),'utf8'));
 const worker={name:config.workerName,account_id:account,main:'server/index.js',no_bundle:true,rules:[{type:'ESModule',globs:['**/*.js']}],
  compatibility_date:generated.compatibility_date,compatibility_flags:generated.compatibility_flags,
  workers_dev:config.environment==='test',preview_urls:false,observability:{enabled:false},
  assets:{directory:'client',binding:'ASSETS',run_worker_first:true},images:{binding:'IMAGES'},
  d1_databases:[{binding:'DB',database_name:'wybp-prod-d1-r001',database_id:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'}],
  services:[{binding:'AUTHORITY',service:'wybp-prod-ops-r001',entrypoint:'ApplicationAuthority'}],
  vars:{WYBP_AUTHORITY_ROLE:'production-app',WYBP_DIRECT_ORIGIN:config.origin,WYBP_PUBLIC_ACCESS_ENABLED:'false',WYBP_LIVE_WEBHOOK_ENABLED:'false',WYBP_APPROVED_SALES_TERRITORIES_JSON:'["GB"]'},
 };
 entries['wrangler.json']=Buffer.from(JSON.stringify(worker,null,2)+'\n');
 const hashes=Object.fromEntries(Object.entries(entries).map(([path,bytes])=>[path,hash(bytes)])),releaseId=hash(JSON.stringify({config,hashes}));
 const directory=resolve(root,'outputs/cloudflare-direct',releaseId);await mkdir(directory,{recursive:true});
 for(const[path,bytes]of Object.entries(entries)){const to=resolve(directory,path);await mkdir(dirname(to),{recursive:true});await writeFile(to,bytes);}
 await writeFile(resolve(directory,'release.json'),JSON.stringify({version:1,releaseId,configuration:config,files:hashes},null,2)+'\n');
 await verifyDirectRelease(directory);await writeFile(resolve(root,'outputs/cloudflare-direct/latest.json'),JSON.stringify({directory,releaseId})+'\n');return directory;
}
export async function verifyDirectRelease(directory){
 const root=resolve(directory),manifest=JSON.parse(await readFile(resolve(root,'release.json'),'utf8')),config=manifest.configuration;
 directConfiguration({WYBP_HOSTING_ENVIRONMENT:config.environment,PUBLIC_APP_ORIGIN:config.origin,WYBP_WORKER_NAME:config.workerName});
 if(hash(JSON.stringify({config,hashes:manifest.files}))!==manifest.releaseId)throw Error('direct_release_hash');
 for(const[path,expected]of Object.entries(manifest.files)){
  const full=resolve(root,path);if(!full.startsWith(root+sep)||(await lstat(full)).isSymbolicLink()||hash(await readFile(full))!==expected)throw Error('direct_release_file');
  if(path.startsWith('client/')&&(!extensions.has(extname(path))||path.split('/').some(p=>p.startsWith('.'))))throw Error('direct_release_private_file');
 }
 if((await files(root)).some(p=>p!=='release.json'&&!Object.hasOwn(manifest.files,p)))throw Error('direct_release_extra');
 const worker=JSON.parse(await readFile(resolve(root,'wrangler.json'),'utf8'));
 if(worker.name!=='wybp-prod-app-r001'||worker.account_id!==account||worker.main!=='server/index.js'||worker.no_bundle!==true||worker.assets?.run_worker_first!==true||worker.assets?.binding!=='ASSETS'||worker.assets?.directory!=='client'||worker.preview_urls!==false||worker.workers_dev!==(config.environment==='test')||worker.observability?.enabled!==false||worker.triggers||worker.routes||worker.r2_buckets||JSON.stringify(worker.services)!==JSON.stringify([{binding:'AUTHORITY',service:'wybp-prod-ops-r001',entrypoint:'ApplicationAuthority'}])||JSON.stringify(worker.d1_databases)!==JSON.stringify([{binding:'DB',database_name:'wybp-prod-d1-r001',database_id:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'}])||JSON.stringify(worker.vars)!==JSON.stringify({WYBP_AUTHORITY_ROLE:'production-app',WYBP_DIRECT_ORIGIN:config.origin,WYBP_PUBLIC_ACCESS_ENABLED:'false',WYBP_LIVE_WEBHOOK_ENABLED:'false',WYBP_APPROVED_SALES_TERRITORIES_JSON:'["GB"]'}))throw Error('direct_release_protection');
 return manifest;
}
