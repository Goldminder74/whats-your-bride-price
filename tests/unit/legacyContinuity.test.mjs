import test from 'node:test';import assert from 'node:assert/strict';
import {legacyContinuity,LEGACY_PROVIDER_ORIGIN} from '../../worker/legacyContinuity.ts';
test('legacy compatibility stays off until configured; only exact auth/assets paths can use the fixed preserved origin',async()=>{
 const never=async()=>assert.fail('unexpected upstream');
 assert.equal(await legacyContinuity(new Request('https://classesforculture.com/login'),{},never),null);
 for(const path of ['/','/quiz','/privacy','/api/commerce','/assets/../private','//elsewhere.invalid/','/login/extra','/.netlify/functions/emails'])assert.equal(await legacyContinuity(new Request('https://classesforculture.com'+path),{WYBP_LEGACY_CONTINUITY_ENABLED:'true'},never),null);
 const denied=await legacyContinuity(new Request('https://classesforculture.com/login',{method:'POST'}),{WYBP_LEGACY_CONTINUITY_ENABLED:'true'},never);assert.equal(denied.status,405);
 for(const path of ['/profile','/verification-required','/registration-success','/tutor-dashboard/bookings','/classes/synthetic-class','/tutor/synthetic-tutor'])assert.equal((await legacyContinuity(new Request('https://classesforculture.com'+path),{WYBP_LEGACY_CONTINUITY_ENABLED:'true'},async()=>new Response('synthetic legacy shell',{headers:{'Content-Type':'text/html'}}))).status,200);
});
test('legacy callback shell keeps the canonical client URL and never forwards private auth, cookies or query tokens',async()=>{
 const request=new Request('https://classesforculture.com/verify-email?token=synthetic-private&next=https://elsewhere.invalid',{headers:{Authorization:'Bearer synthetic-private',Cookie:'synthetic=private','X-Wybp-Signed':'synthetic-signature'}});
 const result=await legacyContinuity(request,{WYBP_LEGACY_CONTINUITY_ENABLED:'true'},async(url,options)=>{assert.equal(url,LEGACY_PROVIDER_ORIGIN+'/');assert.deepEqual(options,{method:'GET',redirect:'manual',headers:{Accept:'text/html'}});return new Response('<html>preserved shell</html>',{headers:{'Content-Type':'text/html','Set-Cookie':'must-not-forward=1','Content-Security-Policy':"default-src 'self'"}});});
 assert.equal(result.status,200);assert.equal(await result.text(),'<html>preserved shell</html>');assert.equal(result.headers.get('Set-Cookie'),null);assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(result.headers.get('Content-Security-Policy'),"default-src 'self'");assert.match(request.url,/token=synthetic-private/);
});
test('legacy responses reject redirects, wrong shell type and oversized bodies; hashed assets and HEAD work',async()=>{
 const env={WYBP_LEGACY_CONTINUITY_ENABLED:'true'},request=new Request('https://classesforculture.com/login');
 for(const response of [new Response(null,{status:302,headers:{Location:'https://elsewhere.invalid'}}),new Response('wrong',{headers:{'Content-Type':'application/json'}}),new Response('x'.repeat(131073),{headers:{'Content-Type':'text/html'}})])assert.equal((await legacyContinuity(request,env,async()=>response)).status,502);
 const asset=await legacyContinuity(new Request('https://classesforculture.com/assets/index-abc123.js',{method:'HEAD'}),env,async(url)=>{assert.equal(url,LEGACY_PROVIDER_ORIGIN+'/assets/index-abc123.js');return new Response('synthetic',{headers:{'Content-Type':'application/javascript'}});});assert.equal(asset.status,200);assert.equal(await asset.text(),'');
});
