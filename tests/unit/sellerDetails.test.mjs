import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSellerDetails,sellerConfigurationIssue,prepareSellerAddressUpdate,sellerDetailsFromRuntime,resolvePublicSellerDetails} from '../../app/sellerDetails.ts';
import {legalInformation} from '../../app/legalConfig.ts';
const synthetic=()=>({version:1,legalName:'Ayodele Ayeni',tradingName:'Classes for Culture',geographicalAddress:'Synthetic test address only',complaintsAddress:null,telephone:null,supportEmail:'team@classesforculture.com',privacyEmail:'team@classesforculture.com'});
test('complete seller fields accepted only in production-app runtime without legal approval',()=>{
 const details=synthetic(),raw=JSON.stringify(details);
 assert.deepEqual(parseSellerDetails(raw),details);
 assert.ok(Object.isFrozen(parseSellerDetails(raw)));
 for(const role of [undefined,'production-ops','test','rehearsal'])assert.equal(sellerDetailsFromRuntime({WYBP_AUTHORITY_ROLE:role,WYBP_PUBLIC_SELLER_DETAILS_JSON:raw}),null);
 assert.deepEqual(sellerDetailsFromRuntime({WYBP_AUTHORITY_ROLE:'production-app',WYBP_PUBLIC_SELLER_DETAILS_JSON:raw}),details);
 assert.equal(legalInformation.approvedForProduction,false);
 assert.equal(legalInformation.postalAddress,null);
});
test('missing, malformed, extra, injection and unapproved identity fields fail closed',()=>{
 for(const raw of [undefined,'null','[]','{',JSON.stringify({...synthetic(),secret:'do-not-output'}),JSON.stringify({...synthetic(),geographicalAddress:'<script>bad</script>'}),JSON.stringify({...synthetic(),telephone:'javascript:bad'}),JSON.stringify({...synthetic(),legalName:'Another account'}),JSON.stringify({...synthetic(),supportEmail:'other@example.com'}),JSON.stringify({...synthetic(),privacyEmail:'outside@example.com'}),JSON.stringify({...synthetic(),geographicalAddress:''}),JSON.stringify({...synthetic(),geographicalAddress:'x'.repeat(4096)})])assert.equal(parseSellerDetails(raw),null);
});
test('separate complaints address and telephone supported without modifying inputs',()=>{
 const details={...synthetic(),complaintsAddress:'Separate synthetic complaint address',telephone:'+44 (0)20 1234 5678'};
 assert.deepEqual(parseSellerDetails(JSON.stringify(details)),details);
 assert.equal(parseSellerDetails(JSON.stringify({...details,complaintsAddress:'a\nb'})),null);
});
test('the installation example cannot be mistaken for actual seller information',()=>{
 assert.equal(parseSellerDetails(JSON.stringify({...synthetic(),geographicalAddress:'REPLACE_WITH_YOUR_PUBLIC_BUSINESS_ADDRESS'})),null);
});

test('private configuration diagnosis returns only known field names and never supplied values or keys',()=>{
 assert.equal(sellerConfigurationIssue(JSON.stringify(synthetic())),null);
 assert.equal(sellerConfigurationIssue(undefined),'missing_secret');assert.equal(sellerConfigurationIssue('private-invalid-json'),'invalid_json');
 assert.equal(sellerConfigurationIssue(JSON.stringify({...synthetic(),geographicalAddress:'private\nvalue'})),'invalid_field:geographicalAddress:control_characters');
 assert.equal(sellerConfigurationIssue(JSON.stringify({...synthetic(),geographicalAddress:'REPLACE_WITH_YOUR_PUBLIC_BUSINESS_ADDRESS'})),'invalid_field:geographicalAddress:placeholder');
 assert.equal(sellerConfigurationIssue(JSON.stringify({...synthetic(),telephone:'private-secret-input'})),'invalid_field:telephone');
 assert.equal(sellerConfigurationIssue(JSON.stringify({...synthetic(),'private-input-key':'private-value'})),'unexpected_fields');
 const missing=synthetic();delete missing.telephone;assert.equal(sellerConfigurationIssue(JSON.stringify(missing)),'missing_fields:telephone');
});

