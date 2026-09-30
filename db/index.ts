import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { UnboundDurableRepository } from "./repositories";

const runtimeEnv = env as unknown as { DB?: D1Database };

export function getDb() {
  if (!runtimeEnv.DB) {
    throw new Error(
      "Cloudflare D1 is unavailable. The repository proposes the logical binding `DB`, but an owner must approve and provision it through Sites before durable features are enabled."
    );
  }

  return drizzle(runtimeEnv.DB, { schema });
}

export function getDurableRepositoryReadiness() {
  if (!runtimeEnv.DB) return new UnboundDurableRepository();
  throw new Error("The D1 binding exists, but active durable repositories and write endpoints are intentionally deferred.");
}
