import application from "./index.ts";
import { netlifyIngress, type NetlifyIngressEnvironment } from "./netlifyIngress.ts";
import type { HostingOrigin } from "../app/hostingOrigin.ts";

declare const __WYBP_HOSTING_ORIGIN__: HostingOrigin;

export default {
  fetch(request: Request, env: Parameters<typeof application.fetch>[1] & NetlifyIngressEnvironment,
    ctx: Parameters<typeof application.fetch>[2]): Promise<Response> {
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
};