test('private address preparation preserves other installed public fields and never replaces an already valid different address',()=>{
 const current={...synthetic(),geographicalAddress:'REPLACE_WITH_YOUR_PUBLIC_BUSINESS_ADDRESS',telephone:'+44 20 1234 5678',complaintsAddress:'Synthetic separate complaints address'};
 const updated={...current,geographicalAddress:'Synthetic new address only'};
 assert.deepEqual(prepareSellerAddressUpdate(JSON.stringify(current),updated.geographicalAddress),updated);
 assert.deepEqual(prepareSellerAddressUpdate(JSON.stringify({...current,geographicalAddress:''}),updated.geographicalAddress),updated);
 for(const raw of [undefined,'{','null','[]',JSON.stringify({...current,privateKey:'must-not-escape'}),JSON.stringify({...current,legalName:'Other seller'}),JSON.stringify({...current,supportEmail:'other@example.com'}),JSON.stringify(synthetic())])assert.equal(prepareSellerAddressUpdate(raw,updated.geographicalAddress),null);
 for(const address of [undefined,'','REPLACE_WITH_YOUR_PUBLIC_BUSINESS_ADDRESS','<script>bad</script>','line\nbreak','x'.repeat(1001)])assert.equal(prepareSellerAddressUpdate(JSON.stringify(current),address),null);
 assert.deepEqual(prepareSellerAddressUpdate(JSON.stringify(updated),updated.geographicalAddress),updated);
 assert.equal(prepareSellerAddressUpdate(JSON.stringify(updated),'Another synthetic address'),null);
 assert.equal(current.geographicalAddress,'REPLACE_WITH_YOUR_PUBLIC_BUSINESS_ADDRESS');
});

test('production app reuses validated public seller details through its existing private authority binding',async()=>{
 const details=synthetic();let calls=0;const AUTHORITY={publicSellerDetails:async()=>{calls++;return details;}};
 for(const role of [undefined,'production-ops','test','rehearsal'])assert.equal(await resolvePublicSellerDetails({WYBP_AUTHORITY_ROLE:role,AUTHORITY}),null);
 assert.equal(calls,0);
 const result=await resolvePublicSellerDetails({WYBP_AUTHORITY_ROLE:'production-app',AUTHORITY});assert.deepEqual(result,details);assert.ok(Object.isFrozen(result));assert.equal(calls,1);
 assert.deepEqual(await resolvePublicSellerDetails({WYBP_AUTHORITY_ROLE:'production-app',AUTHORITY,WYBP_PUBLIC_SELLER_DETAILS_JSON:JSON.stringify(details)}),details);assert.equal(calls,1);
 assert.equal(await resolvePublicSellerDetails({WYBP_AUTHORITY_ROLE:'production-app',AUTHORITY,WYBP_PUBLIC_SELLER_DETAILS_JSON:'invalid'}),null);assert.equal(calls,1);
});

test('seller RPC rejects missing, malformed, extra, mismatched and unavailable responses without disclosure',async()=>{
 for(const value of [null,undefined,'not a record',{...synthetic(),privateKey:'must-not-escape'},{...synthetic(),legalName:'Another account'},{}])assert.equal(await resolvePublicSellerDetails({WYBP_AUTHORITY_ROLE:'production-app',AUTHORITY:{publicSellerDetails:async()=>value}}),null);
 assert.equal(await resolvePublicSellerDetails({WYBP_AUTHORITY_ROLE:'production-app'}),null);
 assert.equal(await resolvePublicSellerDetails({WYBP_AUTHORITY_ROLE:'production-app',AUTHORITY:{publicSellerDetails:async()=>{throw Error('synthetic sensitive provider text');}}}),null);
});
