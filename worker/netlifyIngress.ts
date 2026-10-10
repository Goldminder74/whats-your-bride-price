import { jwtVerify } from "jose";
import { validateHostingOrigin, type HostingOrigin } from "../app/hostingOrigin.ts";

export interface NetlifyIngressEnvironment {
  WYBP_NETLIFY_PROXY_SECRET?: string;
  WYBP_NETLIFY_PROJECT_ID?: string;
  WYBP_NETLIFY_CONTEXT?: string;
  WYBP_NETLIFY_SITE_URL?: string;
}

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  "cdn-cache-control": "no-store",
  "netlify-cdn-cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function unavailable(): Response { return new Response(null, { status: 404, headers: privateHeaders }); }

/** Netlify authenticates the gateway only. Application ownership and Stripe checks still run. */
export async function netlifyIngress(
  request: Request,
  env: NetlifyIngressEnvironment,
  hosting: HostingOrigin,
  application: (request: Request) => Promise<Response>,
  now = new Date(),
): Promise<Response> {
  let forwarded: Request;
  try {
    const origin = validateHostingOrigin(hosting);
    const secret = env.WYBP_NETLIFY_PROXY_SECRET;
    if (!secret || new TextEncoder().encode(secret).length < 32
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(env.WYBP_NETLIFY_PROJECT_ID || "")
      || !["production", "deploy-preview", "branch-deploy"].includes(env.WYBP_NETLIFY_CONTEXT || "")
      || env.WYBP_NETLIFY_SITE_URL !== origin) return unavailable();
    const incoming = new URL(request.url);
    if (incoming.protocol !== "https:") return unavailable();
    const token = request.headers.get("x-nf-sign");
    if (!token || token.length > 4096) return unavailable();
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], issuer: "netlify", requiredClaims: ["exp", "iss", "netlify_id", "deploy_context", "site_url"],
      currentDate: now, clockTolerance: 0,
    });
    if (protectedHeader.alg !== "HS256" || payload.netlify_id !== env.WYBP_NETLIFY_PROJECT_ID
      || payload.deploy_context !== env.WYBP_NETLIFY_CONTEXT || payload.site_url !== origin) return unavailable();
    const url = new URL(origin);
    url.pathname = incoming.pathname;
    url.search = incoming.search;
    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) {
      if (name.startsWith("oai-") || name.startsWith("x-forwarded-") || name.startsWith("x-nf-")
        || name === "forwarded" || name === "host" || name.startsWith("cf-")) headers.delete(name);
    }
    // Stream the original body; never parse or serialize webhook JSON at the gateway.
    forwarded = new Request(url, new Request(request, { headers }));
  } catch { return unavailable(); }
  const response = await application(forwarded);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(privateHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
