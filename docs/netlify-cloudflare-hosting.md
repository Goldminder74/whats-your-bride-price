# Netlify entry point with Cloudflare application server

This document defines the hosting contract. See [current handoff](current-handoff.md)
and its local checkpoint for deployment status; readiness notes below describe
the original local adaptation, not a claim about the latest live attempt.

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

The private test gate requires its HttpOnly access cookie on the classic image
answer POST. The browser uses `credentials: "same-origin"` together with
`mode: "same-origin"`; it does not send credentials to other origins. Server
Origin, Fetch Metadata and answer validation are unchanged. Both compiled-target
harnesses exercise the actual submission and assert its cookie, origin metadata,
authoritative response and visible answer reveal.

To reconcile a deployed client, save the authenticated deployment-specific file
list from `GET /api/v1/deploys/<deploy-id>/files` outside Git, then run
`node scripts/verify-netlify-client.mjs <release-directory> <file-list.json>`.
The observed Netlify API lowercases paths, including case-sensitive-looking
chunk filenames. The verifier rejects case collisions and compares every client
file's SHA-1 and size after validating the local SHA-256 release manifest. It
rejects unexpected entries except the CLI's `netlify.toml` configuration record.
This resolved the earlier 29 apparent mismatches: all 109 client digests matched.
Also verify live retrieval and navigation; metadata alone is not a browser test.

The first isolated Worker upload exposed a packaging defect: `no_bundle` uses
Wrangler's additional-module rules, whose defaults do not include JavaScript.
The release held 138 server modules, but only the entry module was uploaded;
Cloudflare rejected its first missing import with error 10021. The generated
config now explicitly collects `**/*.js` as ES modules beneath the server entry
directory. Server files remain outside the Netlify client directory.

Every Netlify/Worker build now runs Wrangler's actual `deploy --dry-run` package
step and compares every uploaded server module byte-for-byte with the release
manifest. `node --test tests/worker-package.test.mjs` covers static and dynamic
imports and proves the original configuration fails this check. It also runs
within `test:compiled-hosting`, so the aggregate gate includes it. To inspect an
existing release, run `node scripts/verify-worker-package.mjs <release-directory>`.

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
Personal requires omitting an explicit scope list in the environment API; the
default includes all four scopes. Its optional Secrets Controller marker rejects
the included post-processing scope, so this exception uses an ordinary project
variable. Owner-authorized UI/API access can read that value; never print it or
import it into a build. This does not expose it to anonymous visitors or client
files. Keep snippet injection and additional integrations unconfigured.
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

## Next milestone: local implementation; hosted activation pending

Starting source: `332e8edbce3eb374d3f873882244c0354db40903` on
`feature/viral-build-sprint`. The owner authorised local code, tests, commit/push
and both planning documents. This does not authorise hosted activation.
Deployed source remains `5959b4e1b21bc6fc7f667461ccd643b303cde18c`;
its private access, signing and mobile gameplay were previously verified.
The historical readiness statements above do not override that checkpoint.

### Implemented controls

`app/privateTestProfile.ts` restricts the data/payment profiles to the existing
private Netlify project `edee23f4-b86f-4975-8859-9c4be03ebbc0`, exact origin
`https://wybp-protected-test.netlify.app`, Worker `wybp-test-r001` at
`https://wybp-test-r001.ayo-m-ayeni.workers.dev`, and Cloudflare account
`b6b22a9a87b5758725e5c499782160af`. The generated release binds only
`wybp-test-d1-r001` as `DB`; its actual UUID must be supplied after provisioning.
R2 remains unbound. Release receipts bind the selected profile/flags to the actual
server entry and paired client checksums. No deployed database UUID is invented.

Default profile `off` keeps every optional feature false. Profile `data` enables
only `random_quick_play`; Cowrie enforcement remains off. Profile `payments` enables `random_quick_play`, `cowrie_economy` and
enables `commerce`. All other flags and all review overrides remain false.
Sites builds reject either private profile and retain their original configuration.
Runtime requires matching server-only profile, project, origin, Worker and `DB`.
Missing test payment settings or any live-mode setting fail closed.

