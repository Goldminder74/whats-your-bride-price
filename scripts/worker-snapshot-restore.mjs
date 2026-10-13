// Offline materialisation of the actual encrypted Worker snapshot format. Never
// opens application access or manufactures a retention/financial review receipt.
import { DatabaseSync } from 'node:sqlite';
import { readBoundary } from './authority-runtime.mjs';
import { decryptRecord, recoveryHash } from './recovery-crypto.mjs';
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const fail=()=>{throw Error('worker_snapshot_invalid');};
export async function materializeWorkerSnapshot(custody,key,id,receipt){
 const boundary=await readBoundary(custody,key,id,receipt);
 if(boundary.format!=='wybp-d1-pages-v1'||!Number.isInteger(boundary.pageSize)||boundary.pageSize<1||boundary.pageSize>100)fail();
 const files=new Map(boundary.files.map(f=>[f.name,f]));if(files.size!==boundary.files.length)fail();
 async function decode(name){const file=files.get(name);if(!file)fail();const bytes=await custody.get(name);if(!bytes||recoveryHash(bytes)!==file.sha256)fail();files.delete(name);return decryptRecord(bytes,key,name);}
 const {schema}=await decode(id+'.schema.enc');
 if(!Array.isArray(schema)||schema.some(s=>!['table','index','trigger','view'].includes(s.type)||typeof s.name!=='string'||typeof s.sql!=='string'||/\b(ATTACH|DETACH|load_extension|writable_schema)\b/i.test(s.sql)))fail();
 const reserved=new Set(['operational_authority_outbox','operational_recovery_checkpoints','retention_restore']);
 const tables=schema.filter(s=>s.type==='table'&&!reserved.has(s.name));
 if(Object.keys(boundary.counts).length!==tables.length||new Set(schema.map(s=>s.name)).size!==schema.length)fail();
 const database=new DatabaseSync(':memory:');
 try{
  database.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  for(const table of schema.filter(s=>s.type==='table'))database.exec(table.sql);
  for(const [index,table] of tables.entries()){
   const count=boundary.counts[table.name];if(!Number.isSafeInteger(count)||count<0)fail();
   const columns=database.prepare('PRAGMA table_info('+quote(table.name)+')').all().map(c=>c.name);
   for(let offset=0;offset<count;offset+=boundary.pageSize){
    const page=await decode(id+'.t'+index+'.p'+offset+'.enc');
    if(page.table!==table.name||page.offset!==offset||!Array.isArray(page.rows)||page.rows.length!==Math.min(boundary.pageSize,count-offset))fail();
    const insert=database.prepare('INSERT INTO '+quote(table.name)+'('+columns.map(quote).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')');
    for(const row of page.rows){
     if(Object.keys(row).length!==columns.length||columns.some(c=>!Object.hasOwn(row,c)))fail();
     insert.run(...columns.map(c=>{const value=row[c];if(value&&typeof value==='object'){if(Object.keys(value).length!==1||typeof value.binary!=='string')fail();const bytes=Buffer.from(value.binary,'base64');if(bytes.toString('base64')!==value.binary)fail();return bytes;}if(value!==null&&typeof value!=='string'&&!(typeof value==='number'&&Number.isSafeInteger(value)))fail();return value;}));
    }
   }
   if(database.prepare('SELECT COUNT(*) n FROM '+quote(table.name)).get().n!==count)fail();
  }
  for(const entry of schema.filter(s=>s.type==='index'))database.exec(entry.sql);
  if(files.size||database.prepare('PRAGMA foreign_key_check').all().length)fail();
  for(const entry of schema.filter(s=>s.type==='trigger'||s.type==='view'))database.exec(entry.sql);
  database.exec('COMMIT; PRAGMA foreign_keys=ON');
  return {database,receipt,runtimeAccess:'blocked_pending_fresh_receipt'};
 }catch{database.close();throw Error('worker_snapshot_invalid');}
}
