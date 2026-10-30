// Offline footprint measurement only. No bindings, token, grant installation or
// hosted requests. This is a schema/sample-record projection, not DO telemetry.
import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';
import {RetainedBenchmarkLedger} from '../../worker/retainedBenchmarkLedger.mjs';
import {syntheticRetainedGrant} from './retainedBenchmark.mjs';import {retainedZero} from '../../worker/retainedBenchmarkPolicy.mjs';
export function retainedRecorderFootprint(count=10000){
 if(!Number.isSafeInteger(count)||count<100||count>10000)throw Error('local_recorder_scope');
 const db=new DatabaseSync(':memory:'),at=Date.now(),hash=v=>createHash('sha256').update(v).digest('hex'),ledger=new RetainedBenchmarkLedger(db,syntheticRetainedGrant(at).value,{now:()=>at});
 db.exec('CREATE TABLE retained_io(id TEXT PRIMARY KEY,parent TEXT NOT NULL,identity TEXT NOT NULL,state TEXT NOT NULL,status INTEGER,receipt TEXT);CREATE INDEX retained_io_parent ON retained_io(parent);CREATE TABLE retained_responses(id TEXT PRIMARY KEY,body TEXT NOT NULL);');
 const io=db.prepare("INSERT INTO retained_io VALUES(?,?,?,'settled',200,?)"),response=db.prepare('INSERT INTO retained_responses VALUES(?,?)'),upper={...retainedZero(),external:100,internal:100,writes:1000,reads:100000,storageBytes:8000000000,transferBytes:4000000,driveObjects:1,driveBytes:3500000,workerCpuMs:1000},usage={...retainedZero(),external:3,internal:1,writes:9,reads:6,storageBytes:3047948288,transferBytes:2000,driveObjects:1,driveBytes:700,workerCpuMs:100};
 const bytes=()=>Number(db.prepare('PRAGMA page_count').get().page_count)*Number(db.prepare('PRAGMA page_size').get().page_size),before=bytes();
 try{
  const pending=hash('unknown-parent');ledger.reserve(pending,pending,upper);db.prepare("INSERT INTO retained_io VALUES(?,?,?,'pending',NULL,NULL)").run(hash('unknown-io'),pending,hash('unknown-identity'));
  for(let i=0;i<count;i++){const id=hash('parent'+i),identity=hash('identity'+i),receipt=hash('receipt'+i);ledger.reserve(id,identity,upper);for(let j=0;j<3;j++)io.run(hash(i+':'+j),id,hash('io'+i+':'+j),hash('bytes'+i+':'+j));ledger.settle(id,identity,usage,receipt);response.run(id,JSON.stringify({bulkPut:true,receipt}));db.prepare("DELETE FROM retained_io WHERE parent=? AND state='settled'").run(id);}
  const size=bytes();return {localOnly:true,parents:count,bytes:size,bytesPerParent:(size-before)/count,projected1200000Parents:(size-before)/count*1200000,settledIoRows:db.prepare("SELECT COUNT(*) n FROM retained_io WHERE state='settled'").get().n,pendingIoRows:db.prepare("SELECT COUNT(*) n FROM retained_io WHERE state='pending'").get().n,pendingParentReservations:ledger.readback().pending,qualification:'Real SQLite sample including indexes and compact bulk cache. Projection excludes nonbulk/controller/HTTP history, cleanup and hosted-specific layout; preflight must add these and margin, while actual storage guards remain enforced.'};
 }finally{db.close();}
}
