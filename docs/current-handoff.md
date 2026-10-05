# Current handoff

## Source checkpoint

Checked 5 October 2026: application source on `feature/viral-build-sprint` is `5959b4e1b21bc6fc7f667461ccd643b303cde18c` (`fix: shuffle quiz choices and support mobile image answers`), pushed normally to origin. PR #1 remains open, draft and unmerged, base `master`.

## Implemented versus deployed

[wybp-protected-test](https://wybp-protected-test.netlify.app/) serves the matched private Netlify/Cloudflare application. Netlify production and preview URLs deny anonymous access. Worker `wybp-test-r001` requires verified proxy signatures before application/assets delivery; preview endpoints are disabled. D1/R2 are unbound, optional features disabled and Stripe disconnected. Existing websites remain unchanged.

The source includes compiled navigation and Worker packaging repairs, reachable progression/retry controls, mobile layouts, zoom/safe-area support, reduced motion, image loading improvements and a credentialed private manifest.

## Current task and next action

Corrected the Safari-family image-answer failure: WebKit sends `Origin: null` with the old same-origin fetch mode and no-referrer policy. The relative POST now uses CORS mode, same-origin credentials, no referrer and rejects redirects. Null/arbitrary origins, cross-site Fetch Metadata, ownership and ingress protections remain intact.

Classic choices shuffle per game in balanced presentation blocks. Canonical option IDs, content and scoring remain unchanged; recovery retains the order and retries retain the choice. Random Quick Play retains its server-held order. See [mobile readiness and test commands](mobile-readiness.md).

All integration stages completed, with the affected compiled gate rerun after raw-header audit correction. Both compiled targets and WebKit completed all twelve questions in all five regions at desktop/mobile sizes, including correct/wrong image answers, retries and results. Final Chromium/WebKit navigation checks, lint, typecheck, builds, package verification and diff checks passed. Live checks verified all forty image choices, protected assets/images, signatures, ownership and anonymous denial. Owner-browser mobile progression remains pending: the UI helper cannot restore the minimized Personal Edge window and reports conflicting input even after the owner leaves it idle. API checks are not full UI evidence.

Next: finish that live UI check, then physical iOS/Android review. Device keyboards, cutouts, assistive technology and measured field speed remain public-launch gates.

## Essential constraints and references

Public launch must include random regional replay, Cowrie play access and purchases, and Royal Reveal payments. These require catalogue readiness, database/runtime configuration and verified payment flows before activation. No live payments/public activation is authorised here. See [random play](random-quick-play.md), [Cowrie access](cowrie-wallet-and-play-access.md), [purchases](cowrie-commerce.md) and [Royal Reveal](commerce-and-entitlement-contract.md).

Keep builds secret-free and secret installation separate. Do not enable hosted builds/Git deployment under the Personal-plan exception. Preserve migrations, question packs, defaults, existing websites/DNS/Workers, staging branch and stash. Keep PR #1 draft. No hosted storage changes, seed, publishing or activation.

[Hosting and rollback](netlify-cloudflare-hosting.md); [privacy](privacy-controls-contract.md); [retention](retention-schedule.md); [storage gates](storage-binding-readiness.md). Ignored local evidence: `outputs/netlify-deployment-checkpoint.json`, `outputs/original-worker-package-omissions.json`, release manifests under `outputs/netlify-worker/<release-id>/release.json` and temporary test logs. Independent archival backup remains unverified; a fresh clone may lack this evidence.
