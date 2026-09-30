# Current handoff

## Source checkpoint

Checked 30 September 2026: application source on `feature/viral-build-sprint` is `d862f6315e85604000b078d4355d878b58dbcea9` (`fix: reveal quiz progression and retry controls`), verified on origin after pushing. This handoff update is documentation only and does not change the deployed application checkpoint. PR #1 remains open, draft and unmerged, with base `master`.

## Implemented versus deployed

The Vinext/Vite application supports a private Netlify client and signed proxy requests to a Cloudflare Worker. Compiled navigation repairs and Worker packaging verification are committed. Explicit ESModule rules now include all 138 server modules; the regression reproduces the original omission. Packaging, hosting-security, both compiled navigation targets and the rebuilt release verifier passed at this source checkpoint.

**[wybp-protected-test](https://wybp-protected-test.netlify.app/) serves the repaired, live-verified owner-only test application.** Netlify production and preview URLs deny anonymous access. Worker `wybp-test-r001` has its signature-protected primary endpoint enabled and preview endpoints disabled. Existing websites remain unchanged. D1/R2 are unbound and optional features remain disabled.

## Current task and next action

Fixed the blocking image-question defect: successful answers left continuation below the viewport. The repair focuses and reveals progression/retry controls and the following question. All 12 questions in all five regions were completed live at 1366×768 and 390×844: 120 answers, every image question, ten verified 12/12 results, no console errors. No additional gameplay blocker was found. Next: owner review; public launch remains gated below.

The image-answer POST retains `credentials: "same-origin"`. Both compiled targets passed all regions at desktop/mobile sizes, including correct/wrong image answers and final results. Server/network/malformed-response retries passed. All aggregate stages, builds and diff checks passed. Authentication, ownership, Origin and Fetch Metadata checks remain unchanged.

The client verifier reconciles Netlify's lowercase path keys while rejecting missing/altered files and case collisions. Consult the local checkpoint for release/deployment IDs and validation details. The protected placeholder remains available for rollback.

## Essential constraints and references

Public launch must include **random regional replay, Cowrie play access and purchases, and Royal Reveal payments**. Activation requires catalogue readiness, database/runtime configuration and verified payment flows. This requirement does not authorise live payments or public activation during this bug fix. See [random play](random-quick-play.md), [Cowrie access](cowrie-wallet-and-play-access.md), [purchases](cowrie-commerce.md) and [Royal Reveal](commerce-and-entitlement-contract.md).

Keep builds secret-free; install secrets separately. Do not enable hosted builds or Git deployment under the current Personal-plan exception. Preserve migrations, question data, feature defaults, signature checks, authenticated assets, existing websites, DNS, other Workers, staging branch and stash. Keep PR #1 draft and unmerged. No storage binding, migration, seed, payment activation or other external change without authorisation.

- [Hosting contract, commands and rollback](netlify-cloudflare-hosting.md). Its original readiness statements predate the recorded deployment attempt; use the checkpoint below for the latest recorded deployment state.
- [Privacy contract](privacy-controls-contract.md), [retention](retention-schedule.md), [storage gates](storage-binding-readiness.md)
- Local ignored evidence: [deployment checkpoint](../outputs/netlify-deployment-checkpoint.json) and [original package omissions](../outputs/original-worker-package-omissions.json). Release manifests are under `outputs/netlify-worker/<release-id>/release.json`. These are not preserved by Git and may be absent from a fresh clone; independent archival backup remains unverified.
