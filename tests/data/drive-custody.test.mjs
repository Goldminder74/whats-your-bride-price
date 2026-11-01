import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveCustody } from '../../scripts/drive-custody.mjs';
import { recoveryHash } from '../../scripts/recovery-crypto.mjs';
import { PartitionedDriveCustody } from '../../scripts/partitioned-drive-custody.mjs';
function fixture() {
 const ids=new Map(),files=new Map();let uploads=0,lose=false;
 const index={async get(n){return ids.get(n);},async reserve(n,id){if(!ids.has(n))ids.set(n,id);return ids.get(n);}};
 const fetcher=async(url,options)=>{
  assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer synthetic-token');
  if(url.includes('generateIds'))return Response.json({ids:['synthetic_file_001']});
  if(url.includes('/upload/')){uploads++;const b=Buffer.from(options.body),text=b.toString(),metadata=JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]);
   if(files.has(metadata.id))return new Response(null,{status:409});
   const start=b.indexOf(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'))+Buffer.byteLength('Content-Type: application/octet-stream\r\n\r\n');
   const end=b.lastIndexOf(Buffer.from('\r\n--'));files.set(metadata.id,{name:metadata.name,bytes:b.subarray(start,end)});
   if(lose){lose=false;throw Error('sensitive-provider-message');}return Response.json({id:metadata.id});}
  if(url.includes('alt=media')){const file=files.get(url.split('/files/')[1].split('?')[0]);return file?new Response(file.bytes):new Response(null,{status:404});}
  return Response.json({files:[...files].map(([id,f])=>({id,name:f.name}))});
 };
 const config={folderId:'synthetic_folder_001',accessToken:async()=> 'synthetic-token',index,fetcher};
 return {config,files,ids,get uploads(){return uploads;},loseNext(){lose=true;}};
}
test('Drive commit marker retries after a lost metadata response without another data upload or identity/clock change',async()=>{
 const f=fixture(),name='op_1790000000000_'+'a'.repeat(32)+'.intent',proof='b'.repeat(64);let metadata,patches=0,lose=true;
 const fetcher=async(url,options)=>{
  if(url.includes('fields=id,name,parents,trashed,appProperties'))return Response.json(metadata);
  if(options.method==='PATCH'){patches++;metadata.appProperties={...metadata.appProperties,...JSON.parse(options.body).appProperties};if(lose){lose=false;throw Error('synthetic_lost_ack');}return Response.json({id:metadata.id});}
  return f.config.fetcher(url,options);
 };
 const c=new DriveCustody({...f.config,fetcher});await c.put(name,Buffer.from('encrypted synthetic intent'));
 metadata={id:f.ids.get(name),name,parents:[f.config.folderId],trashed:false,appProperties:{wybpRecovery:'1'}};
 await assert.rejects(c.markCommitted(name,proof),/drive_transport/);await new DriveCustody({...f.config,fetcher}).markCommitted(name,proof);
 assert.equal(await c.readCommit(name),proof);assert.equal(patches,1);assert.equal(f.uploads,1);assert.equal(f.files.size,1);assert.equal(f.ids.get(name),metadata.id);
 await assert.rejects(c.markCommitted(name,'c'.repeat(64)),/drive_commit_conflict/);
 metadata.parents=['outside_folder_001'];await assert.rejects(c.markCommitted(name,proof),/drive_commit_scope/);
});

