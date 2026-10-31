import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyKeyCopies,main} from '../../scripts/verify-key-custody.mjs';

test('recovered synthetic key decrypts without asserting independent custody',()=>{
  const key=randomBytes(32),result=verifyKeyCopies(key,Buffer.from(key));
  assert.equal(result.syntheticDecryption,true);assert.equal(result.independentStorageVerified,false);assert.equal(result.independentCustodianVerified,false);
  assert.throws(()=>verifyKeyCopies(key,randomBytes(32)),/differ/);
  assert.throws(()=>verifyKeyCopies(key,Buffer.alloc(31)),/length/);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(key.toString('hex')));
});

test('file check rejects one file presented twice, including hard links',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'wybp-synthetic-key-check-')),primary=join(directory,'primary.key'),recovery=join(directory,'recovery.key');
  try{await writeFile(primary,randomBytes(32));await assert.rejects(main(['--primary-file',primary,'--recovery-file',primary]),/distinct/);await link(primary,recovery);await assert.rejects(main(['--primary-file',primary,'--recovery-file',recovery]),/distinct/);}
  finally{await rm(directory,{recursive:true,force:true});}
});
