// Fixed isolated resource creation only. The caller supplies authenticated API
// clients and a durable local journal; this module never loads or prints secrets.
import {verifyBenchmarkPreflight,assertBenchmarkResource} from './approved-benchmark-budget.mjs';
const account='b6b22a9a87b5758725e5c499782160af',team='goldminder74';
const names={database:'wybp-capacity-d1-r002',site:'wybp-capacity-private-r002'};
const fail=()=>{throw Error('benchmark_provision_reconciliation_required');};
export async function provisionBenchmarkResources({preflight,inventory,create,readJournal,writeJournal,now=Date.now}){
 verifyBenchmarkPreflight(preflight,now());
 // The Worker does not exist yet, so its hosted CPU setting cannot honestly be
 // attested here. Execution has its separate, stricter post-deploy preflight.
 if(preflight.standardPaidConfirmed!==true)fail();
 if(![inventory,create,readJournal,writeJournal].every(f=>typeof f==='function'))fail();
 let journal=await readJournal();
 if(journal===null){journal={version:1,account,team,resources:{}};await writeJournal(journal);}
 if(journal?.version!==1||journal.account!==account||journal.team!==team||!journal.resources)fail();
 for(const kind of ['database','site']){
  // The inventory client must prove that it followed all provider pages.
  const observed=await inventory(kind);
  if(observed?.complete!==true||!Array.isArray(observed.resources))fail();
  const matches=observed.resources.filter(r=>r.name===names[kind]),prior=journal.resources[kind];
  if(matches.length>1)fail();
  if(prior){
   // A lost create response is deliberately not retried. A name alone cannot
   // prove that a concurrent operator did not create the resource instead.
   if(prior.state!=='created'||matches.length!==1||matches[0].id!==prior.id)fail();
   assertBenchmarkResource(kind,matches[0]);continue;
  }
  if(matches.length)fail();
  journal.resources[kind]={name:names[kind],state:'creating',attemptedAt:now()};
  await writeJournal(journal); // durable BEFORE the non-idempotent provider POST
  const resource=await create(kind,{name:names[kind],account,team});
  assertBenchmarkResource(kind,resource);
  journal.resources[kind]={...resource,state:'created'};await writeJournal(journal);
 }
 return Object.fromEntries(Object.entries(journal.resources).map(([k,{state,...resource}])=>{if(state!=='created')fail();return [k,resource];}));
}