Wallet, random selection/recovery/judgement, result persistence, Cowrie checkout
and Royal checkout/return use relative URLs, CORS mode, same-origin credentials,
no referrer and refused redirects. Existing Origin, Fetch Metadata, body,
ownership and ingress checks remain in force. Result saving has an idempotent
retry. Completed Cowrie attempts now match their results' exact 90-day deadline,
rather than retaining the earlier 24-hour incomplete-attempt deadline.
The D1 commerce projection uses the same canonical tier function/titles as the
quiz and Royal UI. Its earlier independent thresholds rejected valid score-3 and
score-6 entitlements; a real-completion regression now covers every score 0–12.

The commerce limiter shares atomic D1 admission across Worker instances:
20 requests per functional owner per minute, a separately hashed namespace,
bounded counters, 24-hour limiter-row expiry and denial on storage failure.
No IP header or analytics identity supplies authority.

The sole direct ingress exception is **POST
`https://wybp-test-r001.ayo-m-ayeni.workers.dev/commerce/stripe-test-webhook`**,
without query parameters or trailing slash. It requires the compiled payment
profile, matching runtime and `WYBP_TEST_WEBHOOK_ENABLED=true` (default false).
A maximum 65,536-byte unmodified UTF-8 body and Stripe HMAC signature with
five-minute tolerance authenticate before reconciliation or database access.
Live-mode events/configuration are rejected. Existing event allowlist,
price/link/order/allocation validation, replay protection, refund/dispute reasons
and atomic fulfilment remain intact. All other direct requests still require the
Netlify signature; no seed, owner, asset or image exception exists.

### Proposed D1 and operator sequence — do not execute yet

Create one isolated D1 named `wybp-test-d1-r001` after checking for duplicates,
then obtain its real UUID. Bind it only to the existing test Worker. Build locally
without credentials or credential-bearing `.env*` files; retain separate runtime
secret installation and manual no-build Netlify upload. Never connect Git builds
under the Personal-plan exception.

Build configuration is `WYBP_PRIVATE_TEST_PROFILE=data` (then `payments`),
`WYBP_TEST_D1_DATABASE_ID=<actual UUID>`, the exact identity variables above,
`WYBP_HOSTING_ENVIRONMENT=test`, `WYBP_NETLIFY_CONTEXT=production`,
`PUBLIC_APP_ORIGIN=<exact private origin>`, `WYBP_WORKER_NAME`,
`WYBP_WORKER_ORIGIN`, `WYBP_NETLIFY_PROJECT_ID`, and only the profile's explicit
`WYBP_FEATURE_*` flags. Run `npm run build:netlify-worker`; inspect and verify
the generated `outputs/netlify-worker/<release-id>/wrangler.json`. It has no cron,
and both `WYBP_TEST_RETENTION_ENABLED` and `WYBP_TEST_WEBHOOK_ENABLED` are false.

The twelve migrations and their hashes are recorded in the publication proposal
and `drizzle/migration-checksums.json`. The 8 October retention adaptation adds exactly one local migration `0012_retention_authority.sql`; hosted migration approval must cover all 13 checksums. The immutable catalogue proposal remains based on its original 12-migration schema, while remote operator apply separately requires the current runtime `--approve-schema` fingerprint.
All twelve were rehearsed against local D1, including table rebuilds and triggers.
After separate hosted approval, with the verified target config:

```powershell
node scripts/data-migrations.mjs --dry-run
node node_modules/wrangler/bin/wrangler.js d1 migrations list DB --remote --config <verified-release>/wrangler.json
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config <verified-release>/wrangler.json
```

Archive the actual ordered application log and checksum attestation outside Git.
Wrangler's `d1_migrations` ledger records names, not SQL checksums. The operator
also checks the complete expected application schema fingerprint and foreign keys,
rejecting unknown or partial migration state before catalogue writes.

Regenerate evidence to a fresh directory **outside Git**:

```powershell
node scripts/prepare-launch-readiness.mjs --output <fresh-evidence-directory>
node scripts/private-test-catalogue.mjs --evidence <directory> --operation seed
node scripts/private-test-catalogue.mjs --evidence <directory> --operation import --region west
node scripts/private-test-catalogue.mjs --evidence <directory> --operation publish --region west
```

