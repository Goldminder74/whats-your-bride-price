# Owner-dashboard access contract

Date: 27 August 2026
Status: implemented locally, disabled and unbound

## Trusted identity and explicit authorization

The Sites dispatcher supplies `oai-authenticated-user-id` and `oai-authenticated-user-email` for a signed-in visitor. `app/chatgpt-auth.ts` reads those values only inside the server-rendering boundary. The stable per-user, per-Site subject ID is the sole authorization input; email and name are never authorization keys. This contract depends on the deployed Worker remaining reachable only through the trusted Sites dispatch boundary that owns and replaces these headers.

Authentication alone is insufficient. `app/ownerDashboardAuth.ts` applies the server-only comma-separated allowlist `WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS`. Missing, empty, malformed or duplicate configuration denies every request. An unknown or absent authenticated subject also denies access. There is no default owner, shared password, client secret, cookie, query override or local-storage authority. Allowlist values are not defined through Vite, passed to client components, rendered, exported or logged.

The build-time flag is `owner_dashboard`, controlled only by `WYBP_FEATURE_OWNER_DASHBOARD`; its default is false. A non-fixture enabled build fails unless both D1 and a non-empty owner-access configuration are present. Production activation still requires a separate review of the actual allowlist, Sites access policy, direct-origin isolation and export rate limiter. Current production remains disabled and inaccessible.

## Routes and order of checks

| Route | Method | Enforcement |
| --- | --- | --- |
| `/owner/analytics` | GET | Flag check, trusted Sites identity, explicit subject allowlist, strict filter validation, then D1 runtime lookup and aggregation |
| `/owner/analytics/export` | GET | Same flag, identity and allowlist; HTTPS/local transport; `Sec-Fetch-Site: same-origin`; strict filters; owner-keyed rate limiter; then aggregate query and CSV serialization |

Missing or unauthorized identity produces a neutral 404 before filter parsing, fixture selection, runtime acquisition or D1 access. Protected pages are forced dynamic. HTML and CSV responses are private and non-cacheable; the export adds no-sniff, same-origin resource, no-referrer, restrictive CSP and attachment headers. There are no state-changing dashboard requests. Any future stateful owner action must add exact-origin, CSRF and Fetch Metadata controls before authorization.

## Local review boundary

Synthetic dashboard records require both `WYBP_REVIEW_BUILD=true` and `WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES=true`, plus `WYBP_FEATURE_OWNER_DASHBOARD=true`. Fixtures do not bypass authorization. Tests simulate the dispatcher header and must still match the server allowlist. `tests/preview-server.mjs` may inject that synthetic identity only when both review gates and an explicit `WYBP_PREVIEW_OWNER_SUBJECT` are present; ordinary production output has neither fixture data nor this local-only simulation.

Fixture selection occurs only after authorization. A `fixture` query cannot authenticate, authorize or enable the dashboard. Client-supplied owner, email, role, cookie, storage or query values are ignored.

## Required activation decisions

Before any hosted activation: approve and bind D1; separately approve migration application through `0006`; configure and review the exact stable subject allowlist; confirm Sites dispatch is the only public ingress; set an owner/workspace access policy; install a distributed export limiter; review consent and retention; verify private no-store headers at the deployed edge; and run the complete isolated dashboard suite. Nothing here authorizes deployment, storage access, migration, seed, analytics activation or commerce activation.
