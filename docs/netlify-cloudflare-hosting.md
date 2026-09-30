# Netlify entry point with Cloudflare application server

Status: local adaptation only. No resource creation, hosted migration, publication,
payment activation or domain cutover is part of this change.

## Compiled navigation correction

The starting commit `32d0d11878d62345f3b01955f6b039de3f3a8577` also fails
Privacy → Return to the game. An isolated archive, fresh committed-lockfile install
and ordinary Sites build reproduced the same browser exception before any
adaptation code was added. Initial hydration worked, but Link navigation did not.

Confirmed cause in this installed dependency graph: Vinext beta.2's
`createClientManualChunks` returns early for every node_modules path, making
its shared-shim grouping unreachable. Navigation consequently lands in a shared
index chunk. Link's compiled dynamic import destructures navigateClientSide from
that chunk's top-level namespace, which has no such export. Source navigation.js
exports the function, and client transform/module metadata retains it; the
incorrect mapping occurs during chunk generation, not in application routing.
The corrected grouping generates the proper namespace projection
(`import(vinextChunk).then(m => m.<namespace>)`) used by Link.

The client-only Vite rule mirrors the installed-shim fix in
[Vinext PR #2795](https://github.com/cloudflare/vinext/pull/2795), preserving its
route-owned shim exclusions and normalising Windows separators. The isolated
baseline passes with this one rule. Both application targets now pass compiled
browser navigation. No dependencies changed for this repair: Vinext remains
1.0.0-beta.2, Vite 8.0.13, Rolldown 1.0.1 and React 19.2.6. Revisit the workaround
when deliberately upgrading Vinext to a version containing the upstream fix.

Duplicate framework packages were not found. A clean install/build rules out
stale artifacts as the cause. The separate upstream Windows client-reference
deduplication fix is development-only and does not apply to this production-build
failure. Neither rejected export-setting experiment is retained or repeated.
There is no generated-file patch, navigation fallback, timeout increase or skip.

The first complete validation then exposed an export-link interaction: working
Link prefetching requested the owner CSV endpoint during dashboard viewing and
exhausted its existing five-request quota. The trace showed unsolicited `_rsc`
export requests and a deliberate request receiving 429. Only that file-download
URL now uses a native file-export anchor and the existing attachment response;
ordinary page Links still use RSC. No document reload is used for the export.
The browser test verifies zero export requests during viewing/focus and one
successful download after clicking, retaining the existing CSV assertions.
No owner authentication, Fetch Metadata or rate-limit rule was changed.

The shared browser regression retains the original quiz-entry and failing return
journey, and adds Game → Privacy → Game, Terms, back/forward, query restoration,
direct loads and refreshes. It checks real component responses, a persistent
document marker, document request counts and browser/hydration errors. Each
harness uses the client/server pair from its immediately preceding build; the
Netlify harness also verifies the packaged release's complete file hashes.
The Sites preview uses an OS-assigned port and its child is closed on success
or failure. No cloud resources are used by these harnesses.

These local results do not establish live Netlify signing, owner-only access,
Cloudflare permissions, Images service or deployment readiness.

## Architecture and retained protections

Browser → private Netlify project → signed proxy → dedicated Worker → isolated D1.
Vinext/Vite, React Server Components and the existing Worker application remain in
place. SQL batches, triggers, ownership and signed Stripe reconciliation stay in
their existing repositories; no SQL is split into remote per-statement calls.

`npm run build` still targets Sites unless WYBP_DEPLOY_TARGET is explicitly set.
The Sites manifest, packaging, default production origin and commerce restriction
are unchanged. The new target uses worker/netlify.ts and wrangler.netlify.jsonc.
The latter is a synthetic, unbound build template, never a deployment configuration.
There is no Netlify Next.js adapter, Nitro conversion or PostgreSQL migration.

Netlify's documented x-nf-sign JWS is verified with jose/HS256. Required claims
are exp, iss=netlify, exact netlify_id, deploy_context and site_url. The signing
secret is runtime-only by default (see the isolated Personal-plan exception below),
at least 32 random bytes represented as a string, and must
match on Netlify and the Worker. Missing/invalid credentials return neutral 404
before application or assets. This authenticates a gateway, not a player. It is
not a Stripe signature and is not a per-request body signature. Never echo/log it.

The application URL uses only the compiled approved origin plus the path/query.
Origin, Fetch Metadata, method, body, cookies, Stripe-Signature and RSC navigation
headers survive. Sites identity and forwarding headers are stripped. Owner and
Sites login routes return 404 regardless of incoming identity headers. Dynamic
responses are private/no-store at browser and CDN layers, including redirects.
Netlify must enforce HTTPS before proxying. Verify HTTP behaviour live; do not
infer an original secure browser connection merely from the Worker URL.

Official reference checked during implementation:
https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/
Netlify's documented proxy timeout is 26 seconds. Test slow paths before activation.

## Local commands and evidence

* npm run test:hosting — focused security and release tests.
* npm run test:all — aggregate suite, including hosting unit tests and the mandatory
  compiled harness below. A successful aggregate now requires real Link navigation.
* npm run test:compiled-hosting — sequential fresh Sites build/browser regression,
  then synthetic Netlify/Worker build and the complete compiled hosting harness.
  Run with feature/review/origin overrides unset; the command rejects them.
* npm run build — existing Sites build (clear new-target environment first).
* npm run build:netlify-worker -- --synthetic — entirely local, all flags off.
* node tests/hosting-built.test.mjs — compiled synthetic release and intercepted
  browser requests; no external application/network resources are used.
* node scripts/verify-netlify-release.mjs <release-directory> — validate a pair.

The synthetic origin, UUID and Worker are fixtures, not claimed existing resources.
No script here calls deploy, migration, import or seed commands. Build tools can
write ignored local caches and output only. Runtime secrets are unnecessary for
building. The only new package is jose 6.2.12, installed without lifecycle scripts.
The Central/Southern Africa test lockfile pins are updated for that single package;
their research-content and migration checksum assertions remain unchanged.

## Real build configuration, supplied after authorisation

Set WYBP_HOSTING_ENVIRONMENT=test, PUBLIC_APP_ORIGIN to the exact fixed private
Netlify test address, WYBP_NETLIFY_PROJECT_ID to its actual UUID,
WYBP_NETLIFY_CONTEXT=production for that test project's primary deployment,
WYBP_WORKER_NAME to the approved dedicated release Worker name, and
WYBP_WORKER_ORIGIN to its exact HTTPS workers.dev address. Then run
`npm run build:netlify-worker` locally. The command sets WYBP_DEPLOY_TARGET itself.
No wildcard/branch/deploy-preview hostname is accepted. Sites staging overrides
are rejected. Future production explicitly requires
WYBP_HOSTING_ENVIRONMENT=production and PUBLIC_APP_ORIGIN=https://classesforculture.com.
It must not be configured until the old website backup and cutover are approved.

All WYBP_FEATURE_* flags remain false, and all WYBP_REVIEW_* overrides remain off.
The new target fails the build if any are enabled. Existing readiness guards are
retained; bypassing them with fixture flags is not a deployment mechanism.

Each build creates outputs/netlify-worker/<release-id> containing separate client
and server directories, release.json, wrangler.json and netlify.toml. latest.json
is only a local pointer. The manifest hashes every shipped file. Public assets
are restricted to known extensions; HTML, arbitrary JSON, dot-directories, source
maps, server code, migrations, research evidence and credentials are not copied
to client. Preserve complete release directories for paired rollback.

Initial deployment is manual and separately authorised. Use the generated
netlify.toml with its release directory as the working directory; publish only
that directory's `client`. Do not deploy from the repository root or use `dist`
as a publish directory. The root netlify.toml deliberately points at an invalid
backend until an approved paired configuration is selected. Do not reconnect the
existing project's Git repository. Netlify static files take precedence; all
remaining paths go to the signed Worker proxy, never an index.html SPA fallback.

Before a later deployment, the local command
`node scripts/verify-netlify-release.mjs <release-directory> --deployable`
also requires CLOUDFLARE_ACCOUNT_ID (32 hex characters), the matching real
WYBP_NETLIFY_PROJECT_ID, runtime WYBP_NETLIFY_PROXY_SECRET and
WYBP_CONFIRMED_PRIVATE_PROJECT equal to the verified project UUID. It rejects
synthetic releases. This is a local safeguard, not proof of account permissions,
secret installation, remote access settings or resource inventory.

## Owner settings and resource inventory

Before creating anything, inspect existing Netlify projects, Workers, databases,
bindings, secrets and account permissions read-only. Reuse a matching authorised
test resource if it exists; stop on uncertain identity or populated storage.

Proposed names, availability unverified: Netlify `wybp-protected-test`; dedicated
Worker `wybp-test-<release-prefix>`; D1 `wybp-test`. Existing
`classes-4-culture-goldmindresourcery` and Worker `afri-track-proxy` belong outside
this test deployment. Supplied account b6b22a9a87b5758725e5c499782160af is not proof
of permissions or database ownership.

Netlify: private visibility for production deploys AND previews; owner only;
fixed test netlify.app address; no custom domain, Git connection or automatic
preview builds; Node 24.16.0 if a future approved build pipeline is configured.
Prefer Runtime scope for WYBP_NETLIFY_PROXY_SECRET; the isolated Personal-plan
exception below permits all scopes only with the stated manual-build boundary.
Verify signed-out access is denied for pages, assets and API routes.

### Authorised Personal-plan test deployment exception

For the isolated, owner-only Netlify test project, the proxy secret may be a
project-level **all-scopes** variable with its value limited to the **Production**
deploy context. It must never be a shared team variable. Production here means
the private test project's primary deployment, not a public launch.

This exception requires locally built, manually uploaded releases. Build and
verify the client/Worker pair before generating the signing secret. The build
process must never receive that secret through its environment, environment
files, configuration imports or command arguments. Install the matching Netlify
project variable and encrypted Worker secret in a separate short-lived process;
that process may run the deployable verifier but must not rebuild. Keep secret
values out of client files, release artifacts, Git, logs and reports.

Upload only the generated client directory from its paired release directory,
using `netlify deploy --no-build --prod --site <project-UUID> --dir client`.
Production and preview visibility must both be Private, with anonymous denial
verified against a content-free deployment before uploading application content.

Do not enable Git builds, Agent Runners, build hooks, `netlify build`, environment
imports or additional integrations without reviewing this boundary again.
All-scopes configuration does not prevent future hosted builds from receiving
the secret: the protection depends on keeping those execution paths disabled.
Runtime-only scoping remains the preferred approach before adopting Netlify-hosted
builds. Worker signature, claim, origin and expiry checks remain unchanged.

Cloudflare: generated release Worker config, nodejs_compat, ASSETS with
run_worker_first=true, IMAGES binding, and the generated non-secret identity vars.
Install the proxy secret separately as a Worker secret; never put it in JSON.
No D1/R2 binding is shipped initially. Later authorised DB-backed tests need a
separate test D1 and migrations 0000–0011 with committed checksums, applied only
after inventory checks. No seed/import is implied. R2 remains absent until needed
and separately approved. Direct Worker requests must remain unavailable without
a valid gateway signature, including assets and image endpoints. Logs must not
record credentials, raw bodies or identifiable retention/deletion histories.

## Later work and activation gates

* Wire production result/challenge repositories instead of review-only runtimes.
* Implement the missing distributed limiters (commerce/analytics currently fail
  closed), using atomic D1 operations or Durable Objects as appropriate. Preserve
  existing D1-backed limits and financial transaction guarantees. Do not rate-limit
  all players using the shared proxy IP or trust forwarded client IP headers.
* Add monitored bounded retention scheduling in the Worker before data features
  activate. Preserve 180-day official-completion streak expiry, immediate expiry/
  deletion unavailability and permanent removal within seven days. Financial
  retention has separate pending legal/support review; never apply streak deletion
  rules to wallet audit data.
* Replace Sites identity with reviewed, verified application authentication before
  owner tools can activate. Netlify's private-site login is not that replacement.
* Approve question import/publication, privacy/legal content, recovery, payment and
  support operations separately. Keep analytics, wallet and commerce disabled.

Private Netlify projects cannot receive ordinary third-party Stripe webhooks.
A later test-payment milestone should use a separately reviewed, narrowly scoped
test-only webhook ingress that verifies Stripe's raw-body signature and test mode
before any repository call. It must reject every other path and must not serve
the application or bypass its owner protection. The authenticated application
gateway remains unchanged. No such ingress, Stripe configuration or bypass is
implemented here. Signature and amount/currency/order/allocation reconciliation,
refund/dispute distinctions and idempotency remain mandatory.

## Authorised deployment and rollback sequence (future work only)

1. Inventory resources and back up the existing Classes for Culture website,
   configuration and DNS records before contemplating its replacement.
2. Confirm private test access, real identifiers and isolated storage boundaries.
   Provision only missing resources after separate authorisation.
3. Build/verify a paired release; install its runtime secret securely. Deploy the
   dedicated Worker first and prove direct unauthenticated access is rejected.
4. Deploy that pair's client assets and generated proxy configuration to the
   isolated private Netlify project. Verify live signing, HTTPS, headers, SSR/RSC,
   asset protection, latency, quiz answers and cross-owner/cross-origin denial.
5. Keep live payments, new flags, published questions and the live domain untouched.
6. Roll back by validating and restoring a preserved Netlify/Worker pair, including
   the corresponding runtime configuration/secret. Do not rebuild the old pair
   against changed dependencies, reverse migrations or restore financial data
   blindly. Keep the test project private throughout.

Local tests simulate the documented proxy. Live Netlify signing, private access,
Cloudflare permissions, Images service and deployment/rollback remain unverified.
