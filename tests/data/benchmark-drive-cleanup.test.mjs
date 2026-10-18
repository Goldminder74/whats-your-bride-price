import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupBenchmarkDrive} from '../../scripts/benchmark-drive-cleanup.mjs';
const root='synthetic_root_001',folders=Array.from({length:16},(_,i)=>'synthetic_partition_'+i),runId='synthetic_r002';
function fixture({foreign=false,incomplete=false,wrongIndex=false}={}){
 let deletes=0,removed=false,reads=0;
 const request=async(url,init={})=>{
  if(init.method==='DELETE'){assert.ok(reads>=18);deletes++;removed=true;return new Response(null,{status:204});}
  if(url.includes('/'+root+'?'))return removed?new Response(null,{status:404}):Response.json({id:root,name:'wybp-capacity-r002-'+runId,parents:['1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr'],mimeType:'application/vnd.google-apps.folder',appProperties:{wybpBenchmarkRun:runId},permissions:[{type:'user',role:'owner'}]});
  const parsed=new URL(url),q=parsed.searchParams.get('q');reads++;
  if(q.startsWith("'"+root+"'"))return Response.json({files:folders.map((id,i)=>({id,name:'partition_'+String(i).padStart(2,'0'),mimeType:'application/vnd.google-apps.folder',appProperties:{wybpBenchmarkRun:runId}}))});
  if(q.startsWith("'"+folders[0]+"'")){
   if(!parsed.searchParams.has('pageToken'))return Response.json({files:[{id:'synthetic_file_001',name:'synthetic.enc',appProperties:foreign?{}:{wybpRecovery:'1'}}],nextPageToken:'second',incompleteSearch:incomplete});
  }
  return Response.json({files:[]});
 };
 return {request,indexLookup:async()=>wrongIndex?'different_file_001':'synthetic_file_001',deleted:()=>deletes};
}
test('cleanup checks complete paginated inventory and original scope before deleting only its disposable root',async()=>{
 const f=fixture();assert.deepEqual(await cleanupBenchmarkDrive({root,folders,runId,stopped:true,...f}),{removed:true,folders:17,files:1,parentPreserved:true});assert.equal(f.deleted(),1);
});
test('foreign contents, incomplete inventory, index mismatch and unconfirmed stop never delete anything',async()=>{
 for(const overrides of [{foreign:true},{incomplete:true},{wrongIndex:true},{}]){
  const f=fixture(overrides);await assert.rejects(cleanupBenchmarkDrive({root,folders,runId,stopped:Object.keys(overrides).length>0,...f}),/scope_unverified/);assert.equal(f.deleted(),0);
 }
});
