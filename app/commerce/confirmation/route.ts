import {activeFeatureFlags} from '../../featureFlags.ts';
import {safeCommerceRequest,readCommerceJson,commerceJson} from '../../commerceHttp.ts';
import {getCommerceRuntime} from '../../commerceRuntime.ts';
import {purchaseConfirmationText} from '../../../worker/purchaseConfirmationMail.mjs';
export async function POST(request:Request):Promise<Response>{
 if(!activeFeatureFlags.commerce)return commerceJson({accepted:false},404);if(!safeCommerceRequest(request))return commerceJson({accepted:false},403);
 try{const runtime=await getCommerceRuntime();if(!runtime)return commerceJson({accepted:false},503);const contract=await runtime.service.purchaseConfirmation(await readCommerceJson(request));return new Response(purchaseConfirmationText(contract),{headers:{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename="classes-for-culture-purchase.txt"','cache-control':'private, no-store','x-content-type-options':'nosniff'}});}catch{return commerceJson({accepted:false},404);}
}
