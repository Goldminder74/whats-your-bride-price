// Encrypted, bounded jobs in the existing isolated coordinator. A crash after a
// claim stops the run; an alarm never guesses whether an unknown effect happened.
import {retainedDayEntry} from './retainedGameSteps.mjs';
import {encryptRecord,decryptRecord} from '../scripts/recovery-crypto.mjs';
import {retainedHash,retainedVector} from './retainedBenchmarkPolicy.mjs';
const fail=()=>{throw Error('retained_job_stopped');};
export class RetainedJobs{
 constructor(db,key,ledger,{now=Date.now,cold=false}={}){
  this.db=db;this.key=key;this.ledger=ledger;this.now=now;
  db.exec("CREATE TABLE IF NOT EXISTS retained_jobs(id TEXT PRIMARY KEY,identity TEXT NOT NULL,payload TEXT,state TEXT NOT NULL,step INTEGER NOT NULL,due INTEGER NOT NULL,receipt TEXT,phase TEXT NOT NULL); CREATE INDEX IF NOT EXISTS retained_job_due ON retained_jobs(phase,state,due);");
  db.exec('CREATE TABLE IF NOT EXISTS retained_job_count(id INTEGER PRIMARY KEY,n INTEGER NOT NULL);INSERT INTO retained_job_count VALUES(1,0) ON CONFLICT(id) DO NOTHING;CREATE TABLE IF NOT EXISTS retained_job_plan(id INTEGER PRIMARY KEY,identity TEXT NOT NULL,payload TEXT NOT NULL,cursor INTEGER NOT NULL);');
  db.exec('CREATE INDEX IF NOT EXISTS retained_job_state ON retained_jobs(state);');
  if(cold&&db.prepare("SELECT id FROM retained_jobs WHERE state='running' LIMIT 1").get()){db.prepare("UPDATE retained_jobs SET state='uncertain' WHERE state='running'").run();ledger.stop();}
 }
 seal(id,v){return encryptRecord(v,this.key,'retained-job:'+id).toString('base64');}
 open(row){return decryptRecord(Buffer.from(row.payload,'base64'),this.key,'retained-job:'+row.id);}
 accept(definition){return this.ledger.transaction(()=>{
  const {id,flow,due,upper,maxSteps}=definition||{},state=this.ledger.row(),cleanup=flow==='cleanup-loop';
  if(!/^[a-f0-9]{64}$/.test(id||''))fail();const identity=retainedHash(definition),prior=this.db.prepare('SELECT * FROM retained_jobs WHERE id=?').get(id);
  if(prior){if(prior.identity!==identity)fail();return {accepted:true,replay:true,id,state:prior.state,receipt:prior.receipt};}
  if(!/^[a-f0-9]{64}$/.test(id||'')||!['game','incomplete','traffic','pressure','operator-loop','cleanup-loop'].includes(flow)||!Number.isSafeInteger(due)||due<this.now()||due>=state.deadline-(cleanup?0:16*3600000)||!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>100000||JSON.stringify(definition).length>60000||state.stopped&&!(cleanup&&state.phase==='cleanup'))fail();retainedVector(upper);
  if(flow==='pressure'&&(state.phase!=='setup'||!Number.isInteger(definition.shard)||definition.shard<0||definition.shard>15||!Number.isInteger(definition.count)||definition.count<1||definition.count>75000||definition.paddingBytes!==4500||maxSteps!==Math.ceil(definition.count/25)*2))fail();
  if(['game','incomplete'].includes(flow)&&(!['west','east','central','north','south'].includes(definition.region)||maxSteps!==(flow==='incomplete'?6:definition.recover===true?24:16)))fail();
  if(flow==='traffic'&&(!Number.isSafeInteger(definition.intervalMs)||definition.intervalMs<1||!['asset','document','image','abuse'].includes(definition.group)||typeof definition.path!=='string'||!definition.path.startsWith('/')||definition.path.startsWith('//')||definition.path.includes('?')||definition.path.includes('#')||definition.group==='abuse'&&(definition.path!=='/questions/resume'||JSON.stringify(definition.value)!=='{}')||definition.group==='image'&&definition.path!=='/questions/image-answer'||['asset','document'].includes(definition.group)&&definition.value!==undefined||definition.group!=='abuse'&&definition.expectedStatus!==200||definition.group==='abuse'&&definition.expectedStatus!==400))fail();
  if(cleanup&&(state.phase!=='cleanup'||definition.command?.kind!=='cleanup-batch'||definition.doneField!=='complete'))fail();
  if(flow==='operator-loop'&&(!definition.command||!/^(?:source|mirror|verify|recovery|custody|purge|retention)-/.test(definition.command.kind||'')||!['complete','imported','verified','caughtUp','once'].includes(definition.doneField)))fail();
  if(this.db.prepare('SELECT n FROM retained_job_count WHERE id=1').get().n>=10000||this.db.prepare("SELECT COUNT(*) n FROM retained_jobs WHERE state IN ('waiting','running')").get().n>=64)fail();
  this.db.prepare("INSERT INTO retained_jobs VALUES(?,?,?,'waiting',0,?,NULL,?)").run(id,identity,this.seal(id,{definition,state:null}),due,cleanup?'cleanup':'ordinary');this.db.prepare('UPDATE retained_job_count SET n=n+1 WHERE id=1').run();return {accepted:true,id,state:'waiting'};
 });}
 claim(){return this.ledger.transaction(()=>{
  const state=this.ledger.row(),cleanup=state.phase==='cleanup';if(state.stopped&&!cleanup||this.now()>=state.deadline-(cleanup?0:16*3600000))return [];
  const rows=this.db.prepare("SELECT * FROM retained_jobs WHERE phase=? AND state='waiting' AND due<=? ORDER BY due LIMIT 8").all(cleanup?'cleanup':'ordinary',this.now());
  for(const r of rows)this.db.prepare("UPDATE retained_jobs SET state='running' WHERE id=? AND state='waiting' AND step=?").run(r.id,r.step);
  return rows.map(r=>({id:r.id,step:r.step,...this.open(r)}));
 });}
 finish(job,outcome){return this.ledger.transaction(()=>{
  const row=this.db.prepare('SELECT * FROM retained_jobs WHERE id=?').get(job.id);if(!row||row.state!=='running'||row.step!==job.step)fail();
  if(outcome?.known!==true||!/^[a-f0-9]{64}$/.test(outcome.receipt||'')||!outcome.done&&job.step+1>=job.definition.maxSteps){this.db.prepare("UPDATE retained_jobs SET state='uncertain' WHERE id=?").run(job.id);this.ledger.stop();return;}
  const payload=outcome.done?null:this.seal(job.id,{definition:job.definition,state:outcome.state});if(payload&&payload.length>(job.definition.flow==='pressure'?600000:120000))fail();
  this.db.prepare('UPDATE retained_jobs SET state=?,step=?,due=?,payload=?,receipt=? WHERE id=?').run(outcome.done?'complete':'waiting',job.step+1,Math.max(this.now()+1,job.definition.due+(job.step+1)*(job.definition.intervalMs||0)),payload,outcome.receipt,job.id);
 });}
 next(){const r=this.ledger.row(),cleanup=r.phase==='cleanup';if(r.stopped&&!cleanup)return null;return this.db.prepare("SELECT MIN(due) n FROM retained_jobs WHERE phase=? AND state='waiting'").get(cleanup?'cleanup':'ordinary')?.n??null;}
 suspendOrdinary(){this.db.prepare("UPDATE retained_jobs SET state='suspended' WHERE phase='ordinary' AND state='waiting'").run();this.db.prepare("UPDATE retained_jobs SET state='uncertain' WHERE phase='ordinary' AND state='running'").run();}
 plan(definition){
  const state=this.ledger.row();if(state.stopped||state.phase!=='measure'||definition?.startsAt!==state.measure_at||definition.startsAt<this.now()||definition.completed!==5000||definition.peakHour!==500||!definition.upper)fail();retainedVector(definition.upper);
  const prior=this.db.prepare('SELECT identity FROM retained_job_plan WHERE id=1').get(),identity=retainedHash(definition);if(prior){if(prior.identity!==identity)fail();return {accepted:true,replay:true};}
  this.db.prepare('INSERT INTO retained_job_plan VALUES(1,?,?,0)').run(identity,this.seal('day-plan',definition));return {accepted:true};
 }
 fill(){
  const r=this.db.prepare('SELECT * FROM retained_job_plan WHERE id=1').get();if(!r||this.ledger.row().stopped)return;
  const d=this.open({id:'day-plan',payload:r.payload});let cursor=r.cursor,available=64-this.db.prepare("SELECT COUNT(*) n FROM retained_jobs WHERE state IN ('waiting','running')").get().n;
  for(let i=0;i<Math.min(8,available)&&cursor<(d.incomplete===2150?7150:5000);i++,cursor++){
   const entry=retainedDayEntry(cursor,d);
   this.accept({id:retainedHash(['day-plan',r.identity,cursor]),...entry,retries:true,region:['west','east','central','north','south'][cursor%5],due:Math.max(this.now(),d.startsAt+entry.offsetMs),upper:d.upper});
  }
  this.db.prepare('UPDATE retained_job_plan SET cursor=? WHERE id=1').run(cursor);
 }
 status(id){const r=this.db.prepare('SELECT id,state,step,receipt FROM retained_jobs WHERE id=?').get(id);if(!r)fail();return {...r};}
}
