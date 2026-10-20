import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {BENCHMARK_PHASES} from './approved-benchmark-budget.mjs';
const fail=()=>{throw Error('benchmark_carryover_unverified');};
// A new measurement clock never reopens the old stopped journal. Include every
// reservation, including unknown cleanup outcomes, from an immutable read-only source.
export async function stoppedBenchmarkCarryover(path){
 const before=await readFile(path),sourceSha256=createHash('sha256').update(before).digest('hex'),db=new DatabaseSync(path,{readOnly:true});
 try{
  if(db.prepare("SELECT COUNT(*) n FROM benchmark_sessions WHERE state!='stopped'").get().n)fail();
  const keys=Object.keys(BENCHMARK_PHASES.B.caps),used=Object.fromEntries(['A','B','C'].map(p=>[p,Object.fromEntries(keys.map(k=>[k,0]))]));
  const rows=db.prepare('SELECT id,state,used FROM benchmark_runs').all();if(!rows.length)fail();
  for(const row of rows){if(row.state!=='stopped')fail();const phase=row.id.split(':').at(-1),value=JSON.parse(row.used);if(!used[phase]||Object.keys(value).length!==keys.length)fail();for(const k of keys){if(!Number.isSafeInteger(value[k])||value[k]<0)fail();used[phase][k]=k==='storageBytes'?Math.max(used[phase][k],value[k]):used[phase][k]+value[k];}}
  // Prior carryover is already consumed too, if this is itself a later window.
  if(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='benchmark_allowance_carryover'").get())for(const row of db.prepare('SELECT phase,used FROM benchmark_allowance_carryover').all()){const value=JSON.parse(row.used);if(!used[row.phase])fail();for(const k of keys){if(!Number.isSafeInteger(value[k])||value[k]<0)fail();used[row.phase][k]=k==='storageBytes'?Math.max(used[row.phase][k],value[k]):used[row.phase][k]+value[k];}}
  if(!before.equals(await readFile(path)))fail();return {sourceSha256,used};
 }finally{db.close();}
}
