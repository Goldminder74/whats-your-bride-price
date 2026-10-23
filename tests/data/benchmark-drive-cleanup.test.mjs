import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupBenchmarkDrive} from '../../scripts/benchmark-drive-cleanup.mjs';
const root='synthetic_root_001',folders=Array.from({length:16},(_,i)=>'synthetic_partition_'+i),runId='synthetic_r002';
test('populated cleanup batches every mapping and rejects incomplete batch proof before deletion',async()=>{
 for(const missing of [false,true]){
  let batches=0,deletes=0,removed=false;const count=2000;
  const request=async(url,init={})=>{
   if(init.method==='DELETE'){assert.equal(batches,20);deletes++;removed=true;return new Response(null,{status:204});}
   const u=new URL(url);if(u.pathname.endsWith('/'+root))return removed?new Response(null,{status:404}):Response.json({id:root,name:'wybp-capacity-r002-'+runId,parents:['1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr'],mimeType:'application/vnd.google-apps.folder',appProperties:{wybpBenchmarkRun:runId},permissions:[{type:'user',role:'owner'}]});
   const q=u.searchParams.get('q');if(q.startsWith("'"+root+"'"))return Response.json({files:folders.map((id,i)=>({id,name:'partition_'+String(i).padStart(2,'0'),mimeType:'application/vnd.google-apps.folder',appProperties:{wybpBenchmarkRun:runId}}))});
   if(!q.startsWith("'"+folders[0]+"'"))return Response.json({files:[]});
   const start=Number(u.searchParams.get('pageToken')||0);return Response.json({files:Array.from({length:Math.min(100,count-start)},(_,i)=>({id:'synthetic_file_'+(start+i),name:'object_'+(start+i)+'.enc',appProperties:{wybpRecovery:'1'}})),...(start+100<count?{nextPageToken:String(start+100)}:{})});
  };
  const action=()=>cleanupBenchmarkDrive({root,folders,runId,stopped:true,request,indexLookup:()=>assert.fail('per-file D1 lookup forbidden'),indexLookupMany:async(folder,names)=>{assert.equal(folder,folders[0]);assert.ok(names.length<=100);batches++;const pairs=names.map(n=>[n,'synthetic_file_'+n.match(/\d+/)[0]]);return new Map(missing?pairs.slice(1):pairs);}});
  if(missing){await assert.rejects(action(),/scope_unverified/);assert.equal(deletes,0);}else{assert.equal((await action()).files,count);assert.equal(deletes,1);assert.equal(batches,20);}
 }
});
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
