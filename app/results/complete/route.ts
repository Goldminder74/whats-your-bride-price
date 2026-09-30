import { ResultCompletionError } from "../../../db/resultCompletion.ts";
import { commerceJson, readCommerceJson, safeCommerceRequest } from "../../commerceHttp.ts";
import { getCommerceRuntime } from "../../commerceRuntime.ts";
import { activeFeatureFlags } from "../../featureFlags.ts";

export async function POST(request: Request): Promise<Response> {
  if (!activeFeatureFlags.commerce) return commerceJson({ completed: false }, 404);
  if (!safeCommerceRequest(request)) return commerceJson({ completed: false }, 403);
  try {
    const runtime = await getCommerceRuntime();
    if (!runtime?.resultCompletionService) return commerceJson({ completed: false }, 503);
    const completion = await runtime.resultCompletionService.complete(await readCommerceJson(request));
    return commerceJson({ completed: true, resultSlug: completion.resultSlug }, 201);
  } catch (error) {
    if (error instanceof ResultCompletionError) {
      const status = error.code.includes("unavailable") ? 503 : error.code.includes("collision") ? 409 : 400;
      return commerceJson({ completed: false }, status);
    }
    return commerceJson({ completed: false }, 400);
  }
}
