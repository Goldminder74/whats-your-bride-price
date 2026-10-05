import application from "./index.ts";
import { netlifyIngress, type NetlifyIngressEnvironment } from "./netlifyIngress.ts";
import type { HostingOrigin } from "../app/hostingOrigin.ts";
import { privateTestProfile, privateTestRuntimeReady } from "../app/privateTestProfile.ts";
import { TEST_WEBHOOK_PATH, testWebhook } from "./testWebhook.ts";
import { runTestRetention } from "../db/testRetention.ts";

declare const __WYBP_HOSTING_ORIGIN__: HostingOrigin;

export default {
  fetch(request: Request, env: Parameters<typeof application.fetch>[1] & NetlifyIngressEnvironment,
    ctx: Parameters<typeof application.fetch>[2]): Promise<Response> {
    if (new URL(request.url).pathname === TEST_WEBHOOK_PATH) return testWebhook(request, env as unknown as Record<string, unknown>, privateTestProfile);
    return netlifyIngress(request, env, __WYBP_HOSTING_ORIGIN__, async (trusted) => {
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
    await runTestRetention(runtime.DB as D1Database, Date.now());
  },
};
