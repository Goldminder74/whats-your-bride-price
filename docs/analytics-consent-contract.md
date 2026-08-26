# Analytics consent, transport and retention contract

Date: 26 August 2026
Notice version: `analytics-notice-v1`
Category version: `first-party-statistical-v1`

## Consent notice and browser state

Analytics is optional and the quiz works fully after rejection or withdrawal. The interface explains that controlled game-use events, approved regions/surfaces/channels and broad score/duration/file-size bands may be collected to improve the game. It states that names, photographs, answers, contacts, full URLs, codes, credentials, advertising identifiers and fingerprints are excluded, and that raw events expire within 30 days. Accept and Reject have equal 48-pixel controls and effort. Manage preferences remains available in normal document flow without covering game controls.

Before valid acceptance, the app may read only `localStorage["wybp-analytics-consent-v1"]`. It does not access analytics session storage, create an identifier, queue an event, transmit a request, read referral attribution, set a cookie, fingerprint, or load third-party code. Global Privacy Control is treated as rejection unless the player later makes an explicit informed choice.

The preference record is exact-key validated, capped at 384 bytes, versioned, timestamped, tied to the notice version and expires after 180 days. It is independent of quiz recovery and `wybp-anonymous-session-v1`, and contains no advertising/marketing choice. The optional session record is created only after acceptance, contains a cryptographically random 32-lowercase-hex credential and expires after 24 hours. Semantic refresh/Back dedupe keys are bounded to 40 and contain no identifiers.

Rejection creates no analytics identifier or request. Withdrawal immediately stops adapters, clears the memory-only queue, removes the analytics session and dedupe state, remembers only rejection, then uses the former credential once for the same-origin removal action. Server withdrawal deletes that hash's raw analytics/referral/share rows and disables/unlinks its consent row.

## Transport protections

- Endpoint: same-origin `/analytics/events`, POST only.
- HTTPS required outside localhost review; exact Origin and `Sec-Fetch-Site: same-origin` required; mode must be `cors` or `same-origin`.
- Content type must be JSON; body ceiling is 16,384 bytes; batch size is 1 to 10.
- Fetch uses `credentials: omit`, `keepalive`, `referrerPolicy: no-referrer` and a memory-only queue capped at 10.
- UUID v4 idempotency is enforced centrally and across all three event tables.
- The server derives `SHA-256("wybp:analytics-session:v1:" + rawCredential)` and stores only the 64-lowercase-hex digest. A stored hash is never accepted as a credential.
- Consent, D1, central validation, authoritative referral resolution and rate limiting all fail closed.
- No CORS grant, exception text, internal row, ID or hash is returned. Production code writes no analytics console logs.

Production rate limiting is deliberately unavailable in this implementation. An owner-approved independent limiter is required before activation. The in-memory limiter exists only for isolated tests/review and is not a production substitute.

## Retention schedule

| Record | Raw lifetime | Operation |
| --- | --- | --- |
| Version-1 analytics, referral and share events | No more than 30 days from `occurred_at` | Owner/scheduled-job repository method deletes expired rows in bounded batches up to 500; no public route and no automatic build/request execution |
| Analytics consent linkage | Up to 180 days unless rejected, withdrawn, deleted or superseded | Expiry/deletion index; withdrawal immediately nulls the session hash and disables statistical consent |
| Browser analytics session | Up to 24 hours or tab close | Rotates on expiry; immediately cleared on rejection/withdrawal |
| Browser preference | 180 days | Invalid, expired or notice-version-mismatched record is removed |
| Non-identifying aggregate counts | Requires separate owner retention approval | Cannot identify or extract a withdrawn session after aggregation; this limitation must be disclosed and never described as full erasure of already anonymous totals |

The retention operation is idempotent, bounded, owner-only at repository level and never contacts hosted storage during ordinary tests/builds. `deletionEndpointActive` remains false because no independently reviewed public deletion endpoint covers this data.

## Production activation decisions

Activation requires owner and appropriate legal review of the notice, lawful basis, GPC behavior, retention and withdrawal language. It also requires an approved D1 binding, explicit hosted application of migrations through `0005`, an external fail-closed rate limiter, scheduled retention ownership, deletion/aggregate planning, monitoring without sensitive logs, and an approved production test/deployment plan. D1/R2 are currently null and nothing in this contract authorises deployment, migration or analytics activation.
