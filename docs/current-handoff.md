# Current handoff

## Source checkpoint

Checked 30 September 2026: branch `feature/viral-build-sprint`, HEAD and local remote-tracking ref `origin/feature/viral-build-sprint` both at `06ad6d97f0ba6a391a1f43f65d47bc314036f082` (`fix: include server modules in Worker releases`). The remote was verified after the push; this documentation check did not fetch again. The working tree was clean before these handoff additions. PR #1 was last verified open, draft and unmerged, with base `master`.

## Implemented versus deployed

The Vinext/Vite application supports a private Netlify client and signed proxy requests to a Cloudflare Worker. Compiled navigation repairs and Worker packaging verification are committed. Explicit ESModule rules now include all 138 server modules; the regression reproduces the original omission. Packaging, hosting-security, both compiled navigation targets and the rebuilt release verifier passed at this source checkpoint.

The isolated application upload was rolled back after live checks failed. **[wybp-protected-test](https://wybp-protected-test.netlify.app/) currently serves the protected placeholder, not a verified working application.** Worker `wybp-test-r001` contains the uploaded application version, but its primary and preview endpoints are disabled. Existing websites remain unchanged. D1/R2 are unbound and optional features remain disabled.

## Current task and next action

The working rules and handoff are authorised for a documentation-only commit. The packaging correction is complete; deployment remains blocked by the issues below. Do not repeat passed packaging checks for unchanged source or redeploy the known failing build.

Before resuming deployment, obtain authorisation for the narrow same-origin credential correction and regression: image-answer submission uses `credentials: "omit"`, dropping the private Netlify access cookie and returning 401. A correctly signed Worker request succeeds. Preserve application authentication, ownership, Origin and Fetch Metadata checks.

Also resolve the post-upload client checksum comparison: 29 JavaScript/CSS entries differ in the API comparison. The cause is not established; do not claim a matched live release yet. Then follow the existing runbook for authorised rebuild, matched deployment, live verification and rollback.

## Essential constraints and references

Keep builds secret-free; install secrets separately. Do not enable hosted builds or Git deployment under the current Personal-plan exception. Preserve migrations, question data, feature defaults, signature checks, authenticated assets, existing websites, DNS, other Workers, staging branch and stash. Keep PR #1 draft and unmerged. No storage binding, migration, seed, payment activation or other external change without authorisation.

- [Hosting contract, commands and rollback](netlify-cloudflare-hosting.md). Its original readiness statements predate the recorded deployment attempt; use the checkpoint below for the latest recorded deployment state.
- [Privacy contract](privacy-controls-contract.md), [retention](retention-schedule.md), [storage gates](storage-binding-readiness.md)
- Local ignored evidence: [deployment checkpoint](../outputs/netlify-deployment-checkpoint.json) and [original package omissions](../outputs/original-worker-package-omissions.json). Release manifests are under `outputs/netlify-worker/<release-id>/release.json`. These are not preserved by Git and may be absent from a fresh clone; independent archival backup remains unverified.
