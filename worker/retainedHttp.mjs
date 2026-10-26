import {withEnv} from 'cloudflare:workers';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {installedRetainedGrant,retainedHash,retainedVector,RETAINED_ORIGIN} from './retainedBenchmarkPolicy.mjs';
import {retainedMeter} from './retainedBenchmarkMeter.mjs';
import {encryptRecord,decryptRecord} from '../scripts/recovery-crypto.mjs';
const denied=(status=404)=>new Response(null,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const posts=new Set(['/cowries/wallet','/cowries/play','/cowries/complete','/cowries/projection','/cowries/recover','/cowries/clear','/questions/answer','/questions/image-answer','/questions/select','/questions/resume','/commerce/orders','/commerce/status','/commerce/confirmation','/commerce/stripe-webhook']);
export async function retainedHttp(request,env,ctx,application){
 let coordinator,parent,identity;
 try{
  const grant=installedRetainedGrant(env),url=new URL(request.url);
  if(url.origin!==RETAINED_ORIGIN||!['GET','HEAD','POST'].includes(request.method)||request.method==='POST'&&!posts.has(url.pathname)||/^\/(?:owner|callback|signin-with-chatgpt|signout-with-chatgpt|_retained)(?:\/|$)/.test(url.pathname))return denied();
  const token=env.WYBP_PRIVATE_ACCESS_TOKEN,supplied=request.headers.get('authorization')||'';
  if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{43,128}$/.test(token)||Buffer.byteLength(supplied)!==Buffer.byteLength('Bearer '+token)||!timingSafeEqual(Buffer.from(supplied),Buffer.from('Bearer '+token)))return denied(401);
  const at=request.headers.get('x-wybp-time')||'',signature=request.headers.get('x-wybp-signature')||'',upperText=request.headers.get('x-wybp-upper')||'';parent=request.headers.get('x-wybp-operation')||'';
  if(!/^\d{13}$/.test(at)||Math.abs(Date.now()-Number(at))>30000||!/^[a-f0-9]{64}$/.test(parent)||!/^[a-f0-9]{64}$/.test(signature)||typeof env.WYBP_RETAINED_CONTROLLER_SECRET!=='string'||env.WYBP_RETAINED_CONTROLLER_SECRET.length<43||upperText.length>3000)return denied(403);
  const length=Number(request.headers.get('content-length')||0);if(!Number.isSafeInteger(length)||length<0||length>65536)return denied(413);
  const parts=[];let size=0;const reader=request.body?.getReader();if(reader)try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>65536)throw Error();parts.push(Buffer.from(r.value));}}catch{await reader.cancel().catch(()=>{});return denied(413);}const body=Buffer.concat(parts);
  identity=retainedHash([request.method,url.href,body.toString('base64'),upperText]);
  const expected=createHmac('sha256',env.WYBP_RETAINED_CONTROLLER_SECRET).update([at,parent,identity].join('\n')).digest();if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return denied(403);
  const upper=retainedVector(JSON.parse(upperText));coordinator=env.RETAINED_COORDINATOR.getByName(grant.id);
  // Recovery never constructs a serving-source adapter or accepts a new game,
  // even from the signed synthetic controller. Count the denied arrival while
  // allowing the private recovery verifier to continue without a new stop.
  if(await coordinator.phase()==='recovery'){await coordinator.replayArrival(body.byteLength);return denied(503);}
  const admitted=await coordinator.reserve(parent,identity,upper);
  const key=Buffer.from(env.WYBP_BENCHMARK_KEY_BASE64||'','base64');if(key.length!==32)throw Error();
  if(!admitted.execute){const cached=await coordinator.response(parent);if(admitted.state!=='settled'||!cached)return denied(503);const r=decryptRecord(Buffer.from(cached,'base64'),key,'retained-http:'+parent);if(r.rereadRequired){await coordinator.replayArrival(body.byteLength);const response=denied(409);response.headers.set('x-wybp-receipt',r.receipt);return response;}const bytes=Buffer.from(r.body,'base64');await coordinator.replayArrival(body.byteLength+bytes.byteLength);return new Response(bytes,{status:r.status,headers:r.headers});}
  if(url.pathname==='/cowries/play'){const input=JSON.parse(body);await coordinator.started(retainedHash([input.anonymousSessionCredential,input.idempotencyKey]));}
  const meter=retainedMeter(upper);meter.add('external',1);meter.add('workerCpuMs',100);meter.add('transferBytes',body.byteLength);
  const authority=Object.fromEntries(['query','admit','transact','readFence','ready','publicSellerDetails','preparePurchaseConfirmation','checkPendingPurchaseConfirmation','purchaseConfirmation','recordPurchasePayment','cancelPurchaseConfirmation','deliverPurchaseConfirmation'].map(method=>[method,async(...args)=>{
   const started=Date.now();let r;try{r=await env.RETAINED_AUTHORITY.invoke(parent,meter.remaining(),method,args);}catch{meter.markUnknown();throw Error('retained_authority_unknown');}finally{meter.authorityTime(Date.now()-started);}
   if(r?.billingKnown!==true||r.failed){meter.markUnknown();throw Error('retained_authority_unknown');}meter.merge(r.usage);meter.mergeSizes(r.sizes);meter.mergeTiming(r.timing);return r.value;
  }]));
  const clean=new Headers(request.headers);for(const k of [...clean.keys()])if(k==='authorization'||k==='host'||k==='forwarded'||k.startsWith('x-forwarded-')||k.startsWith('x-nf-')||k.startsWith('x-wybp-')||k.startsWith('cf-')||k.startsWith('oai-'))clean.delete(k);
  const trusted=new Request(url.href,{method:request.method,headers:clean,...(body.byteLength?{body}:{}),redirect:'manual'}),runtime={...env,DB:meter.database(env.DB),AUTHORITY:authority,WYBP_AUTHORITY_ROLE:'production-app'};
  // Exercise the real private seller RPC, never mask it with an app-local copy.
  delete runtime.WYBP_PUBLIC_SELLER_DETAILS_JSON;
  const started=Date.now(),response=await withEnv(runtime,()=>application.fetch(trusted,runtime,ctx)),chunks=[];let bytes=0;const output=response.body?.getReader();if(output)try{for(;;){const r=await output.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>4000000)throw Error();chunks.push(Buffer.from(r.value));}}catch{await output.cancel().catch(()=>{});throw Error();}const raw=Buffer.concat(chunks);meter.add('transferBytes',raw.byteLength);
  const applicationMs=Date.now()-started,providerWaitMs=meter.timing().providerWaitMs,headers=new Headers(response.headers);headers.set('cache-control','private, no-store');headers.set('x-wybp-application-ms',String(applicationMs));headers.set('x-wybp-harness-provider-wait-ms',String(providerWaitMs));
  const usage=meter.receipt(),receipt=retainedHash([response.status,retainedHash(raw.toString('base64')),usage]);let completion=null;
  headers.set('x-wybp-receipt',receipt);
  const summary={status:response.status,body:raw.toString('base64'),headers:Object.fromEntries(headers)};let cache=encryptRecord(summary,key,'retained-http:'+parent).toString('base64');
  const staticRead=['GET','HEAD'].includes(request.method)&&/\.(?:js|css|svg|png|jpe?g|webp|ico|woff2?|webmanifest)$/i.test(url.pathname);
  if(staticRead||cache.length>120000){if(!['GET','HEAD'].includes(request.method))throw Error();cache=encryptRecord({rereadRequired:true,receipt},key,'retained-http:'+parent).toString('base64');}
  if(url.pathname==='/cowries/complete'&&response.status===201){const r=JSON.parse(raw);if(r.completed!==true||!/^[a-f0-9]{48}$/.test(r.resultSlug||''))throw Error();completion={id:retainedHash(JSON.parse(body).attemptId),receipt:retainedHash(r)};}
  const group=({'/cowries/wallet':'wallet','/cowries/play':'start','/questions/answer':'answer','/cowries/complete':'complete','/commerce/orders':'order','/commerce/stripe-webhook':'webhook','/commerce/confirmation':'confirmation'})[url.pathname]||(url.pathname.startsWith('/_next/')||url.pathname.startsWith('/assets/')?'asset':request.method==='GET'?'document':'other');
  await coordinator.settle(parent,identity,usage,receipt,cache,completion,meter.sizes(),{group,applicationMs,providerWaitMs,status:response.status});
  if(response.status>=500)await coordinator.stop();return new Response(raw,{status:response.status,headers});
 }catch{if(coordinator)await coordinator.stop().catch(()=>{});return denied(503);}
}
