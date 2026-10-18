// Only the recorded disposable root is deletable. Inspect EVERY child, including
// files without our marker, before deleting anything. The approved parent survives.
export async function cleanupBenchmarkDrive({root,folders,runId,request,indexLookup,stopped}){
 const fail=()=>{throw Error('benchmark_cleanup_scope_unverified');};
 if(stopped!==true||!/^synthetic_[a-zA-Z0-9_-]{1,48}$/.test(runId||'')||!Array.isArray(folders)||folders.length!==16||new Set([root,...folders]).size!==17||[root,...folders].some(id=>!/^[a-zA-Z0-9_-]{10,160}$/.test(id||''))||typeof request!=='function'||typeof indexLookup!=='function')fail();
 const base='https://www.googleapis.com/drive/v3/files';
 const response=await request(base+'/'+root+'?fields=id,name,parents,mimeType,trashed,appProperties,permissions(type,role)');if(!response.ok)fail();
 const meta=await response.json();
 if(meta.id!==root||meta.name!=='wybp-capacity-r002-'+runId||meta.trashed||meta.mimeType!=='application/vnd.google-apps.folder'||meta.parents?.length!==1||meta.parents[0]!=='1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr'||meta.appProperties?.wybpBenchmarkRun!==runId||meta.permissions?.length!==1||meta.permissions[0].type!=='user'||meta.permissions[0].role!=='owner')fail();
 let files=0;const ids=new Set(),partitionSet=new Set();
 for(const folder of [root,...folders]){
  let cursor;const cursors=new Set();
  for(let page=0;;page++){
   if(page>=100)fail();
   const q=new URLSearchParams({q:"'"+folder+"' in parents and trashed=false",fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,appProperties)',pageSize:'100'});if(cursor)q.set('pageToken',cursor);
   const listed=await request(base+'?'+q);if(!listed.ok)fail();const data=await listed.json();
   if(data.incompleteSearch||!Array.isArray(data.files)||data.files.length>100)fail();
   for(const file of data.files){
    if(!/^[a-zA-Z0-9_-]{10,160}$/.test(file.id||'')||ids.has(file.id)||ids.size>=6000)fail();ids.add(file.id);
    if(file.mimeType==='application/vnd.google-apps.folder'){
     const i=folders.indexOf(file.id);if(folder!==root||i<0||file.name!=='partition_'+String(i).padStart(2,'0')||file.appProperties?.wybpBenchmarkRun!==runId)fail();partitionSet.add(file.id);
    }else{
     if(!/^[a-zA-Z0-9_.-]{1,180}$/.test(file.name||'')||file.appProperties?.wybpRecovery!=='1'||await indexLookup(folder,file.name)!==file.id)fail();files++;
    }
   }
   if(!data.nextPageToken)break;if(cursors.has(data.nextPageToken))fail();cursors.add(data.nextPageToken);cursor=data.nextPageToken;
  }
 }
 if(partitionSet.size!==16)fail();
 const removed=await request(base+'/'+root,{method:'DELETE'});if(removed.status!==204)fail();
 const absent=await request(base+'/'+root+'?fields=id');if(absent.status!==404)fail();await absent.body?.cancel();
 return {removed:true,folders:17,files,parentPreserved:true};
}
