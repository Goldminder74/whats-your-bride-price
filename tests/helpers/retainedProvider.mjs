import assert from 'node:assert/strict';
export function syntheticRetainedProvider(bindings){
 const files=new Map();let dropped=false,delay=0,next=0,properties={},requests=0,active=0,peak=0,deleteActive=0,deletePeak=0,deleteRequests=0;const starts=[],listSizes=[];
 return {files,dropNext:()=>{dropped=true;},setDelay:ms=>{delay=ms;},stats:()=>({requests,peak,starts:[...starts],deleteRequests,deletePeak,listSizes:[...listSizes]}),async fetch(request){
  requests++;active++;peak=Math.max(peak,active);starts.push(Date.now());const isDelete=request.method==='DELETE';if(isDelete){deleteRequests++;deleteActive++;deletePeak=Math.max(deletePeak,deleteActive);}
  try{
   if(delay)await new Promise(r=>setTimeout(r,delay));if(dropped){dropped=false;throw Error('synthetic transport outcome unknown');}const url=new URL(request.url);
   if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'synthetic-access',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'});
   assert.equal(url.hostname,'www.googleapis.com');assert.equal(request.headers.get('authorization'),'Bearer synthetic-access');
   if(url.pathname.endsWith('/generateIds'))return Response.json({ids:Array.from({length:Number(url.searchParams.get('count')||1)},()=> 'retained_synthetic_file_'+next++)});
   if(url.pathname.startsWith('/upload/')){
    const bytes=Buffer.from(await request.arrayBuffer()),metadata=JSON.parse(bytes.toString().split('\r\n\r\n')[1].split('\r\n--')[0]),marker=Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),start=bytes.indexOf(marker)+marker.length,end=bytes.lastIndexOf(Buffer.from('\r\n--'));
    if(files.has(metadata.id))return new Response(null,{status:409});files.set(metadata.id,{...metadata,bytes:bytes.subarray(start,end)});return Response.json({id:metadata.id});
   }
   if(url.pathname==='/drive/v3/files'){
    const parent=(url.searchParams.get('q')||'').match(/'([^']+)' in parents/)?.[1],size=Number(url.searchParams.get('pageSize')||25),offset=Number(url.searchParams.get('pageToken')||0),all=[...files.values()].filter(v=>!parent||v.parents.includes(parent)).sort((a,b)=>a.id.localeCompare(b.id));
    listSizes.push(size);return Response.json({files:all.slice(offset,offset+size).map(file=>({id:file.id,name:file.name,parents:file.parents,appProperties:file.appProperties,mimeType:'application/octet-stream',trashed:false})),incompleteSearch:false,...(offset+size<all.length?{nextPageToken:String(offset+size)}:{})});
   }
   const id=url.pathname.split('/').at(-1);
   if(id===bindings.WYBP_DRIVE_FOLDER_ID){if(request.method==='PATCH'){properties=(await request.json()).appProperties;return Response.json({id});}return Response.json({id,mimeType:'application/vnd.google-apps.folder',trashed:false,appProperties:properties});}
   if(JSON.parse(bindings.WYBP_DRIVE_SHARD_FOLDER_IDS).includes(id))return Response.json({id,mimeType:'application/vnd.google-apps.folder',parents:[bindings.WYBP_DRIVE_FOLDER_ID],trashed:false});
   const file=files.get(id);if(!file)return new Response(null,{status:404});
   if(request.method==='DELETE'){files.delete(id);return new Response(null,{status:204});}
   if(request.method==='PATCH'){const change=await request.json();file.appProperties={...file.appProperties,...change.appProperties};return Response.json({id});}
   return url.searchParams.has('alt')?new Response(file.bytes):Response.json({id,name:file.name,parents:file.parents,trashed:false,appProperties:file.appProperties,mimeType:'application/octet-stream'});
  }finally{active--;if(isDelete)deleteActive--;}
 }};
}
