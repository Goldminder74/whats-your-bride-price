# D1 and R2 binding readiness

## Observed state

The actual target is the existing public ChatGPT Sites project currently live at `https://brideprice.classesforculture.com`. Its opaque platform identifier remains only in `.openai/hosting.json` and is intentionally omitted from documentation. Repository configuration contains `"d1": null` and `"r2": null`. Vite therefore injects no local D1 or R2 binding, and the project has no active preview URL.

A read-only Sites database overview on 23 August 2026 returned no live D1 binding and no tables. The available inspection interface does not expose an equivalent R2 bucket overview. R2 is therefore confirmed absent from repository, build and runtime code configuration, with no source evidence of a live bucket, but it was not independently enumerated in the hosting control plane. No remote storage, access, version or deployment setting was changed.

The data model, migration and tests are inactive local infrastructure. The application has no durable write endpoint and the unbound repository throws instead of using browser storage for authoritative records.

## Preview D1 activation gate, 23 August 2026

The owner approved a preview-only resource request for database name `wybp-preview`, application binding `DB`, and development/preview testing of results, challenges and referrals. The gate stopped before provisioning.

Read-only checks confirmed that the current live Sites deployment has no D1 bindings or tables, the repository still declares `d1: null` and `r2: null`, and the Sites project has no current preview URL. The available Sites control-plane interface can inspect a D1 database already bound to the live deployment, but it does not expose account-wide D1 resource inventory, D1 resource creation, or an environment-scoped preview-only binding operation. Same-project preview isolation therefore could not be proven: the interface cannot prove that the proposed resource name is unused or guarantee that a new `DB` binding would be isolated from production.

No database or bucket was created, no binding was changed, no migration or seed was run, and no repository hosting configuration was changed. Production remains unbound.

The required manual platform action is for an authorised Sites control-plane operator to:

1. provide a read-only account-level D1 inventory proving that `wybp-preview` is unused;
2. identify or create a distinct preview environment that does not modify the current live deployment;
3. create exactly one empty D1 database named `wybp-preview`;
4. bind it as `DB` to that preview environment only;
5. confirm the live deployment still has no D1 binding and that creating the resource required no production deployment; and
6. provide an approved preview-only migration connection or execution surface that identifies the target unambiguously without exposing credentials in source or documentation.

Only after all six items are evidenced may the approved migrations and deterministic development seed be applied. If Sites cannot provide that isolation, D1 activation remains blocked. Because no resource was created in this gate attempt, no cleanup is currently required. For any future preview resource, rollback must first remove the preview-only binding, verify production remains unbound, and delete the preview database only under separate explicit deletion approval.

At this historical checkpoint Prompt 9 remained blocked. The recommended next option was a separately created, owner-only staging Site with its own isolated D1 database and no connection to the live public Site. The live public Site must remain untouched, unbound and undeployed throughout that staging exercise.

### Isolation resolution, 23 August 2026

The recommended separate environment now exists as **What’s Your Bride Price Staging** at `https://whats-your-bride-price-staging.ayo43077.chatgpt.site/`. It uses custom restricted access protected by sign-in, permits the owner only, and remains subject to normal workspace-administrator oversight. It has an isolated empty D1 database bound to the application as `DB`, with zero tables. R2 is null and no custom domain is attached.

This resolution does not alter the historical reason the same-Site preview attempt was blocked. The live Site at `https://brideprice.classesforculture.com` remains separate, unbound and unchanged. No production data was imported, and no migration, seed or public write was run. Migrations and the deterministic development seed still require the next explicit approval. At this checkpoint Prompt 9 was paused pending staging source association and saved-build validation without deployment.

## Prompt 9 local migration status, 24 August 2026

Migration `0002_little_inertia.sql` is an additive local source artefact only. It adds nullable SHA-256 verifier columns and unique partial indexes for challenge creation idempotency and revocation. Isolated SQLite tests cover a new database, an upgrade from migrations `0000` and `0001`, repeated runner execution, historical-row preservation, nullable historical values and non-null uniqueness. No hosted database was contacted, migrated or seeded. The live manifest remains unbound, the restricted staging database was not accessed, and activation still requires a separately approved hosted migration gate.

Migration `0003_clever_joshua_kane.sql` is the separately approved Prompt 11 local source artefact. It adds nullable `recipient_subject_hash` and `official_result_id`, plus the non-null integer boolean `is_official_comparison` defaulted to `0`, to `challenge_attempts`. `challenge_attempts_official_recipient_uq` now claims `(challenge_id, recipient_subject_hash)` wherever the durable marker is `1`; `challenge_attempts_official_result_uq` remains partial on non-null `official_result_id`. Integrity triggers require an authoritative subject and matching result for the first claim, make the marker and subject immutable, prevent result replacement and allow only the foreign-key-compatible transition to a null result. Its SHA-256 checksum is `3eb81a835dcff39f8bc796483b2ca7de1a8f1c29dd218e5c43779f7edcc31fdb`. Isolated tests cover empty and upgraded databases, repeat execution, historical marker `0`, replay marker `0`, concurrency, immutable claims, result deletion, replacement rejection and neutral unavailable comparison. It has not been applied to staging or production. D1 and R2 remain inactive.

