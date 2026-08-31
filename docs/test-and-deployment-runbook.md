# Test and deployment runbook

Audit date: 22 August 2026
Intended public origin: `https://brideprice.classesforculture.com`
Current Sites project: existing live production Site. Its opaque platform identifier remains only in `.openai/hosting.json` and is intentionally omitted from this document.

This runbook records the current baseline and a safe future workflow. No preview, production deployment, DNS change, access-policy change or database migration was performed for this audit.

## Regression foundation update

Foundation update date: 22 August 2026. This section supersedes the audit-only command results below where they differ. It changes delivery safeguards and tests only. No production deployment, DNS change, storage binding or visual redesign is included.

### Required commands

| Check | Command | Expected result |
| --- | --- | --- |
| Lint | `npm run lint` | Zero errors and zero warnings |
| TypeScript | `npm run typecheck` | Zero errors, with no emitted files |
| Unit regression tests | `npm run test:unit` | Scoring boundaries, exact-set matching and feature-flag safeguards pass |
| Build and server-render tests | `npm test` | Production build and existing rendered-HTML tests pass |
| Browser smoke tests | `npm run test:e2e` | Production build and all Playwright journeys pass |
| Complete gate | `npm run test:all` | Runs lint, typecheck, unit, build/server-render and E2E checks in sequence |
| Review build | `npm run preview:review` | Builds and serves the exact output at `http://127.0.0.1:3100` until stopped with Ctrl+C |

The browser suite uses Microsoft Edge on Windows and the installed Playwright Chromium browser elsewhere. In CI, install the matching Playwright browser before running the suite. The test preview adapter serves only the built worker and `dist/client` assets. It has no D1 or R2 binding, writes no application data and exposes no production service.

### Covered regression journeys

The browser suite verifies homepage rendering, entry to all five regional editions, avatar selection, on-device photo selection with no non-read network request, a complete 12-question perfect-score run, the existing 12/12 tier result, PNG download, Web Share payload, nomination payload and WhatsApp URL, direct `?edition=west` entry, and a 390 by 844 mobile viewport without document-level horizontal overflow.

Unit tests pin the existing answer rule to exact set equality and the existing tier bands to 0 to 2, 3 to 5, 6 to 8 and 9 to 12. Any scoring change now requires an intentional test update and product approval.

### Typed feature flags

All roadmap flags are declared in `app/featureFlags.ts`, resolve to `false` when no explicit build environment value is present, and are injected at build time. The environment name is `WYBP_FEATURE_` plus the uppercase flag name.

| Flag | Default |
| --- | --- |
| `fast_entry` | `false` |
| `challenges` | `false` |
| `dynamic_results` | `false` |
| `story_video` | `false` |
| `first_party_analytics` | `false` |
| `daily_challenge` | `false` |
| `streaks` | `false` |
| `groom_mode` | `false` |
| `couples_mode` | `false` |
| `party_mode` | `false` |
| `premium_preview` | `false` |
| `commerce` | `false` |

Because this repository targets ChatGPT Sites, `vite.config.ts` always validates the resolved flags before compilation. A build with `WYBP_FEATURE_COMMERCE=true` must fail before output is produced, with an explanation that commerce requires migration to an approved commerce-capable host. A browser, query-string or localStorage value cannot bypass this guard.

### Local preview and review workflow

1. Run `git status --short --branch` and record unrelated user-owned changes.
2. Run `npm ci` in a clean review environment, or use the existing lockfile installation locally.
3. Run `npm run test:all`.
4. Run `npm run preview:review` and open `http://127.0.0.1:3100`.
5. Review the homepage, one direct regional link, avatar/photo setup, a complete result, download/share affordances and the mobile layout. The current visual design is the comparison baseline.
6. Stop the preview with Ctrl+C. Confirm port 3100 is no longer listening before rebuilding or switching revisions.
7. Review `git diff --check`, `git diff --stat`, `git status --short` and the dependency lockfile. Confirm that no `.env` file, secret, Playwright report, test result, downloaded portrait or generated media is included.
8. Record the reviewed commit or immutable version and the command results. Approval must name that exact revision.

### Approval and deployment gate

