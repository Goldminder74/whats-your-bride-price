import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {encryptRecord,decryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {privatePath} from './operational-backup.mjs';
const fail=()=>{throw Error('benchmark_controller_readback_required');};
const hash=value=>recoveryHash(Buffer.from(JSON.stringify(value)));
// A receipt is encrypted and persisted BEFORE settling its durable reservation.
// Unknown responses retain their upper reservation and stop, never auto-replay.
export async function meteredBenchmarkController({budget,adapter,key,directory}){
 if(!budget?.reserve||!adapter?.upperBound||!Buffer.isBuffer(key)||key.length!==32)fail();
 directory=await privatePath(directory);await mkdir(directory,{recursive:true});
 return async function action(command,{preparation=false}={}){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(command?.id||''))fail();
  const path=join(directory,budget.id.replace(':','_')+'_'+command.id+'.enc'),aad=budget.id+':'+command.id,upper=adapter.upperBound(command);
  const admission=budget.reserve(command.id,upper,{preparation,pacedExternal:true});let receipt;
  try{receipt=decryptRecord(await readFile(path),key,aad);}catch(e){if(e.code!=='ENOENT'){budget.stop();fail();}}
  if(receipt){
   if(receipt.commandHash!==hash(command)||receipt.outcome.receiptSha256!==hash({result:receipt.outcome.result,usage:receipt.outcome.usage})){budget.stop();fail();}
   const settled=budget.settle(admission.ticket,receipt.outcome.usage,receipt.outcome.receiptSha256);if(settled?.stopped)fail();
   if(receipt.outcome.result.failed)fail();return receipt.outcome.result;
  }
  if(!admission.execute){budget.stop();fail();}
  try{
   const outcome=command.kind==='inventory'?await adapter.verifyInventory():await adapter.execute(command);
   if(outcome.receiptSha256!==hash({result:outcome.result,usage:outcome.usage}))fail();
   const staged=path+'.writing';await writeFile(staged,encryptRecord({commandHash:hash(command),outcome},key,aad),{mode:0o600});await rename(staged,path);
   if(budget.settle(admission.ticket,outcome.usage,outcome.receiptSha256)?.stopped||outcome.result.failed)fail();return outcome.result;
  }catch{budget.stop();fail();}
 };
}
