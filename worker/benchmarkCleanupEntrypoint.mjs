import {WorkerEntrypoint} from 'cloudflare:workers';
import {benchmarkCleanupRuntime} from './benchmarkCleanupRuntime.mjs';
// Keep the existing class only for namespace retirement; its expired clock is
// never extended. This release exposes no measurement or provisioning method.
export {BenchmarkPacing} from './benchmarkPacing.mjs';
export class BenchmarkOperator extends WorkerEntrypoint {
 cleanup(stopped,upper){return benchmarkCleanupRuntime(this.env,stopped,upper);}
 fetch(){return new Response(null,{status:404});}
}
export default {fetch(){return new Response(null,{status:404});}};
