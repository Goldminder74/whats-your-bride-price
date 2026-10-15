import application from "./index.ts";
import { netlifyIngress, type NetlifyIngressEnvironment } from "./netlifyIngress.ts";
import type { HostingOrigin } from "../app/hostingOrigin.ts";
import { privateTestProfile, privateTestRuntimeReady } from "../app/privateTestProfile.ts";
import { TEST_WEBHOOK_PATH, testWebhook } from "./testWebhook.ts";
import { assertRestoreReceipt } from "../db/retention.ts";
import { runTestRetention } from "../db/testRetention.ts";

declare const __WYBP_HOSTING_ORIGIN__: HostingOrigin;

export default {
  async fetch(request: Request, env: Parameters<typeof application.fetch>[1] & NetlifyIngressEnvironment,
    ctx: Parameters<typeof application.fetch>[2]): Promise<Response> {
    if (new URL(request.url).pathname === TEST_WEBHOOK_PATH) {
      if (privateTestProfile !== "off") { try { await assertRestoreReceipt((env as unknown as {DB:D1Database}).DB, (env as unknown as Record<string,unknown>).WYBP_RESTORE_RECEIPT_SHA256); } catch { return new Response(null,{status:503}); } }
      return testWebhook(request, env as unknown as Record<string, unknown>, privateTestProfile);
    }
    return netlifyIngress(request, env, __WYBP_HOSTING_ORIGIN__, async (trusted) => {
      if (privateTestProfile !== "off") { try { await assertRestoreReceipt((env as unknown as {DB:D1Database}).DB, (env as unknown as Record<string,unknown>).WYBP_RESTORE_RECEIPT_SHA256); } catch { return new Response(null,{status:503}); } }
      // Sites identity is unavailable here even if a future build accidentally enables owner tools.
      const path = new URL(trusted.url).pathname;
      if (/^\/owner(?:\/|$)/.test(path) || ["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(path)) {
        return new Response(null, { status: 404 });
      }
      if (["GET", "HEAD"].includes(trusted.method) && !trusted.headers.has("rsc")
        && (/^\/(?:_next\/static|quiz-art|regions|avatars)\//.test(path)
          || /^\/[^/]+\.(?:svg|png|ico|webmanifest)$/.test(path))) {
        return env.ASSETS.fetch(trusted);
      }
      return application.fetch(trusted, env, ctx);
    });
  },
  async scheduled(_event: ScheduledController, env: Parameters<typeof application.fetch>[1] & NetlifyIngressEnvironment): Promise<void> {
    const runtime = env as unknown as Record<string, unknown>;
    if (runtime.WYBP_TEST_RETENTION_ENABLED !== "true" || !privateTestRuntimeReady(runtime)) throw new Error("test_retention_unavailable");
    await assertRestoreReceipt(runtime.DB as D1Database, runtime.WYBP_RESTORE_RECEIPT_SHA256);
    await runTestRetention(runtime.DB as D1Database, Date.now());
  },
};
