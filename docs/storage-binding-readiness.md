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

Prompt 9 remains blocked. The recommended next option is a separately created, owner-only staging Site with its own isolated D1 database and no connection to the live public Site. The live public Site must remain untouched, unbound and undeployed throughout that staging exercise.

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
10. Keep commerce disabled. No payment entity belongs in this Sites model.

## R2 contract

Only generated, expressly approved result media may later use R2. Metadata lives in `media_assets`; object bytes use `generated/{edition}/{YYYY}/{MM}/{sha256}-v{generation}.{extension}`. Object keys cannot contain names, emails, original filenames, raw sessions, queries or secrets. Private uploaded photos stay on-device and do not become public media by default.

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
