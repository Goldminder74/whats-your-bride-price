# Current handoff

## Source checkpoint

Checked 30 September 2026: branch `feature/viral-build-sprint`, HEAD and local remote-tracking ref `origin/feature/viral-build-sprint` both at `06ad6d97f0ba6a391a1f43f65d47bc314036f082` (`fix: include server modules in Worker releases`). The remote was verified after the push; this documentation check did not fetch again. The working tree was clean before these handoff additions. PR #1 was last verified open, draft and unmerged, with base `master`.

## Implemented versus deployed

The Vinext/Vite application supports a private Netlify client and signed proxy requests to a Cloudflare Worker. Compiled navigation repairs and Worker packaging verification are committed. Explicit ESModule rules now include all 138 server modules; the regression reproduces the original omission. Packaging, hosting-security, both compiled navigation targets and the rebuilt release verifier passed at this source checkpoint.

The isolated application upload was rolled back after live checks failed. **[wybp-protected-test](https://wybp-protected-test.netlify.app/) currently serves the protected placeholder, not a verified working application.** Worker `wybp-test-r001` contains the uploaded application version, but its primary and preview endpoints are disabled. Existing websites remain unchanged. D1/R2 are unbound and optional features remain disabled.

## Current task and next action

The working rules and handoff were committed as `04db1a2002fd8171dd18e8c898824d8c98448fcb`. The user has now authorised the scoped credential correction, regression, checksum reconciliation, commit/push and isolated redeployment. Preserve the completed packaging fix.

The image-answer POST now uses `credentials: "same-origin"` rather than `"omit"`, preserving the private access cookie. Both compiled browser harnesses check the actual cookie-bearing request and authoritative answer. Application authentication, ownership, Origin and Fetch Metadata checks remain unchanged.

The 29 apparent checksum mismatches were lowercase API path keys, not altered bytes: all 109 archived client digests match. The new client verifier detects missing/altered files and case collisions. Complete validation and fresh matched release deployment; retain the protected placeholder until ready, and restore it and disable Worker endpoints if live verification fails. Consult the local checkpoint for the resulting deployment IDs and verification state.

## Essential constraints and references

Keep builds secret-free; install secrets separately. Do not enable hosted builds or Git deployment under the current Personal-plan exception. Preserve migrations, question data, feature defaults, signature checks, authenticated assets, existing websites, DNS, other Workers, staging branch and stash. Keep PR #1 draft and unmerged. No storage binding, migration, seed, payment activation or other external change without authorisation.

- [Hosting contract, commands and rollback](netlify-cloudflare-hosting.md). Its original readiness statements predate the recorded deployment attempt; use the checkpoint below for the latest recorded deployment state.
- [Privacy contract](privacy-controls-contract.md), [retention](retention-schedule.md), [storage gates](storage-binding-readiness.md)
- Local ignored evidence: [deployment checkpoint](../outputs/netlify-deployment-checkpoint.json) and [original package omissions](../outputs/original-worker-package-omissions.json). Release manifests are under `outputs/netlify-worker/<release-id>/release.json`. These are not preserved by Git and may be absent from a fresh clone; independent archival backup remains unverified.
