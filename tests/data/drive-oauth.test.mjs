import test from 'node:test';
import assert from 'node:assert/strict';
import { driveAccessToken, prepareAuthorityAlert } from '../../worker/driveOAuth.mjs';
test('server token refresh coalesces concurrent requests and never extends an expired credential',async()=>{
 let at=0,calls=0;const token=driveAccessToken({clientId:'synthetic-client',clientSecret:'synthetic-secret',refreshToken:'synthetic-refresh',now:()=>at,fetcher:async(url,o)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(o.redirect,'error');calls++;return Response.json({access_token:'synthetic-access-'+calls,token_type:'Bearer',expires_in:3600});}});
 assert.deepEqual(await Promise.all([token(),token()]),['synthetic-access-1','synthetic-access-1']);assert.equal(calls,1);at=3540000;assert.equal(await token(),'synthetic-access-2');
});
test('revoked credentials fail closed with sanitised errors; alerts are only prepared',async()=>{
 const token=driveAccessToken({clientId:'synthetic-client',clientSecret:'synthetic-secret',refreshToken:'synthetic-refresh',fetcher:async()=>new Response('private-provider-detail',{status:400})});
 await assert.rejects(token(),/^Error: drive_oauth_refresh$/);
 const alert=prepareAuthorityAlert({component:'authority',status:'blocked',at:Date.now()});assert.equal(alert.to,'team@classesforculture.com');assert.equal(alert.sendApproved,false);
 assert.throws(()=>prepareAuthorityAlert({component:'SQL-private',status:'blocked',at:Date.now()}),/authority_alert/);
});

test('malformed or broader-scope token responses never leak their body or grant broader access',async()=>{
 const config={clientId:'synthetic-client',clientSecret:'synthetic-secret',refreshToken:'synthetic-refresh'};
 await assert.rejects(driveAccessToken({...config,fetcher:async()=>new Response('private-secret-body')})(),/^Error: drive_oauth_response$/);
 await assert.rejects(driveAccessToken({...config,fetcher:async()=>Response.json({access_token:'synthetic-access',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/drive'})})(),/drive_oauth_scope/);
});
