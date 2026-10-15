import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSellerDetails,sellerDetailsFromRuntime} from '../../app/sellerDetails.ts';
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
