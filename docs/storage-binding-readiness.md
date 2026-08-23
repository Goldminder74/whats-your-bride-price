# D1 and R2 binding readiness

## Observed state

The actual target is ChatGPT Sites project `appgprj_6a866f946500819192961ffd6b073a98`, currently live at `https://brideprice.classesforculture.com`. Repository configuration in `.openai/hosting.json` contains `"d1": null` and `"r2": null`. Vite therefore injects no local D1 or R2 binding, and the project has no active preview URL.

A read-only Sites database overview on 23 August 2026 returned no live D1 binding and no tables. The available inspection interface does not expose an equivalent R2 bucket overview. R2 is therefore confirmed absent from repository, build and runtime code configuration, with no source evidence of a live bucket, but it was not independently enumerated in the hosting control plane. No remote storage, access, version or deployment setting was changed.

The data model, migration and tests are inactive local infrastructure. The application has no durable write endpoint and the unbound repository throws instead of using browser storage for authoritative records.

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

## D1 atomicity

Cloudflare D1 `batch()` is the planned atomic write primitive. Prepared statements in a batch execute sequentially and the full batch aborts or rolls back if one fails. The repository contract reserves this for the six multi-row integrity operations documented in `db/repositories.ts`. No claim is made that those writes are active while D1 remains unbound.
