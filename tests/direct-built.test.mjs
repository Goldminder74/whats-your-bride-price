import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,cp,rm} from 'node:fs/promises';import {resolve,join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';import {verifyDirectRelease} from '../scripts/direct-release.mjs';
test('exact direct Worker package keeps HTML/assets private, renders with private access and blocks payment/owner routes',async()=>{
 const pointer=JSON.parse(await readFile('outputs/cloudflare-direct/latest.json','utf8')),manifest=await verifyDirectRelease(pointer.directory),config=JSON.parse(await readFile(resolve(pointer.directory,'wrangler.json'),'utf8')),secret='s'.repeat(43),origin=manifest.configuration.origin;
 assert.equal(Object.values(JSON.parse(await readFile(resolve(pointer.directory,'direct-build.json'),'utf8')).flags).some(Boolean),false);
 const paths=Object.keys(manifest.files).filter(p=>p.startsWith('server/')).sort((a,b)=>a==='server/index.js'?-1:b==='server/index.js'?1:a.localeCompare(b));
 const mf=new Miniflare({modules:paths.map(p=>({type:'ESModule',path:resolve(pointer.directory,p)})),modulesRoot:resolve(pointer.directory,'server'),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,WYBP_PRIVATE_ACCESS_TOKEN:secret},assets:{directory:resolve(pointer.directory,'client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},outboundService:()=>{throw Error('Hosted services forbidden');}});
 try{
  const asset='/'+Object.keys(manifest.files).find(p=>p.startsWith('client/')&&p.endsWith('.svg')).slice(7);
  for(const path of ['/',asset])assert.equal((await mf.dispatchFetch(origin+path)).status,401);
  const auth={authorization:'Bearer '+secret};const response=await mf.dispatchFetch(origin,{headers:auth});assert.equal(response.status,200);assert.match(await response.text(),/What.s Your Bride Price|bride price/i);
  assert.equal((await mf.dispatchFetch(origin+asset,{headers:auth})).status,200);
  for(const path of ['/owner','/commerce/stripe-webhook','/commerce/stripe-test-webhook'])assert.equal((await mf.dispatchFetch(origin+path,{method:'POST',headers:auth})).status,404);
  assert.equal((await mf.dispatchFetch('https://attacker.example/',{headers:auth})).status,404);
 }finally{await mf.dispose();}
 const temp=await mkdtemp(join(tmpdir(),'wybp-direct-pair-'));try{
  await cp(pointer.directory,temp,{recursive:true});const workerPath=join(temp,'wrangler.json'),w=JSON.parse(await readFile(workerPath,'utf8'));w.vars.WYBP_PUBLIC_ACCESS_ENABLED='true';await writeFile(workerPath,JSON.stringify(w));
  const file=join(temp,'release.json'),m=JSON.parse(await readFile(file,'utf8'));m.files['wrangler.json']=createHash('sha256').update(await readFile(workerPath)).digest('hex');m.releaseId=createHash('sha256').update(JSON.stringify({config:m.configuration,hashes:m.files})).digest('hex');await writeFile(file,JSON.stringify(m));await assert.rejects(verifyDirectRelease(temp),/direct_release_protection/);
 }finally{await rm(temp,{recursive:true,force:true});}
});