Migration `0004_yellow_bill_hollister.sql` is the separately approved Prompt 14 local source artefact. It adds only `results.visibility` as `TEXT NOT NULL DEFAULT 'private'` with `CHECK (visibility in ('private','public'))`. Its SHA-256 checksum is `c649185f96cdce28aca0522330649b4688c9f1da93ea6eab0c08842b163b65bc`. Empty, upgraded and repeated isolated migration runs prove historical active results remain intact and private. It has not been applied to staging or production.

## Proposed owner decision

If durable work is later approved, the proposed logical bindings are:

- D1: `DB`
- R2: `MEDIA`

These are proposals, not active bindings. An owner must approve the names, provision isolated preview resources through the Sites control plane, inject the approved logical values into `.openai/hosting.json`, regenerate or confirm Cloudflare environment types, and run the migration gate against preview only. Production resources and migrations require a separate approval after preview verification.

## Readiness gate

1. Create separate preview D1 and R2 resources through Sites, never ad hoc production resources.
2. Confirm the control plane's exact logical binding convention and resource audience.
3. Update configuration only with returned approved values.
4. Confirm `env.DB` and `env.MEDIA` are present in the preview Worker.
5. Run migration checksum, empty database, repeat application and synthetic seed verification.
6. Do not seed production automatically. The development seed is an explicit local/preview operation.
7. Add authenticated, rate-limited server endpoints only in later prompts. Client-submitted scores are never authoritative.
8. Export preview data before rehearsing compensating migrations.
9. Obtain separate production migration and deployment approval.
10. Keep commerce disabled on Sites. Prompt 17's local commerce model requires a separately approved commerce-capable host, production D1 and rate limiter; it cannot activate against the current null bindings.

## Prompt 17 local commerce migration status, 26 August 2026

Exactly one additional local migration exists: `drizzle/0006_regular_paibok.sql`. It additively creates only `commerce_orders`, `commerce_entitlements` and `stripe_webhook_events`, with explicit foreign keys, controlled checks, replay/idempotency uniqueness, bounded retention/deletion fields and necessary lookup indexes. Migrations `0000` through `0005` remain byte-identical. Empty, upgrade and repeated-ledger tests run against isolated temporary SQLite files only.

Migration `0006` has not been applied to staging or production. `.openai/hosting.json` remains unchanged with D1 and R2 null. Activation requires the twenty manual gates in `docs/stripe-payment-link-setup.md`, including separate production D1 approval, explicit migration application, independent rate limiting, test-mode payment/refund/dispute evidence and a later live-mode approval.

## R2 contract

Only generated, expressly approved result media may later use R2. Metadata lives in `media_assets`; object bytes use `generated/{edition}/{YYYY}/{MM}/{sha256}-v{generation}.{extension}`. Object keys cannot contain names, emails, original filenames, raw sessions, queries or secrets. Private uploaded photos stay on-device and do not become public media by default.

Prompt 14 implements an inactive R2 adapter, D1 metadata repository and isolated in-memory review adapter. `dynamic_results` fails the build when enabled without both durable bindings unless both authorised review-build controls are present. Neither binding is activated in `.openai/hosting.json`; no bucket, hosted object, D1 row or hosted migration was created. Publication prepares media during the explicit owner mutation, while public page, metadata and crawler GETs only read an existing ready asset. The mutation accepts the existing raw anonymous-session credential only in its same-origin POST body, derives the domain-separated subject hash on the server and compares it in constant time with the unexpired authoritative attempt. A copied stored hash cannot authorise the mutation.

Prompt 8 makes that boundary executable: original and sanitised private-photo bytes never enter a repository contract, Worker request, public projection or media key. Public media may resolve only an allowlisted stable avatar ID plus approved regional and result fields. A local photo may be composed only after the player deliberately selects Download or the operating-system file share.

## Deletion and anonymisation activation gate

`db/deletionReadiness.ts` is an inactive, synthetic service contract. It uses a one-time 256-bit bearer token, stores only a record-bound SHA-256 verifier, expires credentials after 30 days, supports rotation, uses constant-time comparison and returns non-enumerating outcomes. `deletionEndpointActive` is deliberately `false`; the Worker has no deletion route.

Before any endpoint can be activated, all of the following need separate approval and preview evidence:

1. an approved and isolated D1 binding with a concrete repository implementation;
2. bearer-token verification or authenticated subject/owner authorization, with raw tokens never persisted or logged;
3. rate limiting and abuse controls that do not create an advertising identifier;
4. CSRF analysis for any cookie-authenticated control, plus origin and method enforcement as applicable;
5. atomic revocation of public projections and later R2 media where relevant;
6. idempotent deletion/anonymisation, target binding, expiry and credential-rotation tests;
7. sanitized audit outcomes with no token, display name, photo, filename or unrelated-record existence disclosure;
8. approved retention rules identifying integrity, security and non-identifying aggregate records that may remain;
9. isolated preview integration, rollback and export tests; and
10. separate production migration, endpoint and deployment approval.