Local preview approval does not authorise production publication. Production remains unchanged until the owner explicitly approves the exact reviewed revision and audience. After approval, rerun `npm run test:all` from that revision, confirm every feature flag is false in production, confirm `commerce` is false, and follow the existing Sites deployment procedure below. Do not combine code publication with DNS, custom-domain, access-policy, D1 or R2 changes.

### Preview and release rollback

- Local preview rollback: stop the preview, return to the previously recorded branch or commit, rebuild, and rerun the smoke checks. Do not use `git clean`, a broad checkout or a hard reset because unrelated user files may be present.
- Review-branch rollback: create a new revert commit for the scoped foundation change, then run `npm run test:all` and `npm run preview:review` against the reverted state.
- Feature rollback: future roadmap behaviour should be disabled through its typed flag first. All current roadmap flags already default to false.
- Production rollback: redeploy the previously approved immutable Sites version, then run the production smoke test. Production deployment is not part of this foundation task.
- Data rollback: not applicable to this change because D1 and R2 remain unbound and no schema or storage behaviour changed.

## Current command baseline

Prerequisite: Node.js `>=22.13.0` and npm using the committed `package-lock.json`.

| Check | Command | Current baseline on 22 August 2026 |
| --- | --- | --- |
| Install from lockfile in a clean environment | `npm ci` | Not run in this audit; existing dependencies were preserved |
| Development server | `npm run dev` | Defined as `vinext dev` |
| Production build | `npm run build` | PASS |
| Automated tests | `npm test` | PASS: 2 tests, 0 failed |
| Lint | `npm run lint` | FAIL: 10 errors, 11 warnings |
| Standalone TypeScript check | `.\node_modules\.bin\tsc.cmd --noEmit` | FAIL: 4 errors |
| Production-style local server | `npm run start` | Defined as `vinext start`; not run |
| Drizzle migration generation | `npm run db:generate` | Not run; current schema is empty and no binding exists |

`npm test` already runs `npm run build` before executing `node --test tests/rendered-html.test.mjs`.

### Current automated coverage

The two tests currently verify:

- the built worker returns HTML with expected title, favicon and core home copy;
- all five regions are represented;
- 60 question declarations exist;
- image, multi-select and completion formats exist;
- selected educational/source/safeguard strings exist;
- the application source contains mastery and nomination-link implementation markers;
- prohibited copy and em dashes are absent.

They do not currently exercise browser interaction, score correctness, every region, direct query hydration, photo safety, downloads, Web Share fallbacks, WhatsApp encoding, accessibility, mobile rendering, errors, storage, challenge flows or dynamic metadata.

### Current lint failures

- Unused `legacyRegions`, `legacyRegionOrder` and `legacyAvatarChoices`.
- State updates performed synchronously inside two effects.
- Two empty block/catch findings.
- React purity finding around `Math.random()` in the sound generator.
- Click handling on a non-interactive `<article>` without keyboard handling.
- Eleven warnings, including ten direct `<img>` performance warnings and one unnecessary hook dependency.

### Current typecheck failures

- `app/page.tsx` imports `./BridePriceGame.tsx` while `allowImportingTsExtensions` is not enabled.
- `db/index.ts` cannot resolve `cloudflare:workers` type declarations.
- `worker/index.ts` cannot find Cloudflare `Fetcher` and `D1Database` globals.

The next foundation task should add a package script such as `tsc --noEmit --incremental false` after correcting the configuration and errors. Disabling incremental output in CI avoids leaving `tsconfig.tsbuildinfo` in the working tree.

## Required test layers before growth work

### Unit tests

- Region/query/source parsing and hostile values.
- Exact scoring for single, complete, image and multi-select questions.
- Tier boundaries at 2/3, 5/6 and 8/9.
- Mastery rule of 9 or higher per region.
- Share copy, URL encoding, Unicode names and canonical origin.
- Storage parse/validation/expiry/clear behaviour.
- Feature-flag defaults and Sites commerce guard.
- Future opaque code, idempotency, public projection and scoring-version rules.

### Component/accessibility tests

- Keyboard-only region, avatar, quiz, result and modal completion.
- Focus movement after screen/question changes.
- Dialog initial focus, trap, Escape close and restoration.
- Screen-reader names, selected avatar state, progress semantics and answer announcements.
- Reduced-motion behaviour.
- 200% and 400% zoom/reflow and colour contrast.