test('partitioned custody preserves legacy files, deterministic IDs, and resumable pinned lost-index recovery',async()=>{
 const children=Array.from({length:17},(_,i)=>{const f=fixture();f.config.folderId='synthetic_folder_'+String(i).padStart(3,'0');const original=f.config.fetcher;
  f.config.fetcher=async(url,options)=>{if(url.includes('?fields=id,name,parents,trashed')){const id=url.split('/files/')[1].split('?')[0],file=f.files.get(id);return Response.json({id,name:file?.name,parents:[f.config.folderId],trashed:false});}return original(url,options);};
  const c=new DriveCustody(f.config);c.index.recoveryRecord=async()=>({createdAt:1,expiresAt:2592000001});return {f,c};});
 const custody=new PartitionedDriveCustody(children[0].c,children.slice(1).map(x=>x.c),{verifyFolder:async(id,parent)=>children.slice(1).some(x=>x.c.folderId===id)&&parent===children[0].c.folderId});
 await children[0].c.put('legacy.intent',Buffer.from('legacy'));
 await custody.put('new.intent',Buffer.from('new'));await custody.put('new.intent',Buffer.from('new'));
 assert.equal((await custody.get('legacy.intent')).toString(),'legacy');
 const inventory=await custody.inventoryReceipt();assert.equal(inventory.files.length,2);assert.equal(inventory.files.find(f=>f.name==='legacy.intent').folderId,children[0].c.folderId);
 const target=children.find(x=>x.c===custody.target('new.intent'));assert.equal(target.f.uploads,1);
 for(const child of children)child.f.ids.clear();
 await assert.rejects(custody.recoverIndex(inventory.files,inventory.sha256,()=>{throw Error('interrupted');}),/interrupted/);
 assert.equal(await custody.recoverIndex(inventory.files,inventory.sha256),2);
 assert.equal((await custody.get('new.intent')).toString(),'new');
 const altered=inventory.files.map(file=>({...file,folderId:'outside_folder_001'}));
 await assert.rejects(custody.recoverIndex(altered,recoveryHash(Buffer.from(JSON.stringify(altered)))),/recovery_scope/);
 await assert.rejects(custody.list({maxPages:1}),/inventory_capacity/);
 const blocked=new PartitionedDriveCustody(children[0].c,children.slice(1).map(x=>x.c),{verifyFolder:async()=>false});
 await assert.rejects(blocked.put('blocked.intent',Buffer.from('must not upload')),/partition_scope/);
});

test('bounded inventory cannot silently return a truncated result',async()=>{
 const f=fixture();let reads=0;
 const c=new DriveCustody({...f.config,pageSize:1,fetcher:async()=>{reads++;return Response.json({files:[{id:'synthetic_file_001',name:'one.intent'}],nextPageToken:'next'});}});
 f.ids.set('one.intent','synthetic_file_001');
 await assert.rejects(c.list({maxPages:1,maxFiles:2}),/inventory_capacity/);assert.equal(reads,1);
 reads=0;await assert.rejects(c.list({maxPages:2,maxFiles:1}),/inventory_capacity/);assert.equal(reads,2);
});

