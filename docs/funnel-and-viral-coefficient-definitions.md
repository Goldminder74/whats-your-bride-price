# Funnel and viral-coefficient definitions

Date: 27 August 2026
Reporting basis: `consented_measured_traffic`
Timezone: UTC
Small-sample threshold: denominator below 20

Every dashboard count uses only event schema version 1, an active `analytics-notice-v1` statistical consent with marketing false, a non-withdrawn/non-deleted consent row, a non-deleted event, and an event and consent record unexpired at read time. Date ranges are inclusive calendar days, parameterized, and limited to 30 days. This is measured traffic after consent and can never be labelled total traffic.

## Core counts

Visits = `app_visit`; unique sessions = distinct internal `analytics_session_hash` among qualifying filtered events, never returned; starts = `quiz_start`; first-question starts = `first_question_start`; completions = `quiz_complete`; result views/publications/unpublications = their exact events. Challenge, comparison, nomination, referral and Story totals each use the identically named version-1 event. Win/tie/loss use `comparison_outcome.properties.outcome` values `beat`, `tied` and `did_not_beat`.

Share intentions sum `share_intent`, `nomination_share_intent` and `story_video_share_intent`. Browser handoffs separately sum `share_handoff`, `nomination_share_handoff` and `story_video_share_handoff`. A handoff means a successful browser navigation, native-share resolution or clipboard operation under the event contract. It does not mean delivery, receipt, message send, publication or impression. `story_video_download` and `story_static_fallback` remain separate.

## Funnel formulas

| Funnel | Numerator | Denominator |
| --- | --- | --- |
| Visit to start | `quiz_start` | `app_visit` |
| Start to completion | `quiz_complete` | `quiz_start` |
| Completion to result view | `result_view` | `quiz_complete` |
| Completion to share intention | all three share-intention families | `quiz_complete` |
| Completion to browser handoff | all three share-handoff families | `quiz_complete` |
| Nomination handoffs per completed game | `nomination_share_handoff` | `quiz_complete` |
| Referred visit to start | `referred_quiz_start` | `referred_visit` |
| Challenge view to acceptance | `challenge_accept` | `challenge_view` |
| Challenge acceptance to completion | `challenge_complete` | `challenge_accept` |
| Story open to render completion | `story_video_render_complete` | `story_video_open` |
| Story render to handoff | `story_video_share_handoff` | `story_video_render_complete` |
| Offer view to checkout start | `checkout_start` | `offer_view` |
| Checkout start to purchase | `purchase_complete` | `checkout_start` |

A zero denominator yields no rate and the explicit `zero_denominator` state—not 0%, NaN or Infinity. Denominators from 1 through 19 are labelled directional small samples. Commerce funnels are disabled while commerce is disabled; they are not fabricated as zero.

## Viral coefficient

Observed nomination handoffs per completed game × observed referred-visitor start rate = observed viral coefficient. The target marker is `2.5 × 0.45 = 1.125`. Target values are visually and textually labelled as targets and never substituted for observed results.

## Dimension and attribution limitations

Edition, source and campaign use only controlled values stored on the event. Missing values remain `unknown`. Narrow source/campaign cohorts are suppressed below 20 measured visit/start events. Share-event storage does not retain edition, source or campaign; referral-event storage retains source but not edition or campaign. A filter requiring an absent dimension makes the affected share/referral metric unavailable instead of zero.

Game-mode filtering and comparison are intentionally unsupported by owner decision. Version-1 events do not store game mode. Source, surface, edition, URL, campaign, challenge state and result state are not reinterpreted as mode. The future contextual identifiers `groom_mode`, `couples_mode` and `party_mode` are documentation only; they are not analytics values or filters, and no invented solo identifier exists.

Exact median quiz time, visit-to-start time and completion-to-first-share time are unsupported because the contract stores broad duration buckets and does not identify individual journeys within a session. Daily return and streak retention are unsupported because the anonymous analytics credential lasts only 24 hours and cannot reconnect sessions. The dashboard may show aggregate duration-bucket distribution but not a fabricated median.

## Channels

Version-1 controlled channels are `whatsapp`, `facebook`, `facebook_story`, `instagram`, `tiktok`, `native`, `copy`, `download` and `static`. The requested exact labels `instagram_story`, `clipboard`, `copy_link` and `direct` are visibly unsupported: no active value is merged or substituted. Direct is a source, not a channel. Channel tables keep intentions, handoffs, downloads and static fallbacks in separate columns.
