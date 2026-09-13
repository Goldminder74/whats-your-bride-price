# First-party analytics event dictionary

Date: 26 August 2026
Schema version: 1
Reporting basis: `consented_measured_traffic`

Analytics is disabled by default through `first_party_analytics=false`. This dictionary does not authorise production activation. Query parameters cannot change build-time flags, no third-party SDK is present, and review fixtures require both the review-build and analytics-fixture gates.

## Active events and deterministic routing

The central map in `db/analyticsContracts.ts` assigns each event to exactly one table. Clients never choose a table.

| Destination | Exact active event names |
| --- | --- |
| `analytics_events` | `app_visit`, `edition_select`, `quiz_start`, `first_question_start`, `quiz_complete`, `result_view`, `result_publish`, `result_unpublish`, `challenge_create`, `challenge_view`, `challenge_accept`, `challenge_complete`, `comparison_view`, `comparison_outcome`, `nomination_open`, `share_centre_open`, `story_video_open`, `story_video_render_start`, `story_video_render_complete`, `story_video_render_failed`, `consent_accept`, `consent_reject`, `consent_withdraw` |
| `referral_events` | `referred_visit`, `referred_quiz_start` |
| `share_events` | `share_intent`, `share_handoff`, `nomination_share_intent`, `nomination_share_handoff`, `story_video_share_intent`, `story_video_share_handoff`, `story_video_download`, `story_static_fallback` |

`consent_reject` is local-only and ingestion rejects it because rejection must not create an identifier or request. Consent actions are also rejected from ordinary event batches. Withdrawal uses the dedicated removal action and is not consent for another event. The commerce names `offer_view`, `checkout_start`, `checkout_complete`, `purchase_complete`, `payment_failed` and `refund_complete` are accepted only by the analytics service when both consent-controlled analytics and commerce are enabled. The ordinary validator still rejects them.

`offer_view` means the paid offer became visible. `checkout_start` requires deliberate navigation after authoritative pending-order creation. `checkout_complete`, `purchase_complete`, `payment_failed` and `refund_complete` require authoritative webhook-derived status; redirects never emit them. These events contain no Stripe ID, order reference, credential, name, email, exact instrument or payload. Commerce continues to work after analytics rejection.

## Exact permitted payload fields

Envelope fields are `name`, `eventSchemaVersion`, `consentNoticeVersion`, `clientEventUuid`, `occurredAt`, `properties`, and the transport-only `referralChallengeCode` for the two referral events. Property keys are exactly `edition`, `surface`, `channel`, `outcome`, `nominationSlot`, `scoreBand`, `maximumScoreVersion`, `featureState`, `durationBucket`, `fileSizeBucket`, `source`, `campaign`, and `referred`.

Enums are centrally controlled. Channels are `whatsapp`, `facebook`, `facebook_story`, `instagram`, `tiktok`, `native`, `copy`, `download`, and `static`. Score is only a band: `learning`, `growing`, `strong`, or `mastery`. Maximum-score version is `12-v1`. Duration and file size are broad buckets, never exact high-cardinality measurements.

## Prohibited data

Never collect or transmit names, display-name text, private photographs, avatar bytes, answer choices, answer text, free text, email addresses, phone numbers, contacts, IP addresses, user-agent strings, browser fingerprints, full referrer URLs, full query strings, result slugs, stored challenge codes, analytics credentials or hashes, subject/ownership hashes, revocation tokens, idempotency keys, internal database IDs, payment data, precise location, biometric data, advertising identifiers, filenames or media bytes.

A raw valid challenge code may appear only in the same-origin request body for immediate authoritative referral resolution. The server validates it, resolves an active challenge relationship, discards the code and stores only the internal relationship. Public responses never include that relationship.

## Handoff semantics

`share_handoff`, `nomination_share_handoff` and `story_video_share_handoff` mean only an established browser handoff: successful WhatsApp navigation, resolved native file/link sharing, or successful clipboard write as applicable. They never assert message delivery, receipt, publication, impression, platform selection or purchase. Cancelled, blocked and failed actions are not handoffs.

## Funnel definitions

Every metric returns `{ numerator, denominator, rate }`; a zero denominator returns rate 0.

| Metric | Numerator | Denominator |
| --- | --- | --- |
| Visit-to-start | `quiz_start` | `app_visit` |
| Start-to-completion | `quiz_complete` | `quiz_start` |
| Completion-to-share-intent | all share-intent families | `quiz_complete` |
| Completion-to-share-handoff | all share-handoff families | `quiz_complete` |
| Nomination handoffs per completion | `nomination_share_handoff` | `quiz_complete` |
| Referred-visit-to-start | `referred_quiz_start` | `referred_visit` |
| Challenge-view-to-accept | `challenge_accept` | `challenge_view` |
| Challenge-accept-to-completion | `challenge_complete` | `challenge_accept` |
| Story-open-to-render | `story_video_render_complete` | `story_video_open` |
| Story-render-to-handoff | `story_video_share_handoff` | `story_video_render_complete` |

Viral coefficient is nomination handoffs per completed game multiplied by referred-visitor start rate. The initial targets produce `2.5 × 0.45 = 1.125`. This is descriptive measurement of consented traffic, not statistical certainty or total-traffic attribution.

## Prompt 18 owner reporting boundary

The private dashboard applies these formulas only after joining each event's internal session hash to an active, non-withdrawn, non-deleted `analytics-notice-v1` consent with statistical consent true, marketing false and consent expiry after read time. It also requires schema version 1, event `deleted_at IS NULL`, event `expires_at` after read time and a bounded inclusive UTC period. The browser receives only aggregates.

Game mode is not a Prompt 16 property. Prompt 18 therefore provides no mode input, does not send a mode predicate and labels the dimension “Unsupported by the current analytics data contract.” Source, surface and edition remain distinct. The contextual future feature names `groom_mode`, `couples_mode` and `party_mode` are not added to the active event or property allowlists.

The complete additional completion-to-result-view and future disabled commerce formulas, channel limitations, sample rule and viral target are defined in `docs/funnel-and-viral-coefficient-definitions.md`.
