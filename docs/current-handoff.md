# Current handoff

## Source checkpoint

Checked 30 September 2026: application source on `feature/viral-build-sprint` is `18598a0779fdfe3e7b11057159e3b0f195354fdf` (`fix: preserve private hosting access for image answers`), verified on origin after pushing. This handoff update is documentation only and does not change the deployed application checkpoint. PR #1 remains open, draft and unmerged, with base `master`.

## Implemented versus deployed

The Vinext/Vite application supports a private Netlify client and signed proxy requests to a Cloudflare Worker. Compiled navigation repairs and Worker packaging verification are committed. Explicit ESModule rules now include all 138 server modules; the regression reproduces the original omission. Packaging, hosting-security, both compiled navigation targets and the rebuilt release verifier passed at this source checkpoint.

**[wybp-protected-test](https://wybp-protected-test.netlify.app/) serves the owner-only test application; the blocking progression repair below is not deployed yet.** Netlify production and preview URLs deny anonymous access. Worker `wybp-test-r001` has its signature-protected primary endpoint enabled and preview endpoints disabled. Existing websites remain unchanged. D1/R2 are unbound and optional features remain disabled.

## Current task and next action

Owner testing found a blocking image-question progression defect: the answer succeeded but the continuation panel remained below the image grid, outside the viewport. The scoped repair focuses and reveals the progression or explicit retry control, then reveals the following question. Complete all five regional quizzes on desktop/mobile and verify the repaired private release before handing back for owner testing.

The image-answer POST retains `credentials: "same-origin"`. Both compiled targets now complete all five regions on desktop/mobile, including correct/wrong image answers, visible continuation controls, retries and final results. Application authentication, ownership, Origin and Fetch Metadata checks remain unchanged.

The client verifier reconciles Netlify's lowercase path keys while rejecting missing/altered files and case collisions. Consult the local checkpoint for release/deployment IDs and validation details. The protected placeholder remains available for rollback.

## Essential constraints and references

Public launch must include **random regional replay, Cowrie play access and purchases, and Royal Reveal payments**. Activation requires catalogue readiness, database/runtime configuration and verified payment flows. This requirement does not authorise live payments or public activation during this bug fix. See [random play](random-quick-play.md), [Cowrie access](cowrie-wallet-and-play-access.md), [purchases](cowrie-commerce.md) and [Royal Reveal](commerce-and-entitlement-contract.md).

Keep builds secret-free; install secrets separately. Do not enable hosted builds or Git deployment under the current Personal-plan exception. Preserve migrations, question data, feature defaults, signature checks, authenticated assets, existing websites, DNS, other Workers, staging branch and stash. Keep PR #1 draft and unmerged. No storage binding, migration, seed, payment activation or other external change without authorisation.

- [Hosting contract, commands and rollback](netlify-cloudflare-hosting.md). Its original readiness statements predate the recorded deployment attempt; use the checkpoint below for the latest recorded deployment state.
- [Privacy contract](privacy-controls-contract.md), [retention](retention-schedule.md), [storage gates](storage-binding-readiness.md)
- Local ignored evidence: [deployment checkpoint](../outputs/netlify-deployment-checkpoint.json) and [original package omissions](../outputs/original-worker-package-omissions.json). Release manifests are under `outputs/netlify-worker/<release-id>/release.json`. These are not preserved by Git and may be absent from a fresh clone; independent archival backup remains unverified.
