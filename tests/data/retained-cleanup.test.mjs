import test from 'node:test';import assert from 'node:assert/strict';
import {cleanupRetainedBatch} from '../../worker/retainedCleanup.mjs';
import {createDriveRecordHeader} from '../../scripts/drive-record-header.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(count=50){
 const key=Buffer.alloc(32,7),at=Date.now(),folders=Array.from({length:17},(_,i)=>({folderId:'synthetic_cleanup_folder_'+i})),folder=folders[1],remaining=new Map(),stats={lists:0,calls:[],active:0,peak:0};
 for(let i=0;i<count;i++){const id='synthetic_cleanup_file_'+i,name='retained_cleanup_'+i+'.enc';remaining.set(id,{id,name,parents:[folder.folderId],mimeType:'application/octet-stream',appProperties:createDriveRecordHeader({key,folderId:folder.folderId,fileId:id,name},{sha256:'a'.repeat(64),createdAt:at,expiresAt:at+2592000000})});}
 const f={key,folders,folder,remaining,stats,hook:async()=>{},page:null};
 folder.auditWindow=async()=>{stats.lists++;return f.page||{files:[...remaining.values()].slice(0,50),cursor:remaining.size>50?'synthetic_next_page':null};};
 folder.request=async(url,options)=>{assert.equal(options.method,'DELETE');const id=url.split('/').at(-1);assert.ok(remaining.has(id));stats.calls.push(id);stats.active++;stats.peak=Math.max(stats.peak,stats.active);try{const response=await f.hook(id,stats.calls.length);if(response)return response;remaining.delete(id);return new Response(null,{status:204});}finally{stats.active--;}};
 f.run=()=>cleanupRetainedBatch({folder,folderIndex:1,folders,key});return f;
}
test('fifty-file cleanup genuinely overlaps two lanes, re-lists from the first page and leaves no skipped files',async()=>{
 const f=fixture(123),started=deferred(),release=deferred();f.hook=async()=>{if(f.stats.calls.length===2)started.resolve();await release.promise;};
 const pending=f.run();await started.promise;assert.equal(f.stats.active,2);assert.equal(f.stats.calls.length,2);release.resolve();
 assert.deepEqual(await pending,{deleted:50,complete:false});assert.equal(f.remaining.size,73);assert.equal(f.stats.peak,2);
 assert.deepEqual(await f.run(),{deleted:50,complete:false});assert.deepEqual(await f.run(),{deleted:23,complete:false});assert.deepEqual(await f.run(),{deleted:0,complete:true});assert.equal(f.stats.lists,4);assert.equal(new Set(f.stats.calls).size,123);assert.equal(f.stats.calls.length,123);
});
test('every header, parent, MIME and duplicate is checked before any deletion, including the last file',async()=>{
 const changes=[f=>{[...f.remaining.values()].at(-1).appProperties.wybpRecordProof='0'.repeat(64);},f=>{[...f.remaining.values()].at(-1).parents=['foreign_parent_folder'];},f=>{[...f.remaining.values()].at(-1).mimeType='text/plain';},f=>{const files=[...f.remaining.values()];f.page={files:[...files.slice(0,49),files[0]],cursor:null};},f=>{const files=[...f.remaining.values()];f.page={files:[...files,files[0]],cursor:null};},f=>{f.page={files:[...f.remaining.values()],cursor:''};}];
 for(const change of changes){const f=fixture();change(f);await assert.rejects(f.run());assert.equal(f.stats.calls.length,0);assert.equal(f.remaining.size,50);}
 const f=fixture();await assert.rejects(cleanupRetainedBatch({folder:f.folder,folderIndex:1,folders:f.folders,key:Buffer.alloc(32,8)}));assert.equal(f.stats.calls.length,0);
 for(const folderIndex of ['1',1.1,-1,17])await assert.rejects(cleanupRetainedBatch({folder:f.folder,folderIndex,folders:f.folders,key:f.key}));assert.equal(f.stats.calls.length,0);
});
test('root cleanup preserves only known child folders; a foreign folder fails before a valid file can be deleted',async()=>{
 const f=fixture(1),root=f.folders[0],children=f.folders.slice(1).map(c=>({id:c.folderId,name:c.folderId,parents:[root.folderId],mimeType:'application/vnd.google-apps.folder'}));let calls=0;root.auditWindow=async()=>({files:children,cursor:null});root.request=async()=>{calls++;throw Error('must not delete a directory');};
 assert.deepEqual(await cleanupRetainedBatch({folder:root,folderIndex:0,folders:f.folders,key:f.key}),{deleted:0,complete:true});assert.equal(calls,0);
 const at=Date.now(),file={...[...f.remaining.values()][0],parents:[root.folderId]};file.appProperties=createDriveRecordHeader({key:f.key,folderId:root.folderId,fileId:file.id,name:file.name},{sha256:'a'.repeat(64),createdAt:at,expiresAt:at+2592000000});
 root.auditWindow=async()=>({files:[file,...children,{id:'foreign_child_folder',name:'foreign',parents:[root.folderId],mimeType:'application/vnd.google-apps.folder'}],cursor:null});await assert.rejects(cleanupRetainedBatch({folder:root,folderIndex:0,folders:f.folders,key:f.key}));assert.equal(calls,0);
});
test('a lost delete acknowledgement stops new work and waits for the other lane; a later step safely re-lists',async()=>{
 const f=fixture(4),both=deferred(),release=deferred();let finished=false;
 f.hook=async(id,n)=>{if(n===1){await both.promise;f.remaining.delete(id);throw Error('synthetic lost acknowledgement');}both.resolve();await release.promise;};
 const pending=f.run().then(v=>({value:v}),error=>({error})).finally(()=>{finished=true;});await both.promise;await new Promise(r=>setImmediate(r));assert.equal(finished,false);assert.equal(f.stats.calls.length,2);assert.equal(f.stats.active,1);release.resolve();assert.match((await pending).error.message,/retained_cleanup_scope/);assert.equal(f.stats.active,0);assert.equal(f.stats.calls.length,2);
 f.hook=async()=>{};assert.deepEqual(await f.run(),{deleted:2,complete:false});assert.deepEqual(await f.run(),{deleted:0,complete:true});assert.equal(new Set(f.stats.calls).size,4);
});
test('provider 404 is a known absent object; other provider failures never report completion',async()=>{
 const missing=fixture(1);missing.hook=async id=>{missing.remaining.delete(id);return new Response(null,{status:404});};assert.deepEqual(await missing.run(),{deleted:1,complete:false});assert.deepEqual(await missing.run(),{deleted:0,complete:true});
 const failed=fixture(1);failed.hook=async()=>new Response(null,{status:500});await assert.rejects(failed.run(),/retained_cleanup_scope/);assert.equal(failed.remaining.size,1);
});