## D1 atomicity

Cloudflare D1 `batch()` is the planned atomic write primitive. Prepared statements in a batch execute sequentially and the full batch aborts or rolls back if one fails. The repository contract reserves this for the six multi-row integrity operations documented in `db/repositories.ts`. No claim is made that those writes are active while D1 remains unbound.

## Prompt 16 local analytics migration status, 26 August 2026

The owner approved exactly one additional local migration: `drizzle/0005_special_gamma_corps.sql`, SHA-256 `a13ac6180fa745732266fc922f89d2cd1e10f5f9c88d90e4f310ff833b09701d`. It transactionally rebuilds only `analytics_events`, `referral_events`, `share_events` and `consent_preferences`; preserves legacy rows at schema version 0; verifies copy counts and foreign keys; adds nullable client UUID/session-hash fields, version-1 constraints, indexes and cross-table replay triggers; and rolls back completely on failure. It has not been applied to staging or production.

Analytics remains unavailable while `.openai/hosting.json` has `d1: null`. A future binding decision must be followed by separate explicit migration approval and verification, an approved independent rate limiter, retention scheduling and deletion planning. R2 is not required for analytics and remains null. Review fixtures are local-only and cannot establish hosted readiness.

## Prompt 18 owner dashboard readiness, 27 August 2026

The dashboard and aggregate CSV are local source only. `owner_dashboard` is false by default; `.openai/hosting.json` remains `d1: null` and `r2: null`; and no report table exists. Prompt 20 later added the separate local-only question-bank migration `0007_ancient_yellow_claw.sql`. A missing D1 binding returns a neutral authorised unavailable state and never falls back to browser data.

Activation requires: approved D1 binding and migration state through `0006`; `WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS` containing reviewed stable Sites subject IDs; verified dispatch-only ingress and private Sites/workspace access policy; a separately approved distributed CSV limiter; verified private no-store edge behaviour; retention ownership; and the complete Prompt 18 test gate. Review fixtures and the local in-memory export limiter are not production readiness evidence. R2 is not needed.
## Prompt 19 privacy-control readiness, 31 August 2026

At its own checkpoint, Prompt 19 added browser privacy controls, a public-safe storage inventory and draft legal routes without a schema change. Prompt 20 later added the local-only `0007` question-bank migration. `.openai/hosting.json` remains `d1: null` and `r2: null`; no hosted database, object store, migration, seed or retention process was accessed or activated. Production still requires every gate in `docs/legal-content-activation-checklist.md`, explicit binding and migration approval, and a separate deployment approval.

## Prompt 22 daily and streak readiness, 6 September 2026

Exactly one additional local migration, `0008_simple_nocturne.sql`, adds daily scoring/selection authority, attempt play mode and daily linkage, official-completion uniqueness, bounded operation-limit storage and the authoritative streak qualification timestamp. It is additive and preserves every version-1 historical row. Version-gated triggers reject invalid new daily authority, play modes and any Prompt 22 streak whose expiry is not exactly 180 days after qualification.

The `daily_challenge` and `streaks` flags remain false. Activation requires both flags to be deliberately configured, approved D1 through migration 0008, a cryptographically strong server-only `WYBP_DAILY_SECRET`, same-origin POST enforcement, operational rate limiting, a UTC scheduler that invokes the bounded expiry purge within seven days, and completed privacy and legal review. No hosted migration, seed, feature activation or deployment is part of Prompt 22.

## Workstream C Cowrie readiness, 9 September 2026

Migration `0009_clammy_shooting_star.sql` is local source only. It creates exactly `cowrie_wallets`, `cowrie_ledger` and `cowrie_purchase_allocations`, adds no payment, webhook, analytics or user-profile table, and leaves `.openai/hosting.json` unchanged. Append-only triggers reject ledger mutation, reject inactive or negative-balance writes, and reconcile the separate purchased and bonus wallet caches after every ledger insert.

Activation requires approved D1 through 0009, both `random_quick_play` and `cowrie_economy`, at least 30 eligible published questions in the selected region, distributed rate-limit review, privacy, legal and customer-support approval, refund and dispute implementation, retention scheduling, isolated preview evidence and a separate deployment decision. Local review fixtures require all of `WYBP_REVIEW_BUILD=true`, `WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES=true` and `WYBP_REVIEW_COWRIE_FIXTURES=true`. They do not prove hosted readiness.

The single local migration 0009 also adds only the authorised nullable cowrie_issued_at field to quiz_attempts. Empty/upgrade/rollback tests preserve historical rows with null markers. Before activation, verify the one-way SQL issuance guard, mutually exclusive technical reversal, same-key network recovery and bounded recovery reconciliation. Existing commerce orders currently permit Royal Reveal only: real Cowrie order creation, verified quantities and fulfilment require separately reviewed Workstream D source; no purchase writer is provided here.