### End-to-end browser tests

At minimum:

1. Load the homepage.
2. Start each of the five regional editions.
3. Load each region directly through `?edition={region}`.
4. Select each class of avatar and replace it.
5. Select a valid local photo without any application upload request.
6. Reject oversized, forged and malformed images after hardening is implemented.
7. Complete a full 12-question quiz in each question mode.
8. Verify result score, tier, portrait and regional visual identity.
9. Download the result and verify PNG dimensions/content.
10. Exercise native share support, cancellation, unsupported APIs and download fallback.
11. Verify WhatsApp and clipboard URL/copy encoding.
12. Verify `nominated=1` compatibility after replacement behaviour is implemented.
13. Verify mastery persistence, expiry/clear and five-region unlock.
14. Test 320 px, common Android, iPhone and desktop viewports.
15. Test browser back/forward, refresh recovery, slow network and offline error states.
16. Test raw crawler HTML and images for every future result/challenge route.

### Performance checks

Use an agreed representative mid-range mobile profile and record evidence for:

- branded shell render time;
- first tappable regional/avatar/question choice;
- largest contentful paint;
- cumulative layout shift;
- interaction responsiveness;
- transferred bytes and decoded-image memory;
- direct edition link with no generic-home flash;
- in-app-browser JavaScript errors;
- result PNG/Story generation time, size and cleanup.

Do not claim the ten-second entry or Core Web Vitals targets without measurements.

### Security and privacy checks

- Dependency audit in an approved networked environment.
- XSS, injection, CSRF, SSRF, IDOR and open-redirect review when server routes exist.
- Rate limits, generic invalid-code responses and enumeration resistance.
- Upload signature, type, size, dimension, EXIF and decompression tests.
- Absence of photos, raw contact data, secrets and arbitrary query values in logs/events/public projections.
- Consent/opt-out and clear-local-data verification before analytics.
- Owner-dashboard authorisation tests.
- Migration forward/rollback and deletion/anonymisation tests before D1 production use.
- Build failure when commerce is enabled on ChatGPT Sites.

## Safe local workflow

1. Read `git status --short --branch` before editing.
2. Preserve unrelated tracked changes and all user-owned untracked files.
3. Work on a scoped branch using the `codex/` prefix when a branch is required.
4. Make the smallest coherent change behind a feature flag when behaviour is new.
5. Keep all new roadmap flags false by default.
6. Use only development/preview storage for schema work.
7. Run focused tests during implementation.
8. Run the full required suite before requesting review.
9. Inspect `git diff --check`, the changed-file list and final Git status.
10. Stop at a local or preview build unless production deployment is explicitly approved.

## Review/preview gate

Before any production publication:

- Build, lint, typecheck, unit, component/accessibility and E2E suites pass.
- No unexpected files or secrets are present.
- The custom origin configuration is correct for the preview environment.
- New feature flags remain off in production configuration.
- Preview data uses isolated D1/R2 resources when storage exists.
- Forward and rollback migration behaviour is tested with synthetic data.
- The owner reviews representative desktop/mobile screens and share assets.
- Cultural-review-required copy/assets are explicitly approved.
- The exact target version, change summary and rollback version are recorded.
- Production access level and custom-domain status are shown before any access or DNS change.

## Sites deployment procedure for a future approved release

This section is documentation only and was not executed in this task.

1. Confirm `.openai/hosting.json` still references the intended existing Sites project and contains only approved logical D1/R2 bindings.
2. Confirm the production build uses `@openai/sites-vite-plugin` and produces `dist/server/index.js` plus static assets.
3. Commit the exact validated source state.
4. Push that exact commit to the Sites-connected source repository using a short-lived credential that is not persisted.
5. Package `dist/` with `dist/.openai/hosting.json` and any approved migrations.
6. Save a new Site version tied to the pushed commit.
7. If the Site is owner-only, use private deployment. If it is shared or public, obtain explicit approval naming the resolved audience before deployment.
8. Poll until deployment reaches a terminal state.
9. On success, verify the exact deployed URL and then the intended custom domain.
10. Do not change DNS, audience or custom-domain records as an incidental part of feature deployment.

## Custom-domain verification checklist

