// Explicit authenticated Wrangler remote binding; importing this file does not
// connect, deploy, load a secret file or create a hosted Worker/public bridge.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
import {verifyRetainedRelease} from './retained-release.mjs';import {verifyRetainedGrant,retainedCustodyEvidence,retainedHash,RETAINED_ACCOUNT} from '../worker/retainedBenchmarkPolicy.mjs';
import {assertRetainedHeadroom} from './retained-headroom.mjs';
const fail=()=>{throw Error('retained_private_connection_blocked');};
export function retainedConnectionConfiguration(){return {name:'wybp-local-retained-controller',account_id:RETAINED_ACCOUNT,compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],workers_dev:false,preview_urls:false,observability:{enabled:false},services:[{binding:'OPERATOR',service:'wybp-capacity-worker-r002',entrypoint:'RetainedOperator',remote:true}]};}
export async function connectRetainedOperator({releaseDirectory,envelope,approvalKey,preflight,currentHeadroom=preflight,now=Date.now,platformFactory}){
 const grant=verifyRetainedGrant(envelope,approvalKey,now()),release=await verifyRetainedRelease(releaseDirectory);
 assertRetainedHeadroom(currentHeadroom,now());
 if(release.manifest.sourceCommitted!==true||release.manifest.sourceRevision!==grant.sourceRevision||preflight?.ownerApproved!==true||preflight.account!==RETAINED_ACCOUNT||preflight.businessContractVerified!==true||!retainedCustodyEvidence(preflight,grant)||preflight.inventoryComplete!==true||preflight.completeInventory!==true||preflight.noAutomaticTopups!==true||preflight.carryoverReconciled!==true||preflight.unknownPriorCharges!==false||retainedHash(preflight)!==grant.preflightEvidenceSha256||!Number.isSafeInteger(preflight.observedAt)||preflight.observedAt>now())fail();
 const parent=resolve(tmpdir()),directory=await mkdtemp(join(parent,'wybp-retained-binding-'));if(!directory.startsWith(parent+sep))fail();let platform;
 const dispose=async()=>{try{await platform?.dispose();}finally{await rm(directory,{recursive:true,force:true});}};
 try{
  const configPath=join(directory,'wrangler.json');await writeFile(configPath,JSON.stringify(retainedConnectionConfiguration())+'\n',{flag:'wx'});
  const factory=platformFactory||(await import('wrangler')).getPlatformProxy;platform=await factory({configPath,envFiles:[],persist:false,remoteBindings:true});const binding=platform.env.OPERATOR;if(!binding)fail();
  const active=()=>{if(now()>=grant.endsAt)fail();};
  const operator={step:(command,upper)=>{active();if(!command||typeof command.id!=='string')fail();return binding.step({...command,controllerIngress:true},upper);}};
  for(const method of ['readback','acceptJob','dayPlan','jobStatus','phase'])operator[method]=(...args)=>{active();return binding[method](...args,true);};
  return {operator,dispose,scope:'existing authenticated CLI; isolated RetainedOperator only; no production binding or public bridge'};
 }catch{await dispose();fail();}
}
