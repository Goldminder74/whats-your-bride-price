import test from 'node:test';import assert from 'node:assert/strict';
import {windowedDriveAudit} from '../../scripts/windowed-drive-audit.mjs';
test('50-record windows preserve every10/25-record verifier page and a process restart pins the same page and cursor',async()=>{
 const key=Buffer.alloc(32,7),folderId='synthetic_window_folder',files=Array.from({length:137},(_,i)=>({id:'synthetic_window_'+i,name:String(i).padStart(4,'0'),parents:[folderId]}));let calls=0;
 const fetchWindow=async({cursor})=>{calls++;const at=Number(cursor||0);return {files:files.slice(at,at+50),cursor:at+50<files.length?String(at+50):null};};
 for(const pageSize of [10,25]){calls=0;let audit=windowedDriveAudit({fetchWindow,key,folderId}),cursor=null,seen=[],restarted=false;
  do{const r=await audit({cursor,pageSize});seen.push(...r.files.map(f=>f.id));if(!restarted&&seen.length>=pageSize*2){const again=windowedDriveAudit({fetchWindow,key,folderId}),a=await audit({cursor,pageSize}),b=await again({cursor,pageSize});assert.deepEqual(a,b);audit=again;restarted=true;}cursor=r.cursor;}while(cursor);
  assert.deepEqual(seen,files.map(f=>f.id));assert.equal(new Set(seen).size,137);assert.ok(calls<=5);
 }
});
test('foreign/forged cursors and changed provider pages fail before another page is accepted',async()=>{
 const key=Buffer.alloc(32,7),folderId='synthetic_window_folder',files=Array.from({length:50},(_,i)=>({id:'synthetic_file_'+i}));let calls=0;
 const fetchWindow=async()=>{calls++;return {files,cursor:null};},audit=windowedDriveAudit({fetchWindow,key,folderId}),first=await audit({pageSize:10});
 const changed=first.cursor.slice(0,-1)+(first.cursor.endsWith('0')?'1':'0');await assert.rejects(audit({cursor:changed}));assert.equal(calls,1);
 await assert.rejects(windowedDriveAudit({fetchWindow,key,folderId:'other_synthetic_folder'})({cursor:first.cursor}));assert.equal(calls,1);
 files[12]={id:'different_synthetic_file'};await assert.rejects(windowedDriveAudit({fetchWindow,key,folderId})({cursor:first.cursor}));
 await assert.rejects(audit({cursor:first.cursor,pageSize:25}));await assert.rejects(audit({pageSize:50}));
});

test('a new independent scan never reuses a prior first-page cache',async()=>{let files=[{id:'first'}],calls=0;const audit=windowedDriveAudit({key:Buffer.alloc(32,7),folderId:'synthetic_window_folder',fetchWindow:async()=>{calls++;return {files:[...files],cursor:null};}});assert.equal((await audit({pageSize:10})).files.length,1);files.push({id:'newly-published'});assert.equal((await audit({pageSize:10})).files.length,2);assert.equal(calls,2);});
