import { CommerceValidationError } from "../../../db/commerceContracts.ts";
import { activeFeatureFlags } from "../../featureFlags.ts";
import { commerceJson,readCommerceJson,safeCommerceRequest } from "../../commerceHttp.ts";
import { getCommerceRuntime } from "../../commerceRuntime.ts";
export async function POST(request:Request):Promise<Response>{if(!activeFeatureFlags.commerce)return commerceJson({active:false},404);if(!safeCommerceRequest(request))return commerceJson({active:false},403);try{const runtime=await getCommerceRuntime();if(!runtime)return commerceJson({active:false},503);return commerceJson(await runtime.service.entitlement(await readCommerceJson(request)),200);}catch(error){return commerceJson({active:false},error instanceof CommerceValidationError&&error.code==="commerce_rate_limited"?429:404);}}
