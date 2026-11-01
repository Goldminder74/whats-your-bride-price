import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {resolve} from 'node:path';

test('actual Worker runtime authenticates compressed archives and enforces decompression bounds',async()=>{
 const compiled=await build({stdin:{contents:`
  import {encryptArchiveRecord,encryptRecord,decryptRecord} from './scripts/recovery-crypto.mjs';
  import {createCipheriv} from 'node:crypto';import {gzipSync} from 'node:zlib';
  export default {async fetch(){
   const key=Buffer.alloc(32,7),name='synthetic.archive',value={text:'synthetic'.repeat(2000)},packed=encryptArchiveRecord(value,key,name);
   const iv=Buffer.alloc(12,2),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(JSON.stringify([name,'gzip-json-v1'])));
   const body=Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify({text:'x'.repeat(7000000)})))),cipher.final()]);
   const oversized=Buffer.from(JSON.stringify({codec:'gzip-json-v1',iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),body:body.toString('base64')}));
   let blocked=false;try{decryptRecord(oversized,key,name);}catch{blocked=true;}
   return Response.json({compressed:JSON.parse(packed).codec==='gzip-json-v1',roundTrip:decryptRecord(packed,key,name).text===value.text,legacy:decryptRecord(encryptRecord(value,key,name),key,name).text===value.text,oversizedBlocked:blocked});
  }};`,resolveDir:resolve('.'),sourcefile:'synthetic-recovery-archive.mjs',loader:'js'},bundle:true,write:false,format:'esm',platform:'neutral',external:['node:*']});
 const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat']});
 try{const worker=await mf.getWorker();assert.deepEqual(await(await worker.fetch('https://synthetic.invalid/')).json(),{compressed:true,roundTrip:true,legacy:true,oversizedBlocked:true});}finally{await mf.dispose();}
});