The intended public origin is `https://brideprice.classesforculture.com`. Repository source currently hard-codes the old ChatGPT Sites origin in `metadataBase`; this must be corrected and tested in a later task before relying on social previews.

After an expressly approved domain-readiness task:

- Resolve and record the current access mode without changing it.
- Confirm anonymous access does not require ChatGPT sign-in.
- Confirm custom hostname status and valid SSL.
- Confirm HTTP redirects to HTTPS.
- Confirm the old `chatgpt.site` URL preserves route paths and query parameters if it redirects.
- Confirm canonical link, `og:url`, metadata images and generated share URLs use the custom origin.
- Confirm `/`, a regional direct link and representative result/challenge routes as a signed-out visitor.
- Confirm Facebook/WhatsApp crawler access to raw metadata and images.
- Do not alter Namecheap nameservers, the root domain or an existing Netlify project without separate explicit approval.

## Database and storage migration gate

Current D1 and R2 bindings are null. Before adding storage:

1. Approve logical binding names through the Sites workflow.
2. Add typed schema and migration files.
3. Use only isolated preview data first.
4. Test idempotency, indexes, public/private projections, retention, deletion/anonymisation and rollback.
5. Record expected row/media growth.
6. Back up/export before any production migration.
7. Obtain explicit production-migration approval.
8. Never add payment/order/card tables while hosted on Sites.

### Preview D1 activation attempt, 23 August 2026

Approved proposal: one empty D1 database named `wybp-preview`, bound as `DB` to an isolated preview environment only. The attempt stopped before provisioning because the available Sites interface could inspect only live bound databases and exposed no account-wide D1 inventory, D1 creation operation, or preview-only binding operation. The Sites project also had no current preview URL. Resource-name uniqueness and same-project preview isolation from production therefore could not be proven.

No configuration, resource, binding, migration, seed, preview version or deployment was changed. The live database overview remained empty, production remained unbound, and R2 remained inactive.

Manual gate before retry:

1. An authorised Sites operator supplies an account-level inventory proving `wybp-preview` is unused.
2. The operator identifies a distinct preview environment with no effect on the current live deployment.
3. The operator creates exactly one empty `wybp-preview` database and binds it as `DB` to preview only.
4. The operator confirms the live deployment still has no D1 binding and no production deployment was required.
5. The operator supplies an approved preview-only migration surface that identifies the database unambiguously without disclosing credentials.
6. The repository gate then runs migration dry-run and checksums, applies only migrations `0000_loving_stepford_cuckoos` and `0001_same_vertigo`, verifies repeat application, applies and repeats the deterministic development seed with checksum `91ed04fcc134fa53d14a8694eedb04ca7fafb0cbf45c11b07b0d2eff17f8da6a`, and runs the complete schema, projection, fail-closed, test and build checks.

Rollback after any later approved creation is to remove the preview-only binding first, verify production remains unbound, then delete the preview database only with separate explicit deletion approval. No cleanup action is required for this stopped attempt because no resource exists.

At this historical checkpoint Prompt 9 remained blocked. The recommended next option was to create a separate owner-only staging Site with its own isolated D1 database, apply the preview gate there, and keep the live public Site entirely untouched, unbound and undeployed.

#### Isolation resolution, 23 August 2026

The separate environment now exists as **What’s Your Bride Price Staging** at `https://whats-your-bride-price-staging.ayo43077.chatgpt.site/`. It has custom restricted access protected by sign-in, permits the owner only, and retains normal workspace-administrator oversight. Its isolated empty D1 database is bound as `DB` and has zero tables. R2 is null and no custom domain is attached.

The live Site at `https://brideprice.classesforculture.com` remains separate, unbound and unchanged. No migration, seed, production-data import, public write, analytics SDK, payment, commerce or advertising capability has been activated. At this checkpoint Prompt 9 was paused pending official association of the staging branch and validation of a saved review build without deployment. Migrations and seeds require a separate explicit approval gate.

#### Prompt 9 local challenge gate, 24 August 2026

The owner approved one additive local migration after `0001`: `0002_little_inertia.sql`. It remains unapplied to every hosted database. Its focused verification must cover empty-database migration, upgrade from `0000` plus `0001`, repeat execution, historical-row preservation, nullable historical verifier fields, duplicate non-null verifier rejection and application-layer malformed-hash rejection.

