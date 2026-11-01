// Synthetic preparation only. Never reads credentials or targets a hosted database.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {populatedRecoveryFixture} from '../tests/helpers/populatedRecovery.mjs';
import {providerRestorePlan} from './d1-operational-recovery.mjs';
import {recoveryHash} from './recovery-crypto.mjs';
const quote=value=>'"'+value.replaceAll('"','""')+'"';
export function buildHostedRecoveryBundle(source,originalTriggers){
 const plan=providerRestorePlan(source,{unboundRehearsal:true,pageSize:20});
 const tables=plan.tables.map(name=>{const columns=source.prepare('PRAGMA table_info('+quote(name)+')').all().map(c=>c.name),projection=columns.map(c=>'quote('+quote(c)+') AS '+quote(c)).join(',');return {name,columns,rows:source.prepare('SELECT '+projection+' FROM '+quote(name)).all().map(r=>JSON.stringify(r)).sort()};});
 const cleanupPages=[];for(let i=0;i<plan.triggers.length;i+=20)cleanupPages.push(plan.triggers.slice(i,i+20).map(t=>({sql:'DROP TRIGGER '+quote(t.name),params:[]})));
 cleanupPages.push([{sql:'PRAGMA defer_foreign_keys=ON',params:[]},...plan.tables.map(name=>({sql:'DELETE FROM '+quote(name),params:[]}))]);
 for(let i=0;i<originalTriggers.length;i+=20)cleanupPages.push(originalTriggers.slice(i,i+20).map(t=>({sql:t.sql,params:[]})));
 return {scope:'synthetic-only-v1',pages:plan.pages,manifestHash:plan.sha256,tables,triggers:plan.triggers,originalTriggers,cleanupPages};
}
async function main(){
 const directory=resolve('outputs/authority-preparation'),file=resolve(directory,'hosted-populated-bundle.json');
 try{const prior=await readFile(file);console.log(recoveryHash(prior));return;}catch(error){if(error.code!=='ENOENT')throw error;}
 const envelope=JSON.parse((await readFile(resolve(directory,'original-hosted-triggers.json'),'utf8')).replace(/^\uFEFF/,'')),triggers=envelope.flatMap(r=>r.results||[]);
 const c=await populatedRecoveryFixture();try{const bundle=buildHostedRecoveryBundle(c.database,triggers),bytes=Buffer.from(JSON.stringify(bundle));if(bytes.length>1024*1024)throw Error('synthetic_bundle_bounds');await writeFile(file,bytes);console.log(JSON.stringify({sha256:recoveryHash(bytes),pages:bundle.pages.length,bytes:bytes.length,closedCases:123}));}finally{c.database.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{process.stderr.write('synthetic_preparation_failed\n');process.exitCode=1;});
