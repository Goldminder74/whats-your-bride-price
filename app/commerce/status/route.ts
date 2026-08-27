import { CommerceValidationError } from "../../../db/commerceContracts.ts";
import { activeFeatureFlags } from "../../featureFlags.ts";
import { commerceJson,readCommerceJson,safeCommerceRequest } from "../../commerceHttp.ts";
import { getCommerceRuntime } from "../../commerceRuntime.ts";
export async function POST(request:Request):Promise<Response>{if(!activeFeatureFlags.commerce)return commerceJson({accepted:false},404);if(!safeCommerceRequest(request))return commerceJson({accepted:false},403);try{const runtime=await getCommerceRuntime();if(!runtime)return commerceJson({accepted:false},503);return commerceJson(await runtime.service.orderStatus(await readCommerceJson(request)),200);}catch(error){return commerceJson({accepted:false},error instanceof CommerceValidationError&&error.code==="commerce_rate_limited"?429:400);}}