On 24 August 2026, the owner approved one further additive local migration after `0002`: `0003_clever_joshua_kane.sql`. It remains unapplied to every hosted database. Before any separately approved hosted migration, verify checksum `3eb81a835dcff39f8bc796483b2ca7de1a8f1c29dd218e5c43779f7edcc31fdb`, historical null compatibility with `is_official_comparison = 0`, replay marker `0`, immutable first-comparison claims, official recipient/challenge uniqueness after result deletion, official-result uniqueness, result foreign-key enforcement, service-level result-to-attempt ownership and full rollback under a failed completion batch. An ordinary build, test or preview must never apply this migration or seed automatically.

Before any separately approved hosted activation, rerun the focused migration and challenge-service suites, `npm run test:all`, `npm run build` and `git diff --check`. Confirm that authoritative completed results supply edition and score, challenge codes contain 192 random bits, idempotency cannot cross result or subject boundaries, raw revocation tokens are returned once and never stored, historical rows without verifiers cannot be revoked, the rate-limit boundary fails closed, public projections remain minimal, private photos stay device-local, and the `challenges` flag remains false by default. Ordinary builds and tests must not contact hosted storage or run migrations or seeds.

### Prompt 12 nomination release gate

Run `npm run test:nominate-three` before the complete suite. Confirm exactly three numbered slots; one identical canonical challenge code across WhatsApp, native share and clipboard; centrally validated Unicode alias handling; one idempotent creation; tab-local safe snapshot restoration after refresh and Back; cancelled, failed and blocked handoffs not completing slots; one `share_handoff` maximum per slot; continued sharing after the third handoff; and no message-delivery wording.

The authorised mobile review must demonstrate three successful handoffs in under 30 seconds at a representative iPhone-sized viewport, plus overflow and 44-pixel control checks at 320 pixels, Android and iPhone dimensions. Recheck reduced motion, keyboard focus, live status messages, manual copy fallback, and the permanent safeguard.

Ordinary production output must exclude trusted nomination fixture names, scores, codes and outcomes. Query parameters must not enable challenges or review fixtures. Verify new generated links contain no `nominated=1`, while old valid links remain neutral and direct and invalid or missing editions fall back to regional selection. Confirm no Contacts API, social SDK, analytics transmission, private-photo field, recipient detail, raw session value, idempotency value or revocation token enters events, URLs, storage snapshots or share copy.

Prompt 12 adds no migration. Before any future deployment, verify migrations `0000` through `0003`, `.openai/hosting.json`, production D1/R2 bindings, the staging branch and the preserved abandoned-work stash are unchanged. Hosted challenge creation remains disabled until a separate storage activation decision.

### Prompt 13 Share Centre release gate

Run `npm run test:share-centre` before the complete suite. The focused gate validates safe personalised and generic projections, fixed platform copy, canonical URL encoding exactly once, Facebook URL-only sharing, local event allowlists, 1080 by 1920 PNG output, all seven actions, native cancellation, blocked or unsupported fallbacks, 320-pixel layout, reduced motion, focus return, result-to-nomination challenge reuse, valid landing read-only behaviour and honest comparison fallback.

Manually verify on current real devices and in-app browsers for WhatsApp, Facebook, Instagram and TikTok before a future approved release. Platform share composers and native sheets cannot be proven by mocked browser tests alone. Confirm popups use `noopener,noreferrer`, popup blocking does not lose the safe link, Instagram and TikTok show exactly two download instructions where file sharing is unavailable, and no UI claims posting, sending or delivery.

Confirm the current static Open Graph image is unchanged. It does not contain the safeguard and remains a temporary fallback pending Prompt 14. Prompt 13’s local 9:16 PNG is not a dynamic preview, published result URL, video or R2 object. Confirm no private portrait, name, score, challenge code, token, session value, recipient detail or file byte enters an event or unapproved network request.

Prompt 13 adds no dependency, schema, migration, D1/R2 binding or hosted operation. Before any deployment, rerun `npm run test:all`, `npm run build` and `git diff --check`, then repeat the existing protected-file, fixture-isolation, storage and security gates.

### Prompt 14 published-result release gate

