import { completeCowrieQuickPlay } from "../../../db/cowrieCompletion.ts";
import { cowrieError, cowrieResponse, readCowriePost } from "../../cowrieHttp.ts";
import { privateTestProfile, privateTestRuntimeReady } from "../../privateTestProfile.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readCowriePost(request);
    const { env } = await import("cloudflare:workers");
    if (privateTestProfile !== "off" && !privateTestRuntimeReady(env as unknown as Record<string, unknown>)) return cowrieResponse({ available: false }, 503);
    const database = (env as unknown as { DB?: D1Database }).DB;
    if (!database) return cowrieResponse({ available: false }, 503);
    return cowrieResponse(await completeCowrieQuickPlay(database, body), 201);
  } catch (error) { return cowrieError(error); }
}
