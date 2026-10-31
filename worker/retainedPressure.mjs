// Synthetic storage/cardinality pressure, NOT financial history or snapshots.
// Random ciphertext is generated once, persisted encrypted in the accepted job,
// then uploaded in a later step. No deterministic nonce or production codec change.
import {createHash,randomBytes} from 'node:crypto';import {encryptRecord} from '../scripts/recovery-crypto.mjs';
const fail=()=>{throw Error('retained_pressure_scope');};
export function retainedPressureBatch(definition,state,key,at=Date.now()){
 if(definition.flow!=='pressure'||!Number.isInteger(definition.shard)||definition.shard<0||definition.shard>15||!Number.isInteger(definition.count)||definition.count<1||definition.count>75000||definition.paddingBytes!==4500||!Buffer.isBuffer(key)||key.length!==32||!Number.isSafeInteger(at))fail();
 const cursor=state?.cursor||{candidate:0,uploaded:0};if(!Number.isSafeInteger(cursor.candidate)||cursor.candidate<0||cursor.candidate>5000000||!Number.isInteger(cursor.uploaded)||cursor.uploaded<0||cursor.uploaded>=definition.count)fail();
 let candidate=cursor.candidate;const files=[];
 while(files.length<25&&cursor.uploaded+files.length<definition.count){
  if(candidate>=5000000)fail();const name='retained_pressure_'+definition.shard+'_'+String(candidate++).padStart(8,'0')+'.enc';if(parseInt(createHash('sha256').update(name).digest('hex').slice(0,2),16)%16!==definition.shard)continue;
  const ordinal=cursor.uploaded+files.length,historyDay=ordinal%30,createdAt=at-historyDay*86400000;
  const ciphertext=encryptRecord({synthetic:true,kind:'retained-inventory-pressure-v1',shard:definition.shard,ordinal,historyDay,padding:randomBytes(4500).toString('base64')},key,name).toString('base64');files.push({name,ciphertext,clocks:{createdAt,expiresAt:createdAt+2592000000}});
 }
 return {files,cursor:{candidate,uploaded:cursor.uploaded+files.length}};
}