Run `npm run test:dynamic-results` before the complete suite. Verify migration `0004_yellow_bill_hollister.sql` checksum `c649185f96cdce28aca0522330649b4688c9f1da93ea6eab0c08842b163b65bc`, historical-private defaulting, explicit owner publication and unpublication, same-origin enforcement, fail-closed rate limiting, neutral unavailable states, raw server HTML, canonical metadata, crawler read-only behaviour, deterministic 1200 by 630 PNG output, the 1,000,000-byte hard ceiling and preferred sub-500,000-byte target, object-key safety, ETag/conditional delivery, Share Centre confirmation and fallback preservation.

Publication requests must contain `anonymousSessionCredential` only in the JSON POST body. Confirm the server uses `deriveAnonymousSubjectHash` and `constantTimeEqual` against the authoritative stored attempt subject hash, and that missing, malformed, copied stored hashes, mismatched credentials and credentials replayed after the attempt expiry all receive a neutral failure. An identical authorised retry within the still-valid ownership window remains idempotent. Never expose the credential in URLs, queries, public projections, metadata, events or logs.

`dynamic_results` must remain false in ordinary production until separately approved D1 and R2 bindings are available. A production build with the flag enabled and missing durable storage must fail. Authorised review fixtures require both `WYBP_REVIEW_BUILD=true` and `WYBP_REVIEW_RESULT_FIXTURES=true`; no query parameter can activate them. Confirm ordinary output contains no fixture slug, score, subject hash or preview record.

The static `/og-v2.png` remains a temporary fallback for unavailable states and generation/storage failure. It is not the normal image for an eligible public result, and it still does not contain the permanent safeguard. Prompt 14 generated result previews do contain the safeguard. Do not claim otherwise or replace the fallback without a separately approved visual-asset review.

#### Facebook Sharing Debugger procedure after an approved deployment

1. Publish one approved, non-private result through the real owner-authorised action. Never use private, synthetic or review-fixture data.
2. Open Facebook Sharing Debugger at `https://developers.facebook.com/tools/debug/` and enter that exact canonical `/result/{opaque slug}` URL.
3. Select **Debug**, then request **Scrape Again** so Facebook fetches the current server-rendered metadata and preview.
4. Confirm the canonical URL, title, description, 1200 by 630 image, image MIME type and reported warnings or errors. Confirm the generated image shows the correct region, score/title, branding and permanent safeguard.
5. Repeat the fresh scrape after any material metadata, image-generation or canonical-origin change. Record the checked production URL and time without copying private tokens or internal identifiers.
6. If the result is unpublished, verify the application origin returns the neutral unavailable state. Treat third-party cache expiry as external behaviour and never republish private data merely to refresh a cache.

Do not attempt live Sharing Debugger validation before an explicitly approved public deployment.

### Prompt 15 Story-video release gate

Run `npm run test:story-video` before the complete suite. Verify exact 1080 by 1920 output, a five-second timeline, MIME/extension agreement, the 8,000,000-byte ceiling, approved regional and avatar inputs, the permanent safeguard, score-tier treatment, generated-audio opt-out, reduced-motion static presentation, unsupported-browser fallback, cancellation cleanup, revoked object URLs and honest file-share fallbacks. Confirm all event payloads remain local and contain only allowlisted event, edition, surface, state, channel, elapsed-time and byte-size fields.

Review at least one high, middle and learning score across distinct regions at 390 by 844, plus a ready share state, reduced-motion state, unsupported-recording fallback, 320-pixel viewport, Android-sized viewport, iPhone-sized viewport and 200 percent zoom. Store review screenshots and downloaded media outside Git. Confirm ordinary builds contain no trusted fixture codes or results and that `story_video` remains false without a trusted build-time flag. Real-device Instagram, TikTok, Facebook Story, WhatsApp and native-share behaviour remains a deployment-stage verification because mocked browser tests cannot prove platform destination or delivery.

Prompt 15 requires no dependency, schema, migration, D1/R2 binding, hosted media service or service worker. Ordinary builds and tests must not contact hosted storage or run migrations or seeds. Before any separately approved deployment, rerun `npm run test:all`, `npm run build` and `git diff --check`, then repeat protected-file, fixture-isolation, privacy and security gates.

### Prompt 16 analytics release gate

