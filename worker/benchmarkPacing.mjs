import {DurableObject} from 'cloudflare:workers';
import {BenchmarkPacingCore,BenchmarkPacingSqlStore} from './benchmarkPacingCore.mjs';
export class BenchmarkPacing extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);
  if(env.WYBP_AUTHORITY_ROLE!=='benchmark-ops'||env.WYBP_WORKER_NAME!=='wybp-capacity-worker-r002'||['WYBP_OPERATIONS_ENABLED','WYBP_TEST_WEBHOOK_ENABLED','WYBP_TEST_RETENTION_ENABLED'].some(k=>env[k]!=='false'))throw Error('benchmark_pacing_scope');
  const carry=JSON.parse(env.WYBP_BENCHMARK_PACING_CARRY||'{"B":0,"C":0}');
  this.core=new BenchmarkPacingCore({store:new BenchmarkPacingSqlStore(ctx.storage.sql,work=>ctx.storage.transactionSync(work)),carry});
 }
 dispatch(packet){return this.core.dispatch(packet);}
 readback(){return this.core.store.readback();}
 fetch(){return new Response(null,{status:404});}
}
