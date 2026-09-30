import { getCowrieRuntime } from "../../cowrieRuntime.ts";
import { cowrieError, cowrieResponse, readCowriePost } from "../../cowrieHttp.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readCowriePost(request); const runtime = await getCowrieRuntime();
    if (!runtime) return cowrieResponse({ available: false }, 503);
    const result = await runtime.startQuickPlay(body);
    return cowrieResponse({ available: true, ...result.selection, access: result.access, wallet: result.wallet }, 201);
  } catch (error) { return cowrieError(error); }
}