Run `npm run test:analytics` before the complete suite. It verifies migration `0005` on empty and upgraded databases, replay/checksum/failure rollback, exact legacy preservation, strict events/properties, reserved-commerce rejection, consent preference/session separation, rate/D1 fail-closed behavior, idempotent routing, referral-code discard, 30-day retention, withdrawal, funnel calculations, query-parameter isolation, POST-only source, third-party exclusion and the consent UI in browsers.

The browser review must cover initial choice, rejection with the quiz continuing, acceptance, preference management, withdrawal, Global Privacy Control, 320-pixel/Android/iPhone layouts, 200 percent zoom, keyboard focus and reduced motion. Accept and Reject must remain equal, at least 44 pixels, readable and free of horizontal overflow. Temporary screenshots, reports, traces, profiles and databases must remain under the operating-system temp directory and outside Git.

Production activation is blocked until the owner and appropriate legal reviewer approve the notice and withdrawal model; D1 is explicitly bound; `0005` is separately approved and applied; independent fail-closed rate limiting exists; an owner/scheduled retention operation is assigned; and deletion/aggregate handling is approved. Do not use review fixtures as production storage or a production rate limiter. No deployment, migration or seed is implied by passing this gate.

### Prompt 17 Royal Reveal release gate

Run `npm run test:commerce`, then `npm run test:all`, `npm run build` and `git diff --check`. The focused suite must prove server-authoritative result completion from published D1 answer keys, forbidden browser score/result claims, atomic attempt/answer/result persistence, exact owner/result binding, a durable opaque result slug, exact GBP 199 one-off configuration, query and redirect isolation, stored-hash rejection, consent, idempotency, validated Payment Link construction, raw-body signatures, replay/concurrency, payment/refund/dispute states, premium-function gating, media dimensions, Story fallback, analytics separation and migration `0006` safety on empty/upgraded/repeated databases. Tests and review must use synthetic events only and make no Stripe or hosted-storage request.

The browser gate covers offer, unchecked consent, validation error, processing, succeeded, failed, refunded/revoked, all three portraits, certificate, video-ready and unsupported fallback states. Review 320-pixel, Android and iPhone viewports, 200 percent zoom and reduced motion. Controls must be keyboard reachable, visibly focused and at least 44 pixels where actionable; status changes use accessible announcements, errors use text, free actions remain reachable, consent is never preselected, safeguards remain legible and no horizontal overflow occurs. Evidence belongs only in the operating-system temp directory.

Live activation remains blocked until every one of the twenty ordered gates in `docs/stripe-payment-link-setup.md` is complete. This includes legal wording and URLs, business/support identity, tax and confirmation decisions, production D1 plus `0006`, independent rate limiting, webhook registration/secret, test-mode payment/refund/dispute evidence and a separate live-mode approval.

## Production smoke test for a future approved release

Run from a signed-out mobile browser where public access is intended:

1. Load the canonical homepage.
2. Open a direct regional URL and confirm the correct first screen.
3. Complete one representative quiz without a photo.
4. Complete a second representative journey with an avatar or local photo as applicable.
5. Confirm score/result, download and share fallback.
6. Confirm no photo or name appears in network requests unless the user expressly invokes a future upload feature.
7. Confirm canonical metadata and social preview image.
8. Confirm feature flags and any new storage writes.
9. Confirm error/event dashboards show no unexpected spike.
10. Record time, tester, URL, version and result.

## Rollback

### Code-only rollback

- Disable the affected feature flag first when safe.
- Otherwise redeploy the previously approved Sites version.
- Re-run the production smoke test against the restored version.
- Preserve the failed release for diagnosis; do not rewrite history or use destructive Git resets.

### Data-aware rollback

- Never assume a code rollback reverses a database migration.
- Prefer backwards-compatible expand/migrate/contract schema releases.
- Pause affected writes if reconciliation is required.
- Restore from an approved backup/export only with explicit authorisation.
- Compare row counts/checksums and document records written during the failed window.
- Do not delete or rewrite user-created data as part of a routine code rollback.

### DNS/custom-domain rollback

- DNS changes require a separate approved cutover plan.
- Record the exact previous record, TTL and target before change.
- Restore only that exact approved record if the rollback gate is met.
- Never change nameservers or unrelated root-domain records.

