// Local/synthetic targets only; reproduce the exact owner-approved catalogue.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareReadiness} from '../../scripts/prepare-launch-readiness.mjs';
import {assertApprovedPublicationManifest,seedPlan,regionPlan,regions} from '../../scripts/private-test-catalogue.mjs';
import {setup} from './cowrieCommerce.mjs';
import {populatedRecoveryFixture} from './populatedRecovery.mjs';
export async function approvedRetainedFixture({populated=false,at=Date.now()}={}){
 const directory=await mkdtemp(join(tmpdir(),'wybp-retained-catalogue-'));
 try{
  const data=await prepareReadiness(directory);await assertApprovedPublicationManifest(data.manifest);
  const catalogueStatements=[];
  const initialiseCatalogue=async database=>{
   const apply=r=>{database.prepare(r.sql).run(...r.params);catalogueStatements.push(r);};
   for(const r of seedPlan(data.seed))apply(r);
   for(const region of regions)for(const action of ['import','publish'])for(const r of regionPlan(action,region,data,at))apply(r);
  };
  const context=await (populated?populatedRecoveryFixture:setup)({initialiseCatalogue,at});return {...context,catalogueStatements};
 }finally{await rm(directory,{recursive:true,force:true});}
}
