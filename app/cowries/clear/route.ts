import { getCowrieRuntime } from "../../cowrieRuntime.ts";
import { cowrieError, cowrieResponse, readCowriePost } from "../../cowrieHttp.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readCowriePost(request); const runtime = await getCowrieRuntime();
    if (!runtime) return cowrieResponse({ available: false }, 503);
    return cowrieResponse({ available: false, ...(await runtime.clear(body)) }, 200);
  } catch (error) { return cowrieError(error); }
}
