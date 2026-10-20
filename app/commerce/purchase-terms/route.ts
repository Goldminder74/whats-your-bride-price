import {activeFeatureFlags} from '../../featureFlags.ts';
import {commerceJson} from '../../commerceHttp.ts';
import {getCommerceRuntime} from '../../commerceRuntime.ts';
import {PURCHASE_TERMS,PURCHASE_TERMS_VERSION} from '../../purchaseConfirmationPolicy.ts';
export async function GET():Promise<Response>{
 if(!activeFeatureFlags.commerce)return commerceJson({available:false},404);try{const runtime=await getCommerceRuntime();if(!runtime)return commerceJson({available:false},503);return commerceJson(runtime.confirmationInfo?{required:true,...runtime.confirmationInfo,terms:PURCHASE_TERMS,termsVersion:PURCHASE_TERMS_VERSION}:{required:false},200);}catch{return commerceJson({available:false},503);}
}
