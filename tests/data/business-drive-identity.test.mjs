import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBusinessDriveIdentity} from '../../scripts/business-drive-identity.mjs';

const accessToken='synthetic-held-access-token';
const identity='backup-operator@classesforculture.com';
const about=(change={})=>({user:{emailAddress:identity},storageQuota:{limit:'30000000000',usage:'2000000000'},...change});
const verify=data=>verifyBusinessDriveIdentity({accessToken,fetcher:async()=>Response.json(data)});
test('fixed minimal GET verifies only business identity and bounded whole-account quota, never paid status',async()=>{
 let calls=0;const result=await verifyBusinessDriveIdentity({accessToken,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress),storageQuota');assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+accessToken);assert.equal(options.body,undefined);assert.ok(options.signal instanceof AbortSignal);return Response.json(about());}});
 assert.deepEqual(result,{status:'verified',identityMatches:true,quotaVerified:true,limitBytes:30000000000,usageBytes:2000000000,freeBytes:28000000000,paidStatusVerified:false});assert.equal(calls,1);assert.ok(Object.isFrozen(result));assert.equal(JSON.stringify(result).includes(identity),false);assert.equal(JSON.stringify(result).includes(accessToken),false);
});
test('wrong personal or other business identity rejects without exposing email or quota',async()=>{
 for(const emailAddress of ['ayo.m.ayeni@gmail.com','another@classesforculture.com','BACKUP-OPERATOR@classesforculture.com']){const result=await verify(about({user:{emailAddress}}));assert.equal(result.status,'identity_mismatch');assert.equal(result.identityMatches,false);assert.equal(result.quotaVerified,false);assert.equal(result.limitBytes,null);assert.equal(JSON.stringify(result).includes(emailAddress),false);}
});
test('missing or unlimited quota is unverified, never interpreted as sufficient storage',async()=>{
 for(const storageQuota of [undefined,null,{},[],{usage:'0'},{limit:'30000000000'},{limit:null,usage:'0'}]){const result=await verify(about({storageQuota}));assert.equal(result.status,'quota_unverified');assert.equal(result.identityMatches,true);assert.equal(result.quotaVerified,false);assert.equal(result.freeBytes,null);assert.equal(result.paidStatusVerified,false);}
});
test('negative, fractional, noncanonical, numeric and unsafe counters reject',async()=>{
 for(const value of ['-1','1.5','+1','01','1e3','Infinity','NaN','9007199254740992','999999999999999999999',1,Infinity,NaN,'',null])for(const key of ['limit','usage']){const storageQuota={limit:'30000000000',usage:'0',[key]:value},result=await verify(about({storageQuota}));assert.equal(result.status,'quota_unverified');assert.equal(result.quotaVerified,false);assert.equal(result.limitBytes,null);assert.equal(result.usageBytes,null);}
});
test('zero and maximum safe quotas remain bounded; over-quota accounts have no free storage',async()=>{
 assert.deepEqual(await verify(about({storageQuota:{limit:'0',usage:'0'}})),{status:'verified',identityMatches:true,quotaVerified:true,limitBytes:0,usageBytes:0,freeBytes:0,paidStatusVerified:false});
 const largest=await verify(about({storageQuota:{limit:'9007199254740991',usage:'0'}}));assert.equal(largest.limitBytes,Number.MAX_SAFE_INTEGER);assert.equal(largest.freeBytes,Number.MAX_SAFE_INTEGER);
 const exceeded=await verify(about({storageQuota:{limit:'100',usage:'101'}}));assert.equal(exceeded.status,'quota_exceeded');assert.equal(exceeded.quotaVerified,true);assert.equal(exceeded.freeBytes,0);assert.equal(exceeded.paidStatusVerified,false);
});
test('redirects and errors are rejected without following URLs or returning provider bodies',async()=>{
 for(const status of [301,302,307,308,401,403,429,500]){let calls=0;const result=await verifyBusinessDriveIdentity({accessToken,fetcher:async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('private-provider-body '+accessToken,{status,headers:{Location:'https://untrusted.invalid/'}});}});assert.equal(result.status,'provider_unavailable');assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('private-provider'),false);}
 const redirected=Response.json(about());Object.defineProperty(redirected,'redirected',{value:true});assert.equal((await verifyBusinessDriveIdentity({accessToken,fetcher:async()=>redirected})).status,'provider_unavailable');
});
test('malformed responses and thrown errors are sanitised and never echo credentials',async()=>{
 for(const data of [null,[],{},about({user:null}),about({user:{emailAddress:42}})])assert.equal((await verify(data)).status,'response_unverified');
 const invalid=await verifyBusinessDriveIdentity({accessToken,fetcher:async()=>new Response('not JSON '+accessToken)});assert.equal(invalid.status,'response_unverified');
 const failure=await verifyBusinessDriveIdentity({accessToken,fetcher:async()=>{throw Error('private-provider '+accessToken);}});assert.equal(failure.status,'provider_unavailable');assert.equal(JSON.stringify(failure).includes(accessToken),false);assert.equal(JSON.stringify(failure).includes('private-provider'),false);
});
test('missing or injected bearer credentials fail before any request',async()=>{
 let calls=0;const fetcher=async()=>{calls++;assert.fail('must not request');};
 for(const value of [undefined,null,'short','token with spaces','synthetic\r\nAuthorization: private','x'.repeat(8193)])assert.equal((await verifyBusinessDriveIdentity({accessToken:value,fetcher})).status,'configuration_unverified');
 assert.equal((await verifyBusinessDriveIdentity({accessToken,fetcher:null})).status,'configuration_unverified');assert.equal(calls,0);
});
