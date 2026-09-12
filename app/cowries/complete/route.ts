import { completeCowrieQuickPlay } from "../../../db/cowrieCompletion.ts";
import { cowrieError, cowrieResponse, readCowriePost } from "../../cowrieHttp.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readCowriePost(request);
    const { env } = await import("cloudflare:workers");
    const database = (env as unknown as { DB?: D1Database }).DB;
    if (!database) return cowrieResponse({ available: false }, 503);
    return cowrieResponse(await completeCowrieQuickPlay(database, body), 201);
  } catch (error) { return cowrieError(error); }
}
