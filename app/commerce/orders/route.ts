import { CommerceValidationError } from "../../../db/commerceContracts.ts";
import { activeFeatureFlags } from "../../featureFlags.ts";
import { commerceJson,readCommerceJson,safeCommerceRequest } from "../../commerceHttp.ts";
import { getCommerceRuntime } from "../../commerceRuntime.ts";

export async function POST(request:Request):Promise<Response>{ if(!activeFeatureFlags.commerce)return commerceJson({accepted:false},404); if(!safeCommerceRequest(request))return commerceJson({accepted:false},403); try{const runtime=await getCommerceRuntime();if(!runtime)return commerceJson({accepted:false},503);return commerceJson(await runtime.service.startOrder(await readCommerceJson(request)),201);}catch(error){if(error instanceof CommerceValidationError)return commerceJson({accepted:false},error.code==="commerce_rate_limited"?429:error.code.includes("unavailable")?503:400);return commerceJson({accepted:false},400);} }
