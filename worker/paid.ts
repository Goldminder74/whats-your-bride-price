import { createD1Repository } from "../paid/d1Repository.ts";
import { assertReplyTo, createTransactionalEmail, type TransactionalEmail } from "../paid/email.ts";
import { SUPPORT_EMAIL } from "../paid/receipt.ts";
import { isPaidError, PaidError } from "../paid/errors.ts";
import { paidSchemaSql } from "../paid/schemaSql.ts";
import { blockedPurchaseCountries } from "../paid/catalog.ts";
import { envFlagOn } from "../paid/earn.ts";
import { readPaidConfig, servePaid, type PaidConfig, type PaidServices } from "../paid/serve.ts";
import type { KvStore } from "../paid/games.ts";

interface PaidEnv {
  DB: D1Database;
  GAME_KV: KVNamespace;
  ASSETS: Fetcher;
  STRIPE_MODE?: string;
  STRIPE_API_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_AUTOMATIC_TAX?: string;
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  ROYAL_REVEAL_ENABLED?: string;
  OWNER_STATS_TOKEN?: string;
  PAID_BLOCKED_COUNTRIES?: string;
  PUBLIC_APP_ORIGIN?: string;
  RANDOM_BANK?: string;
  EARN_PATHS?: string;
  SHARE_CARDS?: string;
  DAILY_CHALLENGE?: string;
  RESULT_VIDEO?: string;
}

let schemaReady: Promise<void> | null = null;

async function applySchema(database: D1Database): Promise<void> {
  for (const statement of paidSchemaSql.split(";")) {
    const sql = statement.trim();
    if (!sql) continue;
    try {
      await database.prepare(sql).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/duplicate column name/i.test(message)) throw error;
    }
  }
}

function kvStore(namespace: KVNamespace): KvStore {
  return {
    get: (key) => namespace.get(key),
    put: (key, value) => namespace.put(key, value),
  };
}

function loadConfig(env: PaidEnv): PaidConfig | null {
  try {
    return readPaidConfig(env);
  } catch (error) {
    if (isPaidError(error)) return null;
    throw error;
  }
}

function loadEmail(env: PaidEnv): TransactionalEmail {
  try {
    return createTransactionalEmail(env.EMAIL_PROVIDER || "mock", env.EMAIL_API_KEY || "", env.EMAIL_FROM || "", env.EMAIL_REPLY_TO || SUPPORT_EMAIL);
  } catch (error) {
    if (!isPaidError(error)) throw error;
    return { async send() { throw new PaidError("email_not_configured", 503); } };
  }
}

function loadReplyTo(env: PaidEnv): string {
  try {
    return assertReplyTo(env.EMAIL_REPLY_TO || SUPPORT_EMAIL);
  } catch (error) {
    if (!isPaidError(error)) throw error;
    return SUPPORT_EMAIL;
  }
}

function services(env: PaidEnv, ctx: ExecutionContext): PaidServices {
  return {
    now: () => Date.now(),
    repository: createD1Repository(env.DB),
    kv: kvStore(env.GAME_KV),
    email: loadEmail(env),
    replyTo: loadReplyTo(env),
    blockedCountries: blockedPurchaseCountries(env.PAID_BLOCKED_COUNTRIES),
    royalRevealEnabled: ["1", "on", "true"].includes((env.ROYAL_REVEAL_ENABLED || "").trim().toLowerCase()),
    ownerStatsToken: env.OWNER_STATS_TOKEN || "",
    config: loadConfig(env),
    assets: env.ASSETS,
    ensureSchema: () => {
      schemaReady ??= applySchema(env.DB).catch((error: unknown) => {
        schemaReady = null;
        throw error;
      });
      return schemaReady;
    },
    waitUntil: (promise) => ctx.waitUntil(promise),
    randomBank: ["1", "true", "on", "yes"].includes((env.RANDOM_BANK || "").toLowerCase()),
    earnPaths: envFlagOn(env.EARN_PATHS),
    shareCards: envFlagOn(env.SHARE_CARDS),
    dailyChallenge: envFlagOn(env.DAILY_CHALLENGE),
    resultVideo: envFlagOn(env.RESULT_VIDEO),
  };
}

const worker = {
  async fetch(request: Request, env: PaidEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      return await servePaid(request, services(env, ctx));
    } catch (error) {
      if (isPaidError(error)) {
        return Response.json({ error: error.code }, { status: error.status, headers: { "cache-control": "no-store" } });
      }
      console.error(JSON.stringify({ level: "error", event: "paid_worker_unhandled" }));
      return Response.json({ error: "unavailable" }, { status: 500 });
    }
  },
};

export default worker;