## Sites commerce prohibition and Prompt 17 boundary

While the quiz is hosted on ChatGPT Sites, live commerce remains prohibited:

- no Stripe integration;
- no checkout or payment-link redirect;
- no transaction-enabling button;
- no active payment/order/entitlement storage;
- no browser flag or localStorage entitlement;
- no live paid product.

Prompt 17 implements only disabled local source, migration and review fixtures. Activation remains **BLOCKED** until the production quiz is demonstrably running on a separately approved commerce-capable host and every migration, configuration, legal, test and commerce gate has passed.

## Dependency-security deployment gate

Audit date: 23 August 2026.

The read-only production dependency audit reported 0 vulnerabilities. The complete development tree reported 20 findings: 1 low, 4 moderate and 15 high. Direct development-package findings were reported for `@cloudflare/vite-plugin`, `drizzle-kit`, `react-server-dom-webpack`, `vinext`, `vite` and `wrangler`. Important transitive findings included `@babel/core`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `brace-expansion`, `esbuild`, `fast-uri`, `image-size`, `js-yaml`, `miniflare`, `nanoid`, `postcss`, `sharp`, `undici` and `ws`.

These findings primarily concern development and build tooling. Reduced apparent runtime reachability is not proof that a vulnerability is harmless, and this record does not claim that every finding is exploitable. No automatic audit fix, forced upgrade or dependency upgrade was run.

Before the next production deployment, the direct and transitive findings require either a compatible upgrade assessment or explicit documented risk acceptance. Any approved upgrade must rerun lint, TypeScript checking, unit tests, data-foundation tests, rendered-HTML tests, all end-to-end suites, the production build, migration dry-run and isolated migration checks, and the authorised preview checks. Automatic forced upgrades remain prohibited.

## Current audit handoff

- Production changed: no.
- DNS changed: no.
- Packages installed: no.
- Application code changed: no.
- Database/storage changed: no.
- Files intentionally created: the four requested documents under `docs/`.

## Prompt 18 local owner-dashboard gate

Run `npm run test:owner-dashboard` for pure authorization/filter/funnel/CSV tests, isolated aggregate-query tests, ordinary disabled-output checks, authorised and unauthorised server-render checks, and browser review across empty/small/healthy/drop-off/viral/channel/edition/unavailable/CSV/responsive states. All reports, screenshots, traces, browser output and build artefacts use operating-system temporary directories or ignored build directories and must remain outside Git.

An authorised local review build requires all of:

- `WYBP_FEATURE_OWNER_DASHBOARD=true`
- `WYBP_REVIEW_BUILD=true`
- `WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES=true`
- `WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS=<synthetic stable subject>`

The synthetic request must also carry the matching trusted Sites subject header; fixture/query selection cannot authorize it. Ordinary production builds must omit all four values and return 404 for `/owner/analytics` and its CSV endpoint. Query parameters cannot enable the flag.

Before hosted activation, follow `docs/owner-dashboard-access-contract.md`: approve exact subjects and dispatch-only ingress, bind D1, separately approve migration application through `0006`, add a distributed export limiter, verify consent/retention and no-store behaviour, run `npm run test:all`, and obtain separate deploy approval. Do not activate analytics or commerce merely to populate the dashboard.
## Prompt 19 privacy and result-retention gate

Run `npm run test:privacy`, `npm run test:all`, `npm run build` and `git diff --check`. The focused suite covers the versioned inventory and source-registration scan, notice synchronisation, strict analytics opt-in and withdrawal, exact allowlisted clearing, safe gameplay reset, device-local photographs and object-URL cleanup, absence of third-party trackers, legal fail-closed behavior, retention and 90-day publication semantics, keyboard/focus behavior, responsive and reduced-motion layouts, and fixture isolation.

Review fixtures require both `WYBP_REVIEW_BUILD=true` and `WYBP_REVIEW_PRIVACY_FIXTURES=true`; query parameters alone are inert. Store screenshots, browser profiles, reports and build copies only under the operating-system temporary directory. Before any future production activation, complete `docs/legal-content-activation-checklist.md`, verify trusted ingress and real provider storage, bind and migrate D1 only under separate authority, and obtain explicit deployment approval. This gate does not activate analytics, commerce, the owner dashboard, D1 or R2.
