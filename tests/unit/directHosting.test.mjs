import test from 'node:test';import assert from 'node:assert/strict';
import {directIngress} from '../../worker/directIngress.ts';
import {validateHostingOrigin} from '../../app/hostingOrigin.ts';
import {productionBuildReadiness,productionGates} from '../../app/productionReadiness.ts';
import {defaultFeatureFlags} from '../../app/featureFlags.ts';
const hosting={platform:'cloudflare-direct',environment:'test',origin:'https://wybp-prod-app-r001.ayo-m-ayeni.workers.dev'},secret='s'.repeat(43);
const env={WYBP_AUTHORITY_ROLE:'production-app',WYBP_DIRECT_ORIGIN:hosting.origin,WYBP_PRIVATE_ACCESS_TOKEN:secret};
test('direct preparation denies anonymous assets, spoofed proxies, wrong hosts and attempted public activation',async()=>{
 let called=0;const next=async()=>{called++;return new Response('synthetic');};
 for(const path of ['/','/_next/static/app.js','/quiz-art/a.svg'])assert.equal((await directIngress(new Request(hosting.origin+path),env,hosting,next)).status,401);
 assert.equal((await directIngress(new Request(hosting.origin,{headers:{'x-nf-sign':'pretend','x-forwarded-host':'classesforculture.com'}}),env,hosting,next)).status,401);
 assert.equal((await directIngress(new Request('https://evil.example/'),env,hosting,next)).status,404);
 assert.equal((await directIngress(new Request(hosting.origin),{...env,WYBP_PUBLIC_ACCESS_ENABLED:'true'},hosting,next)).status,404);assert.equal(called,0);
 assert.throws(()=>validateHostingOrigin({...hosting,origin:'https://evil.ayo-m-ayeni.workers.dev'}));
 assert.throws(()=>validateHostingOrigin({environment:'test',origin:hosting.origin}));
});
test('authorised direct preparation strips gateway identity and preserves the exact body, cookies and Origin',async()=>{
 const body='{"synthetic":"é"}',request=new Request(hosting.origin+'/cowries/play',{method:'POST',headers:{authorization:'Basic '+btoa('operator:'+secret),cookie:'synthetic=1',origin:hosting.origin,'cf-connecting-ip':'spoofed','oai-identity':'spoofed'},body});
 const response=await directIngress(request,env,hosting,async trusted=>{
  assert.equal(trusted.url,request.url);assert.equal(trusted.headers.has('authorization'),false);assert.equal(trusted.headers.has('cf-connecting-ip'),false);assert.equal(trusted.headers.has('oai-identity'),false);assert.equal(trusted.headers.get('cookie'),'synthetic=1');assert.equal(trusted.headers.get('origin'),hosting.origin);assert.equal(await trusted.text(),body);return new Response('ok',{headers:{'set-cookie':'synthetic=2; Secure; HttpOnly'}});
 });assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('production webhook exception is exact, OFF by default and remains separate from frontend access',async()=>{
 const h={platform:'cloudflare-direct',environment:'production',origin:'https://classesforculture.com'},e={...env,WYBP_DIRECT_ORIGIN:h.origin};let calls=0;
 const next=async request=>{calls++;assert.equal(request.headers.get('stripe-signature'),'synthetic');assert.equal(await request.text(),'exact bytes');return new Response(null,{status:400});};
 const request=new Request(h.origin+'/commerce/stripe-webhook',{method:'POST',headers:{'stripe-signature':'synthetic'},body:'exact bytes'});
 assert.equal((await directIngress(request,e,h,next)).status,404);
 assert.equal((await directIngress(request,{...e,WYBP_LIVE_WEBHOOK_ENABLED:'true'},h,next)).status,400);assert.equal(calls,1);
 for(const path of ['/owner','/callback','/commerce/stripe-test-webhook'])assert.equal((await directIngress(new Request(h.origin+path),{...e,WYBP_PUBLIC_ACCESS_ENABLED:'true'},h,next)).status,404);
 assert.equal((await directIngress(new Request(h.origin),{...e,WYBP_PUBLIC_ACCESS_ENABLED:'true'},h,async()=>new Response('public'))).status,200);
});
test('feature-capable production builds require every fresh evidence gate and retain disabled optional features',()=>{
 const at=Date.now(),flags={...defaultFeatureFlags,random_quick_play:true,cowrie_economy:true,commerce:true},v={version:1,target:'cloudflare-direct',origin:'https://classesforculture.com',sourceRevision:'a'.repeat(40),evidenceSha256:'b'.repeat(64),verifiedAt:at,expiresAt:at+3600000,checks:Object.fromEntries(productionGates.map(k=>[k,true]))};
 assert.equal(productionBuildReadiness(v,flags,v.origin,at),true);assert.equal(productionBuildReadiness(null,defaultFeatureFlags,v.origin,at),false);
 for(const k of productionGates)assert.throws(()=>productionBuildReadiness({...v,checks:{...v.checks,[k]:false}},flags,v.origin,at));
 assert.throws(()=>productionBuildReadiness({...v,expiresAt:at},flags,v.origin,at));assert.throws(()=>productionBuildReadiness(v,{...flags,party_mode:true},v.origin,at));
});
