import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createCipheriv} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {encryptRecord,encryptArchiveRecord,decryptRecord} from '../../scripts/recovery-crypto.mjs';

test('bounded archives compress before encryption and read mixed legacy and compressed objects',()=>{
 const key=randomBytes(32),name='synthetic.segment.enc',value={rows:Array.from({length:1250},(_,id)=>({id,answer:'synthetic answer',region:'west',createdAt:1800000000000}))};
 const old=encryptRecord(value,key,name),compressed=encryptArchiveRecord(value,key,name);
 assert.equal(JSON.parse(compressed).codec,'gzip-json-v1');assert.ok(compressed.length<old.length/4);
 assert.deepEqual(decryptRecord(compressed,key,name),value);assert.deepEqual(decryptRecord(old,key,name),value);
 assert.equal(JSON.parse(encryptRecord(value,key,name)).codec,undefined,'ordinary intents retain original encoding');
 assert.equal(JSON.parse(encryptArchiveRecord({small:true},key,name)).codec,undefined,'small records avoid compression overhead');
});

test('archive codec, object identity, key and ciphertext are authenticated',()=>{
 const key=randomBytes(32),name='synthetic.segment.enc',value={text:'synthetic'.repeat(1000)},bytes=encryptArchiveRecord(value,key,name),encoded=JSON.parse(bytes);
 const withoutCodec={...encoded};delete withoutCodec.codec;
 const mutations=[{...encoded,codec:'unknown'},withoutCodec,{...encoded,body:encoded.body.slice(0,-4)+'AAAA'}];
 for(const changed of mutations)assert.throws(()=>decryptRecord(Buffer.from(JSON.stringify(changed)),key,name));
 const legacy=JSON.parse(encryptRecord(value,key,name));assert.throws(()=>decryptRecord(Buffer.from(JSON.stringify({...legacy,codec:'gzip-json-v1'})),key,name));
 assert.throws(()=>decryptRecord(bytes,key,name+'.changed'));assert.throws(()=>decryptRecord(bytes,randomBytes(32),name));
});

test('compression never permits larger plaintext or unbounded authenticated decompression',()=>{
 const key=randomBytes(32),name='synthetic.segment.enc';
 assert.throws(()=>encryptArchiveRecord({text:'x'.repeat(3500000)},key,name),/backup_archive_bounds/);
 assert.throws(()=>encryptArchiveRecord({},Buffer.alloc(31),name),/backup_key_required/);
 // Simulate an authenticated oversized archive from a faulty/old producer.
 // Authentication alone must not allow a decompression bomb past the existing bound.
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(JSON.stringify([name,'gzip-json-v1'])));
 const packed=gzipSync(Buffer.from(JSON.stringify({text:'x'.repeat(7000000)}))),body=Buffer.concat([cipher.update(packed),cipher.final()]);
 const bytes=Buffer.from(JSON.stringify({codec:'gzip-json-v1',iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),body:body.toString('base64')}));
 assert.throws(()=>decryptRecord(bytes,key,name),/larger than|buffer|output|length/i);
 const huge=Buffer.from(JSON.stringify({...JSON.parse(bytes),body:'A'.repeat(4700000)}));
 assert.throws(()=>decryptRecord(huge,key,name),/backup_archive_bounds/);
});
