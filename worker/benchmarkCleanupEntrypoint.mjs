import {WorkerEntrypoint} from 'cloudflare:workers';
import {benchmarkCleanupRuntime,benchmarkReconcileCommittedWriter,benchmarkAbortUncommittedWriter} from './benchmarkCleanupRuntime.mjs';
// Keep the existing class only for namespace retirement; its expired clock is
// never extended. This release exposes no measurement or provisioning method.
export {BenchmarkPacing} from './benchmarkPacing.mjs';
export class BenchmarkOperator extends WorkerEntrypoint {
 reconcileCommittedWriter(stopped,upper){return benchmarkReconcileCommittedWriter(this.env,stopped,upper);}
 abortUncommittedWriter(stopped,intentName,upper){return benchmarkAbortUncommittedWriter(this.env,stopped,intentName,upper);}
 cleanup(stopped,upper){return benchmarkCleanupRuntime(this.env,stopped,upper);}
 fetch(){return new Response(null,{status:404});}
}
export default {fetch(){return new Response(null,{status:404});}};
