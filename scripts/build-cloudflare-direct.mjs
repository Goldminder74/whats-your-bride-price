import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {directConfiguration,packageDirectRelease,verifyDirectRelease} from './direct-release.mjs';
import {assertSecretFreeBuild} from './secret-free-build.mjs';
import {resolveFeatureFlags} from '../app/featureFlags.ts';
const env={...process.env,WYBP_DEPLOY_TARGET:'cloudflare-direct'},config=directConfiguration(env);await assertSecretFreeBuild(process.cwd(),env);
const built=spawnSync(process.execPath,['node_modules/vinext/dist/cli.js','build'],{env,stdio:'inherit'});if(built.status!==0)process.exit(built.status||1);
const hash=b=>createHash('sha256').update(b).digest('hex');
await writeFile('dist/direct-build.json',JSON.stringify({configuration:config,flags:resolveFeatureFlags(env),serverEntrySha256:hash(await readFile('dist/server/index.js'))})+'\n');
const directory=await packageDirectRelease(process.cwd(),config),manifest=await verifyDirectRelease(directory),out=await mkdtemp(join(tmpdir(),'wybp-direct-upload-'));
try{
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--config',resolve(directory,'wrangler.json'),'--outdir',out],{env:{...env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'},encoding:'utf8'});
 if(result.status!==0)throw Error('direct_upload_dry_run');
 const expected=Object.entries(manifest.files).filter(([p])=>p.startsWith('server/'));
 for(const[p,sha]of expected)if(hash(await readFile(join(out,p.slice(7))))!==sha)throw Error('direct_upload_pairing');
 async function modules(p){let n=0;for(const e of await readdir(p,{withFileTypes:true}))n+=e.isDirectory()?await modules(join(p,e.name)):e.name.endsWith('.js')?1:0;return n;}
 if(await modules(out)!==expected.length)throw Error('direct_upload_extra');
 console.log(JSON.stringify({directory,releaseId:manifest.releaseId,serverModules:expected.length,private:true,publicAccess:false,webhook:false,schedules:false,deployed:false}));
}finally{await rm(out,{recursive:true,force:true});}
