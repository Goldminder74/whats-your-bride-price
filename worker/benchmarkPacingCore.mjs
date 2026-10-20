import {createHash} from 'node:crypto';
const fail=()=>{throw Error('benchmark_pacing_unavailable');};
const hash=v=>createHash('sha256').update(v).digest('hex');
export class BenchmarkPacingCore {
 constructor({store,request=(...args)=>globalThis.fetch(...args),now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms)),carry={B:0,C:0}}){
  if(!carry||Object.keys(carry).sort().join(',')!=='B,C'||Object.values(carry).some(n=>!Number.isSafeInteger(n)||n<0)||carry.B+carry.C>=150000)fail();
  this.store=store;this.request=request;this.now=now;this.pause=pause;this.gate=Promise.resolve();this.active=0;this.queued=0;
  store.initialise(now(),carry); // A replacement instance rejects unresolved I/O.
 }
 async dispatch(packet){
  if(!packet||!['B','C'].includes(packet.phase)||!/^[a-f0-9]{64}$/.test(packet.id||'')||typeof packet.url!=='string'||!['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(packet.method))fail();
  const url=new URL(packet.url),client=url.origin==='https://wybp-capacity-private-r002.netlify.app';
  if(url.protocol!=='https:'||url.username||url.password||url.hash||!(client||url.hostname==='oauth2.googleapis.com'&&url.pathname==='/token'||url.hostname==='www.googleapis.com'&&/^\/(?:upload\/)?drive\/v3\//.test(url.pathname)||/^wybp-capacity-worker-r002\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)&&url.pathname==='/'&&packet.method==='GET'))fail();
  const body=packet.body==null?null:Buffer.from(packet.body);if(body&&body.length>4000000)fail();
  const identity=hash(JSON.stringify([packet.phase,packet.url,packet.method,packet.headers||{},body?.toString('base64')||'']));
  if(this.queued>=64||this.active>=16)fail();this.queued++;
  const received=this.now(),stats={reads:0,writes:0};let issued=false;
  const grant=this.gate.then(async()=>{
   const state=this.store.state(stats);if(state.stopped||this.now()>=state.until_at||this.now()<state.started)fail();
   const delay=state.next_at-this.now();if(delay>0)await this.pause(delay);
   const at=this.now();this.store.admit(packet.id,identity,packet.phase,at,stats);
   this.queued--;this.active++;issued=true;
   // Start fetch inside the short pacing gate; release it BEFORE awaiting I/O.
   const response=this.request(packet.url,{method:packet.method,headers:packet.headers,body,redirect:'manual',signal:AbortSignal.timeout(client?30000:15000)});
   return {response,at};
  });
  this.gate=grant.then(()=>{},()=>{});
  try{
   const {response:pending,at}=await grant,response=await pending,parts=[];let length=0;
   if(response.body){const reader=response.body.getReader();try{for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>4000000)fail();parts.push(item.value);}}catch{await reader.cancel().catch(()=>{});fail();}}
   const bytes=Buffer.concat(parts.map(p=>Buffer.from(p))),fetchMs=Math.max(0,this.now()-at);
   this.store.settle(packet.id,identity,response.status,hash(bytes),stats);
   return {status:response.status,headers:Object.fromEntries([...response.headers].filter(([name])=>['content-type','cache-control','www-authenticate'].includes(name))),body:new Uint8Array(bytes),timing:{pacingWaitMs:at-received,fetchMs},counters:{...stats,storageBytes:this.store.size()},billingKnown:true};
  }catch{this.store.stop();fail();}
  finally{if(issued)this.active--;else this.queued--;}
 }
}

export class BenchmarkPacingSqlStore {
 constructor(sql,transaction){this.sql=sql;this.transaction=transaction;this.boot={reads:0,writes:0};}
 exec(stats,sql,...args){const cursor=this.sql.exec(sql,...args),rows=cursor.toArray();if(!Number.isSafeInteger(cursor.rowsRead)||!Number.isSafeInteger(cursor.rowsWritten))fail();stats.reads+=cursor.rowsRead;stats.writes+=cursor.rowsWritten;return rows;}
 initialise(at,carry){
  const s=this.boot;
  this.transaction(()=>{
   this.exec(s,'CREATE TABLE IF NOT EXISTS pacing_state(id INTEGER PRIMARY KEY,started INTEGER,until_at INTEGER,next_at INTEGER,b INTEGER,c INTEGER,stopped INTEGER)');
   this.exec(s,'CREATE TABLE IF NOT EXISTS pacing_requests(id TEXT PRIMARY KEY,identity TEXT,state TEXT,status INTEGER,receipt TEXT)');
   this.exec(s,'INSERT INTO pacing_state VALUES(1,?1,?2,0,?3,?4,0) ON CONFLICT(id) DO NOTHING',at,at+6*3600000,carry.B||0,carry.C||0);
   if(this.exec(s,"SELECT id FROM pacing_requests WHERE state='pending' LIMIT 1").length)this.exec(s,'UPDATE pacing_state SET stopped=1 WHERE id=1');
  });
 }
 state(s){s.reads+=this.boot.reads;s.writes+=this.boot.writes;this.boot={reads:0,writes:0};return this.exec(s,'SELECT * FROM pacing_state WHERE id=1')[0];}
 admit(id,identity,phase,at,s){this.transaction(()=>{
  const state=this.state(s),count=phase==='B'?state.b:state.c,cap=phase==='B'?80000:100000;
  if(state.stopped||at<state.next_at||at>=state.until_at||state.b+state.c>=150000||count+1>=cap*.8||this.size()>=64000000)fail();
  this.exec(s,"INSERT INTO pacing_requests(id,identity,state) VALUES(?1,?2,'pending')",id,identity);
  this.exec(s,'UPDATE pacing_state SET next_at=?1,b=b+?2,c=c+?3 WHERE id=1',at+100,phase==='B'?1:0,phase==='C'?1:0);
 });}
 settle(id,identity,status,receipt,s){this.transaction(()=>{const row=this.exec(s,'SELECT identity,state FROM pacing_requests WHERE id=?1',id)[0];if(!row||row.identity!==identity||row.state!=='pending')fail();this.exec(s,"UPDATE pacing_requests SET state='settled',status=?2,receipt=?3 WHERE id=?1",id,status,receipt);});}
 stop(){this.exec({reads:0,writes:0},'UPDATE pacing_state SET stopped=1 WHERE id=1');}
 readback(){const counters={reads:0,writes:0},state=this.state(counters),pending=this.exec(counters,"SELECT COUNT(*) n FROM pacing_requests WHERE state='pending'")[0].n;return {startedAt:state.started,deadlineAt:state.until_at,nextAt:state.next_at,stopped:!!state.stopped,pending,counts:{B:state.b,C:state.c},counters:{...counters,storageBytes:this.size()}};}
 size(){const n=this.sql.databaseSize;if(!Number.isSafeInteger(n)||n<0)fail();return n;}
}
