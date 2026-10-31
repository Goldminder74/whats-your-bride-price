import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {BenchmarkPacingCore,BenchmarkPacingSqlStore} from '../../worker/benchmarkPacingCore.mjs';
function store(db=new DatabaseSync(':memory:')){
 // Local SQLite stand-in only; hosted adapters require provider cursor metadata.
 const sql={get databaseSize(){return db.prepare('PRAGMA page_count').get().page_count*4096;},exec(text,...args){const s=db.prepare(text);let rows=[],writes=0;if(s.columns().length)rows=s.all(...args);else writes=s.run(...args).changes;return {toArray:()=>rows,rowsRead:rows.length,rowsWritten:writes};}};
 return {db,adapter:new BenchmarkPacingSqlStore(sql,work=>{db.exec('BEGIN');try{const r=work();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}})};
}
const packet=i=>({id:i.toString(16).padStart(64,'0'),phase:'B',url:'https://wybp-capacity-private-r002.netlify.app/game',method:'POST',headers:{authorization:'private-never-persist'},body:new TextEncoder().encode('private-body-never-persist')});

test('coordinator readback exposes bounded counters and immutable deadline without request data',async()=>{
 const s=store();try{
  const core=new BenchmarkPacingCore({store:s.adapter,now:()=>1000,request:async()=>new Response('private-body')});
  await core.dispatch(packet(1));const result=s.adapter.readback();
  assert.equal(result.pending,0);assert.equal(result.counts.B,1);assert.equal(result.deadlineAt,1000+6*3600000);assert.equal(result.stopped,false);assert.ok(result.counters.reads>0);assert.equal(JSON.stringify(result).includes('private'),false);
 }finally{s.db.close();}
});
test('actual requests overlap while their starts remain globally paced; response bodies are never stored',async()=>{
 const s=store();let now=1000;const starts=[],pending=[];
 const core=new BenchmarkPacingCore({store:s.adapter,now:()=>now,pause:async ms=>{now+=ms;},request:()=>{starts.push(now);return new Promise(resolve=>pending.push(resolve));}});
 try{
  const tasks=[1,2,3].map(i=>core.dispatch(packet(i)));for(let i=0;i<20;i++)await Promise.resolve();
  assert.equal(pending.length,3);assert.deepEqual(starts,[1000,1100,1200]);assert.equal(core.active,3);
  for(const resolve of pending)resolve(new Response('private-response'));
  const result=await Promise.all(tasks);assert.ok(result.every(r=>r.billingKnown&&r.counters.reads>0&&r.timing.fetchMs>=0));
  const rows=JSON.stringify(s.db.prepare('SELECT * FROM pacing_requests').all());assert.equal(rows.includes('private'),false);assert.equal(s.db.prepare('SELECT b FROM pacing_state').get().b,3);
  await assert.rejects(core.dispatch(packet(1)),/pacing_unavailable/);assert.equal(starts.length,3);
 }finally{s.db.close();}
});
test('crash leaves pending I/O charged and replacement fails closed without clock/counter reset',async()=>{
 const s=store();let now=1000;const first=new BenchmarkPacingCore({store:s.adapter,now:()=>now,carry:{B:419,C:0},request:async()=>{throw Error('simulated lost acknowledgement');}});
 try{
  await assert.rejects(first.dispatch(packet(4)));const original=s.db.prepare('SELECT * FROM pacing_state').get();assert.equal(original.b,420);
  now+=500;const replacement=new BenchmarkPacingCore({store:new BenchmarkPacingSqlStore(s.adapter.sql,s.adapter.transaction),now:()=>now,request:async()=>{assert.fail('must not replay');}});
  await assert.rejects(replacement.dispatch(packet(4)));const row=s.db.prepare('SELECT * FROM pacing_state').get();assert.equal(row.started,original.started);assert.equal(row.until_at,original.until_at);assert.equal(row.b,420);assert.equal(row.stopped,1);
 }finally{s.db.close();}
});
test('stop, invalid destinations and cumulative allowance prevent new I/O',async()=>{
 const s=store();let calls=0;const core=new BenchmarkPacingCore({store:s.adapter,carry:{B:63999,C:0},request:async()=>{calls++;return new Response('ok');}});
 try{await assert.rejects(core.dispatch({...packet(6),url:'https://example.com/'}));await assert.rejects(core.dispatch(packet(7)));assert.equal(calls,0);assert.equal(s.db.prepare('SELECT b FROM pacing_state').get().b,63999);}finally{s.db.close();}
});
