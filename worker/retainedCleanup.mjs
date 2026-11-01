import {verifyDriveRecordHeader} from '../scripts/drive-record-header.mjs';
import {RETAINED_PROPOSAL} from './retainedBenchmarkPolicy.mjs';
const fail=()=>{throw Error('retained_cleanup_scope');};
// Every object is authenticated before ANY deletion. The two lanes use the
// existing metered request path and global pacing, never an independent fetch.
export async function cleanupRetainedBatch({folder,folderIndex,folders,key}){
 if(!Number.isInteger(folderIndex)||folderIndex<0||folderIndex>16||!Array.isArray(folders)||folders.length!==17||folders[folderIndex]!==folder||!folder?.auditWindow||!folder.request)fail();
 const page=await folder.auditWindow(),files=[];
 if(!page||!Array.isArray(page.files)||page.files.length>RETAINED_PROPOSAL.cleanupPageSize||new Set(page.files.map(f=>f.id)).size!==page.files.length||page.cursor!==null&&(typeof page.cursor!=='string'||!page.cursor||page.cursor.length>4096))fail();
 for(const f of page.files){
  if(!f.parents?.includes(folder.folderId))fail();
  if(f.mimeType==='application/vnd.google-apps.folder'){if(folderIndex!==0||!folders.slice(1).some(c=>c.folderId===f.id))fail();continue;}
  if(f.mimeType!=='application/octet-stream'||!verifyDriveRecordHeader({key,folderId:folder.folderId,fileId:f.id,name:f.name},f.appProperties))fail();files.push(f);
 }
 let next=0,deleted=0,failed=false;
 const lane=async()=>{while(!failed&&next<files.length){const f=files[next++];try{const r=await folder.request('https://www.googleapis.com/drive/v3/files/'+f.id,{method:'DELETE'});if(!r.ok&&r.status!==404)fail();deleted++;}catch{failed=true;}}};
 await Promise.all(Array.from({length:RETAINED_PROPOSAL.cleanupConcurrency},lane));
 // Settle in-flight lanes before reporting ambiguity. The operator then keeps
 // the full parent reservation; another cleanup step must list afresh.
 if(failed)fail();return {deleted,complete:files.length===0&&!page.cursor};
}