Repeat the latter dry runs for east, central, north and south. Without `--apply`,
these are offline validations and perform no network or database writes. They
validate current evidence, not fabricated new review dates. Seed requires empty
catalogue or all five/sixty exact canonical rows; partial/conflicting seed stops.
Do not rerun seed after extra questions have been imported. Imports accept only
an empty regional proposal or a complete exact prior import; partial sources,
question rows or proof stop. Publication is separate and idempotent; published
sources/questions are never rewritten. Each seed/region operation is one atomic
D1 API batch, with preconditions inside the transaction and no new schema.

After exact target/publication approval only, the operator's separate process
may use `CLOUDFLARE_API_TOKEN` (target account's D1 read/write permissions) and
`WYBP_TEST_D1_DATABASE_ID`, adding `--remote --apply --approve-target <UUID>
--approve-manifest <proposal SHA-256>`. The API checks account/UUID/name,
the twelve-entry ledger, exact schema and foreign keys before one batch.
No browser/admin endpoint or public seed secret is added.

### Exact question proposal and evidence preservation

`data/question-bank/launch/publication-manifest-v1.json` is the proposed allowlist:
18 exact IDs/versions per region, all 90 content/bundle/pack/source-record hashes,
evidence locators/URLs, original provenance, migration hashes and hashes of all
12 reproducible outputs. The canonical five-edition/sixty-question seed checksum
is `91ed04fcc134fa53d14a8694eedb04ca7fafb0cbf45c11b07b0d2eff17f8da6a`;
`app/gameData.ts` remains hash
`3ce3474de2e6b072bf4e893fc2760c8b9ba996a889697ec5ac15f631cc05c74d`.

Proposed transitions: import exact evidence-qualified copies as **draft**, source
administration **approved**, with immutable `machine_evidence_v1` proof and null
human reviewer; separately publish only approved manifest versions in test D1.
Local rehearsals verify the real selector sees 12 before publication and **30 per
region** afterwards. At evidence expiry/revocation eligibility falls immediately;
commerce readiness then fails below threshold. Ten reserves stay out of import
and publication. All 352 original research-file records remain byte-exact drafts.

**Identity resolved:**
The original Cidade Velha research identity remains unpublished. The distinct
launch identity is `west_e_897218520e14659da149e286@1`; its hash-bound
`draftProvenance` refers to the original draft and explicitly acknowledges the
single intentional ancestor match. Local machine checks do not represent human
cultural approval. All 352 original identities and the ten original reserve IDs
remain excluded. The operator now refuses any original-draft publication rather
than accepting an override. See the [policy](machine-evidence-question-policy.md#authorised-cidade-velha-launch-derivation-5-october-2026).

Before any hosted import/publication, place the twelve regenerated outputs,
proposal, source-builder revision, five immutable research-pack hashes, policy
and migration attestation in an owner-controlled durable archive and a second
independent backup. Verify every proposal `reproductionFiles` hash in both copies,
record locations/receipt outside Git, and rehearse reproduction from the pushed
commit into a fresh directory. Structured source records are durably preserved in
Git's builder and research packs; the new generated output directory is temporary,
not a durable archive. Original raw research captures and their independent backup
remain unverified; preserve them unchanged and inventory/hash/archive them where
available. Do not claim structured summaries are full source captures. Question
proof expires/requires recheck **20 March 2027, 21:00 UTC**.

### Retention and Stripe test settings

The compiled `scheduled()` handler requires the matching private runtime and
`WYBP_TEST_RETENTION_ENABLED=true`; packaging installs no trigger. Proposed test
cron after approval: `*/15 * * * *` (UTC), test Worker only. Each run processes
at most 50 unissued debits, 50 expired bonus wallets (one credit per wallet),
50 records in each limiter/streak/result/attempt bucket and 50 expired webhook
records. Monitor aggregate counts and backlog; increase frequency within approved
budget if needed to meet the seven-day streak removal rule. No identifiers or
identifiable deletion logs are emitted. Visits/practice/sharing never extend time.

Authority expires immediately: incomplete play 24 hours; completion/result 90
days; bonus credit 180 days; official streak 180 days with physical removal within
seven days; webhook evidence 400 days. Clearing a streak removes it immediately.
Technical reversal is limited to expired, unissued, active-wallet funded attempts.
Purchased Cowries never expire; frozen wallets and immutable financial references
remain preserved. Permanent wallet/ledger/allocation/order/support deletion and
physical removal deadlines for retained attempt/answer/result rows are **not
approved**. This job implements access expiry and known deletions only; owners
must approve the remaining financial/privacy/support policy before public use.

Configure test Payment Links on the Worker, separately from builds:

| Product key | Quantity | GBP amount (minor) | Return path |
|---|---:|---:|---|
| `royal_reveal_v1` | 1 | 199 | `/royal-reveal/return` |
| `cowrie_5_v1` | 5 Cowries | 199 | `/cowries/return` |
| `cowrie_15_v1` | 15 Cowries | 499 | `/cowries/return` |
| `cowrie_40_v1` | 40 Cowries | 999 | `/cowries/return` |

Royal variables: `STRIPE_PAYMENT_LINK_URL`, `STRIPE_PAYMENT_LINK_ID`,
`ROYAL_REVEAL_PRODUCT_KEY=royal_reveal_v1`, `ROYAL_REVEAL_AMOUNT_MINOR=199`,
`ROYAL_REVEAL_CURRENCY=GBP`, `STRIPE_EXPECTED_LIVEMODE=false`.
For each uppercase Cowrie product prefix, configure `_PAYMENT_LINK_URL`,
`_PAYMENT_LINK_ID`, `_PRODUCT_KEY`, `_QUANTITY`, `_AMOUNT_MINOR`, `_CURRENCY=GBP`,
`_LIVEMODE=false` from the table. Links must be HTTPS `buy.stripe.com` test links,
one-off, fixed Checkout quantity 1, no coupons/promotion codes, optional items,
shipping, adjustable quantities or automatic tax that changes the expected total.
Cowrie quantity is the digital fulfilment allocation, not Checkout line-item count.
Return URLs use the exact private origin; forward only opaque `client_reference_id`.
Do not expose owner credentials, question answers or result slugs to Stripe.

Store only `STRIPE_WEBHOOK_SIGNING_SECRET` as a Worker secret for the exact test
endpoint; Netlify's existing proxy secret remains separately installed on both
sides. No Stripe account API key is required by this Payment Links integration.
Subscribe only to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`charge.refunded`, `charge.dispute.created`. Pin/test a supported event API version
with actual payloads in the chosen sandbox; its currently configured version and
identifiers are not yet known. Local signed fixtures do not prove live Stripe
compatibility. All subscriptions must be test-mode; no live secret/config/event
is allowed. Immediate-delivery consent and draft legal notices remain intact.

### Remaining hosted gates and rollback

Owner approval is still needed for provisioning/name/budget, the exact manifest, durable evidence receipts, test sandbox and four link
IDs/URLs/signing-secret installation, retention/support rules, and isolated
migrations/import/publication/cron/feature deployment. No settings were changed.

Sequence: inventory/provision/attest the empty test DB; apply twelve migrations;
verify/archive evidence; seed/import/publish only approved identities; deploy a
matched **data** pair privately; check real replay, recovery, two free plays,
bonus/purchased debit boundaries and cross-owner/rate limits; then install test
payment configuration, approve the **payments** pair and exact webhook/cron
activation. Test Royal and all bundles, actual signatures, async/failure/cancel,
duplicates/concurrent delivery, partial/full refund/dispute allocations, mobile
returns and usable downloads. Verify anonymous denial, all other direct Worker
paths/asset denial, RSC navigation and release identity. Keep analytics, owner,
daily/streaks, dynamic publishing and every other feature off.

Rollback: restore the previous matched all-off private pair, disable only the new
test webhook/cron and retain isolated D1/audit history for reconciliation. Never
reverse migrations or delete/restore financial data blindly. Existing websites,
DNS, Sites, other Workers, staging/stash and PR #1 remain untouched.

References: [D1 atomic batches](https://developers.cloudflare.com/d1/worker-api/d1-database/),
[D1 operator batch API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/),
[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[UTC cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
[Stripe webhooks](https://docs.stripe.com/webhooks),
[Payment Link returns](https://docs.stripe.com/payment-links/post-payment).

### Self-contained audit archive and independent preservation

`scripts/archive-launch-evidence.mjs` packages the complete 90-question proposal,
180 structured question/source records, all twelve deterministic output files,
research inputs (including original draft/review/source-register files), source
code, policy, unchanged migrations and per-file SHA-256 checksums. It rejects
missing/tampered captures, unlisted files and unsafe paths. Reproduction is tested
from the included source snapshot without installed dependencies for the offline
builder. No credentials, runtime configuration files, hosted data or generated
application builds enter this archive.

Prepared local artefacts live under ignored `outputs/activation-preparation/`,
not in temporary storage or a public/client directory. The ZIP sidecar hashes the
whole container; `checksums.json` inside hashes every payload except itself.
Source/manifest/scripts/research inputs are preserved in GitHub after this commit.
The generated ZIP and current source-page bodies are local only: OneDrive sync,
external storage and an independent backup have **not** been verified.

Current source bodies are supplemental, timestamped separately from the historical
21 September inspection. The inventory distinguishes captured HTTP bodies from
transport/HTTP failures; a response is not proof of fact accuracy, and dynamic or
linked documents may need manual inspection. No source is requalified and no
expiry is extended. Original historical raw captures were not located in the
checked working-output/temp locations and remain unverified; never label current
captures as their replacement. Restore those captures where available and resolve
missing source bodies before claiming independently complete source audit.

Regenerate outside the repository; then prepare a fresh archive directory:

```powershell
node scripts/build-machine-evidence-question-bank.mjs --output <outside-repository-evidence>
node scripts/archive-launch-evidence.mjs --evidence <outside-repository-evidence> --output <fresh-local-archive-directory> --capture-cache outputs/activation-preparation/current-source-captures
```

The optional `--capture-current --capture-cache <fresh-cache-directory>` command
reads public source pages only, without cookies or account credentials. It never
imports or publishes questions. Back up the completed ZIP and SHA-256 sidecar to
an owner-controlled location independent of this machine/OneDrive folder. Read
both copies back, verify the ZIP hash, extract and verify every payload, and record
location/date/checksum receipts outside Git. Until this happens, backup status is
unverified. Keep audit/source captures out of Netlify's client upload directory. For a
fresh GitHub reproduction clone, use `git -c core.autocrlf=false clone` so byte
checksums are not changed by checkout newline conversion. Archive extraction
already preserves exact bytes.

### Exact owner Stripe sandbox setup — instructions only, do not execute yet

These steps require later hosted/Stripe approval. No account settings were read
or changed here. Current official instructions: [sandbox management](https://docs.stripe.com/sandboxes/dashboard/manage),
[Payment Links](https://docs.stripe.com/payment-links/create),
[after-payment redirects](https://docs.stripe.com/payment-links/post-payment),
[URL correlation](https://docs.stripe.com/payment-links/url-parameters),
and [webhook registration/signatures](https://docs.stripe.com/webhooks).

1. Inventory existing sandboxes first. In Stripe's account picker, select **Switch
   to sandbox → Manage sandboxes** and reuse the intended isolated sandbox if it
   exists. Otherwise, after approval, **Create sandbox**, name it `WYBP Private
   Test`, and choose **Create an account from scratch** rather than copying live
   settings. Verify the sandbox banner every time. Do not create a connected
   account, enable live mode or change the live business. Your role must permit
   sandbox management; actual permission has not been checked.
2. In that sandbox open **Payment Links → +New**, choose/add a fixed-price product,
   and create these four **one-off GBP** prices/links. Keep their non-secret
   `price_`/`plink_` IDs and `https://buy.stripe.com/test_...` URLs in a private
   operator configuration receipt. The application's product key is the mapping
   below, not a fabricated Stripe product ID.

| Application key / suggested sandbox product | Exact one-off price | Checkout quantity | Digital fulfilment | Exact After the payment → Redirect URL |
|---|---:|---:|---|---|
| `royal_reveal_v1` / Royal Reveal Pack | GBP 1.99 (`199`) | 1 | One result-bound Royal Reveal | `https://wybp-protected-test.netlify.app/royal-reveal/return` |
| `cowrie_5_v1` / 5 Cowries | GBP 1.99 (`199`) | 1 | 5 purchased Cowries | `https://wybp-protected-test.netlify.app/cowries/return` |
| `cowrie_15_v1` / 15 Cowries | GBP 4.99 (`499`) | 1 | 15 purchased Cowries | `https://wybp-protected-test.netlify.app/cowries/return` |
| `cowrie_40_v1` / 40 Cowries | GBP 9.99 (`999`) | 1 | 40 purchased Cowries | `https://wybp-protected-test.netlify.app/cowries/return` |

3. Keep line quantity fixed at **1**. Disable adjustable quantities, customer-chosen
   amounts, subscriptions, trials, optional items, discounts/promotion codes,
   shipping and automatic tax that changes the expected total. Use card payments
   initially; do not enable delayed methods that can settle beyond the application's
   unchanged 30-minute authority. Do not collect optional names/phone/address/tax
   IDs/custom fields. Stripe may collect its own checkout email; the app must not
   copy it into D1. Do not enable receipt/invoice/custom automations or substitute
   live terms. The app's deliberate immediate-delivery consent remains separate
   and unchecked by default. No tax policy for public launch is decided here.
4. Use the exact redirect URLs above: no `{CHECKOUT_SESSION_ID}`, owner credential,
   result slug, email or marketing parameters. The app alone appends the opaque
   `client_reference_id` to the Payment Link; do not hard-code it. This matches
   server-owned orders. A return URL/query value is never proof of payment.
5. Configure the Worker variables from the existing **Retention and Stripe test
   settings** section, using actual four link IDs/URLs and `false` for every
   livemode field. Royal uses `STRIPE_PAYMENT_LINK_*`; Cowries use uppercase
   `COWRIE_5_V1_*`, `COWRIE_15_V1_*`, `COWRIE_40_V1_*`. Product, quantity, GBP and
   minor amount must match the table. These non-secret settings are installed
   separately from the secret-free build; no Stripe account API key is required.
6. After the approved payments Worker is ready, in sandbox **Workbench → Webhooks
   → Create an event destination**, select **Your account**, **snapshot events**
   (not thin events), and an explicitly recorded stable API version. Select only
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `charge.refunded`,
   `charge.dispute.created`. Choose **Webhook endpoint** and the exact URL
   `https://wybp-test-r001.ayo-m-ayeni.workers.dev/commerce/stripe-test-webhook`.
   No query or trailing slash; no Netlify owner login. The actual sandbox API
   version is unknown: verify full `data.object` payloads and the expected
   session/link/intent/amount/currency fields before activation; unsupported shapes
   must stop, never relax validation or silently upgrade dependencies.
7. Install the endpoint signing secret through Cloudflare Dashboard **Workers &
   Pages → wybp-test-r001 → Settings → Variables and Secrets → Add → Secret**,
   named `STRIPE_WEBHOOK_SIGNING_SECRET` ([Cloudflare secret controls](https://developers.cloudflare.com/workers/configuration/secrets/)). The owner transfers it directly from
   Stripe's signing-secret control into that secret field; never paste it into
   chat, source, shell arguments, `.env`, screenshots or logs. Do not use a CLI
   listener secret or a live endpoint secret. Keep the existing Netlify proxy
   secret unchanged. Installation and any resulting Worker update still require
   hosted approval; `WYBP_TEST_WEBHOOK_ENABLED` remains false until separately
   authorised. Keep secrets absent from build/upload processes.
8. Once activation is approved, start orders from the private app, use Stripe's
   documented test cards (never a real card), check signed delivery/one fulfilment,
   duplicate delivery, cancellation/failure, mobile return and downloads. Test all
   four products, full/partial refund and dispute distinctions and frozen-wallet
   boundaries. Confirm live events and unsigned/direct non-webhook requests fail.
   An uncorrelated Dashboard sample event does not prove order fulfilment. Keep
   all other features and public/live payments disabled.

See [approved retention and private restore operations](retention-operations.md).

### October owner decisions and preparation update

Seller now confirmed as Ayodele Ayeni, UK sole trader, trading as Classes for Culture, not VAT registered; support team@classesforculture.com. Sherwood/Wigsmi Stripe is excluded. Current [seller/four-product instructions](stripe-payment-link-setup.md), [owner-approved retention policy](retention-schedule.md#owner-approved-rules--not-activated), [source capture reconciliation](launch-source-capture-reconciliation.md), [private backup steps](launch-evidence-backup.md) and [exact approval package](isolated-test-approval-package.md) supersede the earlier unresolved-owner/preservation status above. Original archive remains immutable; recovery supplement is separately checksummed. Nine source gaps affect 13 proposal questions, so publication readiness is still held. No independent backup or hosted/Stripe change claimed.


### 8 October retention compatibility update

The six policy rules and authoritative closure definition are owner-approved and
implemented locally, not professionally signed off or hosted. Before a data/payment
profile can serve content or run maintenance, independently review suppression,
active holds/cases/closures and financial reconciliation, install the D1 receipt,
then set matching `WYBP_RESTORE_RECEIPT_SHA256` in the separate Worker runtime.
It is a non-secret receipt hash, not browser-selected configuration. Missing or
stale receipt fails closed. Disable access/cron and remove that runtime hash before
any privileged D1 restore; never rely on the restored database to certify itself.
See [private operations](retention-operations.md) and [current activation gates](isolated-test-approval-package.md),
which supersede historical readiness statements above. Existing websites and cloud
resources are unchanged; operational restore custody/provider tests and the eight
question evidence holds still prevent blanket activation readiness.

### Owner-approved catalogue/replay activation � 8 October 2026

The owner approved exact v2 manifest
`4b6883d08e9efceb336ab333bab0e67e0219d107693ec85b99757170dff8c22d`,
unchanged migrations 0000�0012, canonical seed, exact 90 imports/publications and
private random replay within existing plan allowances. No new charge/upgrade,
Cowrie enforcement, commerce, cron, live payments or public deployment is approved.
The live operator now checks the immutable v2 file AND regenerated manifest against
a fixed hash before any dry run/apply; `--write-manifest` is rejected. Historical
v1 remains for archive reproduction only. `data` profile enables random replay
alone; use `WYBP_FEATURE_RANDOM_QUICK_PLAY=true`, all other feature flags false.
The existing `payments` profile retains Cowrie/commerce for its separate future gate.

Cloudflare OAuth identity verified as ayo.m.ayeni@gmail.com in exact account
`b6b22a9a87b5758725e5c499782160af`, but current scopes have no `d1:write`.
D1 inventory returns authentication error 10000, so DB existence/state, current
allowance headroom and UUID are unverified. No creation/write may precede inventory.
A scoped Wrangler refresh must retain existing user:read, offline_access,
account:read, workers:write and workers_scripts:write and add ONLY d1:write.
OAuth is account-level; restrict actual operations to the isolated named database.
Never use Wrangler's unqualified default login (which requests unrelated scopes).
An owner manual alternative from this repository is:

```powershell
node node_modules/wrangler/bin/wrangler.js login --scopes user:read offline_access account:read workers:write workers_scripts:write d1:write
```

Complete authentication in Cloudflare directly; no token/secret belongs in chat.
Then recheck plans/usage, database inventory/empty state, Worker identity and private
Netlify access before approved operations. Offline runtime schema fingerprint:
`5d45ee35ee5e5cce814d5d4659418324f1bb4fde9657a5f893dbc6640122c9c4`.
All 11 catalogue dry runs pass; this is not a hosted migration/catalogue receipt.

Rollback remains the previous verified matched all-off private client/Worker pair,
source `5959b4e1b21bc6fc7f667461ccd643b303cde18c`; disable only test data profile
on failure and preserve the database/audit history. Do not reverse migrations,
erase accounting, change existing sites or expose a failed replacement. Missing
external restore receipt must continue to fail closed, even with cron disabled.
