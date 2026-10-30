// Preparation only. Reuse one RPC's existing OAuth and verified-folder scope
// for <=25 immutable synthetic files; no cross-request security cache is added.
import {decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
const fail=()=>{throw Error('retained_fixture_upload_blocked');};
export async function retainedFixtureUpload({custody,key,phase},files){
 if(phase!=='setup'||!Array.isArray(files)||!files.length||files.length>25||new Set(files.map(f=>f.name)).size!==files.length||Buffer.byteLength(JSON.stringify(files))>3500000)fail();
 const decoded=files.map(f=>{if(!/^(retained_[a-zA-Z0-9_.-]{1,140}|op_\d{13}_[a-f0-9]{32}\.intent)$/.test(f.name||'')||typeof f.ciphertext!=='string'||!Number.isSafeInteger(f.clocks?.createdAt)||!Number.isSafeInteger(f.clocks?.expiresAt)||f.clocks.createdAt>Date.now()||f.clocks.expiresAt-f.clocks.createdAt!==2592000000||f.clocks.expiresAt<=Date.now())fail();const bytes=Buffer.from(f.ciphertext,'base64');if(bytes.toString('base64')!==f.ciphertext||bytes.length>3500000)fail();decryptRecord(bytes,key,f.name);return {...f,bytes};});
 const target=custody.target(files[0].name);if(files.some(f=>custody.target(f.name)!==target))fail();
 // Validate every actual folder before generating IDs or uploading any bytes.
 for(const f of files)if(await custody.existing(f.name)!==target)fail();
 await target.reserveFiles(files.map(f=>({name:f.name,clocks:f.clocks})));
 const objects=[];for(const f of decoded){const sha256=await target.put(f.name,f.bytes,f.clocks,{createOnly:true});if(sha256!==recoveryHash(f.bytes))fail();objects.push({name:f.name,sha256});}
 return {objects};
}