test('Drive redirects fail closed without forwarding credentials',async()=>{
 let calls=0;const c=new DriveCustody({folderId:'synthetic_folder_001',accessToken:async()=> 'synthetic-token',index:{get:async()=> 'synthetic_file_001',reserve:async()=> 'synthetic_file_001'},fetcher:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.match(url,/^https:\/\/www.googleapis.com\//);return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/'}});}});
 await assert.rejects(c.get('one.intent'),/^Error: drive_download$/);assert.equal(calls,1);
});
test('uncertain upload resumes across process replacement using the durable reserved ID',async()=>{
 const f=fixture(),bytes=Buffer.from('encrypted-synthetic');f.loseNext();
 await assert.rejects(new DriveCustody(f.config).put('one.intent',bytes),/^Error: drive_transport$/);
 const c=new DriveCustody(f.config);assert.equal(await c.put('one.intent',bytes),recoveryHash(bytes));
 assert.equal(f.uploads,1);assert.equal(f.files.size,1);assert.deepEqual(await c.list(),['one.intent']);
 await assert.rejects(c.put('one.intent',Buffer.from('different')),/custody_conflict/);
});
test('fresh IDs avoid the redundant missing-file read; reservation races and 409 conflicts still verify immutable bytes',async()=>{
 const f=fixture(),bytes=Buffer.from('synthetic immutable bytes');let reads=0;
 const original=f.config.fetcher,fetcher=async(url,options)=>{if(url.includes('alt=media'))reads++;return original(url,options);};
 await new DriveCustody({...f.config,fetcher}).put('one.intent',bytes);assert.equal(reads,1);assert.equal(f.uploads,1);
 // Two writers both read an empty index before either reserves. The loser must
 // read the winning ID; even a provider returning 409 must not bless new bytes.
 const g=fixture();g.files.set('synthetic_file_001',{name:'race.intent',bytes});
 await assert.rejects(new DriveCustody(g.config).put('race.intent',Buffer.from('different')),/custody_conflict/);assert.equal(g.uploads,1);
 const h=fixture();h.files.set('synthetic_winning_id',{name:'race.intent',bytes});
 const race={...h.config,index:{get:async()=>h.ids.get('race.intent'),reserve:async()=>{h.ids.set('race.intent','synthetic_winning_id');return 'synthetic_winning_id';}}};
 assert.equal(await new DriveCustody(race).put('race.intent',bytes),recoveryHash(bytes));assert.equal(h.uploads,0);
});
test('readback corruption and incomplete inventory fail closed',async()=>{
 const f=fixture(),c=new DriveCustody(f.config);await c.put('one.intent',Buffer.from('encrypted'));
 f.files.get('synthetic_file_001').bytes=Buffer.from('tampered');await assert.rejects(c.put('one.intent',Buffer.from('encrypted')),/custody_conflict/);
 const other=new DriveCustody({...f.config,fetcher:async()=>Response.json({incompleteSearch:true,files:[]})});await assert.rejects(other.list(),/drive_inventory_incomplete/);
});
test('bounded pre-reservation persists winning IDs; create-only POST never overwrites a conflict or skips download verification',async()=>{
 const f=fixture(),clocks={createdAt:1,expiresAt:2592000001};let allocations=0,reads=0;const fetcher=async(url,o)=>{if(url.includes('generateIds'))allocations++;if(url.includes('alt=media'))reads++;return f.config.fetcher(url,o);};
 const index={...f.config.index,async recoverReserve(n,id){return f.config.index.reserve(n,id);}},c=new DriveCustody({...f.config,index,fetcher});
 assert.deepEqual(await c.reserveFiles([{name:'stock.enc',clocks}]),[{name:'stock.enc',id:'synthetic_file_001'}]);assert.equal(allocations,1);
 await c.reserveFiles([{name:'stock.enc',clocks}]);assert.equal(allocations,1);
 const bytes=Buffer.from('synthetic verified archive');await c.put('stock.enc',bytes,clocks,{createOnly:true});assert.equal(reads,1);
 await new DriveCustody({...f.config,index,fetcher}).put('stock.enc',bytes,clocks,{createOnly:true});assert.equal(f.files.size,1);assert.equal(reads,2);
 await assert.rejects(c.put('stock.enc',Buffer.from('different'),clocks,{createOnly:true}),/custody_conflict/);assert.deepEqual(f.files.get('synthetic_file_001').bytes,bytes);
 await assert.rejects(c.reserveFiles(Array.from({length:26},(_,i)=>({name:'stock'+i,clocks}))),/reservation_bounds/);
});
test('missing identity, oversized pages and unsafe names reject before upload',async()=>{
 assert.throws(()=>new DriveCustody({}),/configuration/);const f=fixture(),c=new DriveCustody(f.config);
 await assert.rejects(c.put('../secret',Buffer.from('x')),/custody_name/);
 await assert.rejects(c.put('large.enc',Buffer.alloc(4*1024*1024+1)),/drive_file_bounds/);assert.equal(f.uploads,0);
});

test('inventory follows every page and rejects pagination cycles',async()=>{
 const f=fixture();f.ids.set('one.intent','synthetic_file_001');f.ids.set('two.intent','synthetic_file_002');let calls=0;
 const c=new DriveCustody({...f.config,fetcher:async url=>{calls++;return url.includes('pageToken=next')?Response.json({files:[{id:'synthetic_file_002',name:'two.intent'}]}):Response.json({nextPageToken:'next',files:[{id:'synthetic_file_001',name:'one.intent'}]});}});
 assert.deepEqual(await c.list(),['one.intent','two.intent']);assert.equal(calls,2);
 const loop=new DriveCustody({...f.config,fetcher:async()=>Response.json({nextPageToken:'same',files:[]})});await assert.rejects(loop.list(),/drive_inventory_loop/);
});
