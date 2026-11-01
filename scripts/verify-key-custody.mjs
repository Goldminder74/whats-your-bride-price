import {readFile,realpath,stat} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {encryptRecord,decryptRecord} from './operational-backup.mjs';

/** Proves matching usable key bytes, NOT independent storage, human custody or a recovery SLA. */
export function verifyKeyCopies(primary,recovery) {
  if(!Buffer.isBuffer(primary)||!Buffer.isBuffer(recovery)||primary.length!==32||recovery.length!==32)throw Error('key_length_invalid');
  if(!timingSafeEqual(primary,recovery))throw Error('key_copies_differ');
  const challenge={purpose:'synthetic key-custody check',nonce:randomBytes(32).toString('hex')};
  const sealed=encryptRecord(challenge,primary,'production-key-custody-check');
  const opened=decryptRecord(sealed,recovery,'production-key-custody-check');
  if(opened.nonce!==challenge.nonce||opened.purpose!==challenge.purpose)throw Error('key_recovery_failed');
  return {matchingCopies:true,syntheticDecryption:true,independentStorageVerified:false,independentCustodianVerified:false};
}

export async function main(args=process.argv.slice(2)) {
  if(args.length!==4||args[0]!=='--primary-file'||args[2]!=='--recovery-file')throw Error('key_file_arguments_required');
  const paths=await Promise.all([args[1],args[3]].map(p=>realpath(resolve(p))));
  const repository=await realpath(resolve('.'));
  for(const path of paths){const r=relative(repository,path);if(!r||(!r.startsWith('..')&&!r.includes(':')))throw Error('key_must_be_outside_repository');}
  const info=await Promise.all(paths.map(p=>stat(p)));
  if(paths[0]===paths[1]||info.some(s=>!s.isFile()||s.size!==32)||info[0].dev===info[1].dev&&info[0].ino===info[1].ino)throw Error('distinct_key_files_required');
  let primary,recovery;
  try{primary=await readFile(paths[0]);recovery=await readFile(paths[1]);return verifyKeyCopies(primary,recovery);}
  finally{primary?.fill(0);recovery?.fill(0);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Key custody check failed. No key values or file contents logged.');process.exitCode=1;});
