# Viral growth implementation map

Audit date: 22 August 2026
Status convention: `READY` means technically eligible to schedule, not approved for production. `BLOCKED` means the work must not be implemented under the current hosting condition.

## Delivery principles

- Preserve the existing solo quiz, regional visual identities, educational answer reveals, avatars, private-photo default and free result.
- Add server authority before treating scores, challenges, referrals, leaderboards or entitlements as trusted.
- Keep the public quiz anonymous-compatible. Optional identity must never block play.
- Use opaque public identifiers and safe public projections.
- Count share intent and handoff honestly; never infer a delivered message or published post.
- Keep private photos on-device by default and out of Open Graph, party and public result assets.
- Use first-party, privacy-minimised measurement. Do not add ad pixels or cross-site tracking.
- Keep all payment work blocked while the application is hosted on ChatGPT Sites.
- Require human cultural review before publishing expanded question banks or new motifs.

## Recommended dependency topology

```text
AUDIT-01 complete
  -> FND-01 regression baseline complete
     -> FND-02 feature flags, error handling and Sites commerce guard complete
        -> ORIGIN-01 canonical origin and public-access readiness
        -> ENTRY-01 fast social entry
        -> SAFE-01 permanent safeguard
        -> DATA-01 D1/R2 model
           -> ID-01 anonymous identity and safe local photos
           -> QBNK-01 versioned question engine
           -> ANALYTICS-01 event collector
           -> RESULT-01 server-authoritative attempts/results
              -> CHAL-01 challenge service
                 -> CHAL-02 challenge landing
                    -> CHAL-03 comparison
                       -> NOM-01 nominate three
                          -> SHARE-01 share centre
              -> MEDIA-01 regional render model
                 -> OG-01 permanent result URLs and dynamic previews
                 -> STORY-01 Story/Reel media
           -> PRIV-01 UK privacy and storage controls
           -> DASH-01 owner analytics dashboard
           -> DAILY-01 random/daily/streak retention
           -> MODE-01 Groom/Couples
              -> PARTY-01 party leaderboard

QBNK-01 -> QREVIEW-01 regional research and human approval -> DAILY-01
PRIV-01 + ANALYTICS-01 -> SPONSOR-01 optional sponsorship controls
DATA-01 + complete free journeys -> MIG-01 migration plan -> MIG-02 approved host migration
MIG-02 proven in production -> PAY-01/PAY-02 payment work
All enabled features -> QA-01 final preflight -> LAUNCH-01 controlled launch
Stable analytics + sufficient sample -> EXP-01 A/B testing
SPONSOR-01 + cultural approval -> SPON-WEEKLY-01 sponsored weekly pilot
```

The regional render model is placed before dynamic result and Story work even though the Build Bible introduces it afterwards. This reduces duplicate rendering code and cultural-review rework.

## Prioritised implementation table

Effort is a rough engineering estimate for one experienced developer and excludes owner review, cultural review, legal advice, external platform approval, DNS propagation and production monitoring time.

| Priority | ID | Roadmap | Work item | Depends on | Status | Risk | Expected effort | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | AUDIT-01 | P1 | Repository, privacy, roadmap and runbook audit | None | Complete at this documentation checkpoint | Low | Complete | Four requested documents exist; current behaviour, gaps, dependencies and baseline results are recorded |
| 1 | FND-01 | P2 | Repair lint/typecheck and add behavioural regression/E2E baseline | AUDIT-01 | Complete at `6840645` | Medium | Complete | Build, lint, typecheck, unit and E2E pass; every region, avatar, local photo, full quiz, score, download and sharing/nomination journey is exercised |
| 1 | FND-02 | P2 | Typed feature flags, error boundary and Sites commerce build guard | FND-01 | Complete at `6840645` | High | Complete | All new flags default false; player-safe error UI hides stack traces; a Sites build with `commerce=true` fails deliberately |
| 1 | ORIGIN-01 | P3 | Central canonical origin and custom-domain readiness | FND-02 | READY | High | 1-2 days | Production configuration accepts only expected HTTPS origin; metadata and generated links use `https://brideprice.classesforculture.com`; local preview still works |
| 1 | ENTRY-01 | P4-P5 | Fast, one-tap social entry and ten-second first interaction | FND-02, ORIGIN-01 | READY | High | 4-7 days | Direct region link renders its region without a home flash; safe attribution survives navigation; 320 px, back button, poor-network and social in-app-browser tests pass; first meaningful choice meets agreed timing budget |
| 1 | SAFE-01 | P6 | Permanent human-worth safeguard and inclusive copy review | FND-01 | READY | Medium | 1-2 days plus owner review | Exact safeguard appears near start, before photo use, on results and in generated share compositions; automated presence tests pass |
| 2 | DATA-01 | P7 | Sites D1/R2 schema, migrations and typed data-access layer | FND-02 | READY after binding approval | High | 6-10 days | Preview D1 migrations pass forward/rollback tests; public/private projections are enforced; retention and indexes are verified; no payment tables exist |
| 2 | ID-01 | P8 | Anonymous functional sessions, safe names, stable avatar IDs and hardened local photos | DATA-01 | READY | High | 4-7 days | Malicious/Unicode names, forged/oversized images, EXIF removal, dimension caps, remove-photo, expiry, deletion token and unauthorised access tests pass |
| 2 | RESULT-01 | P7-P9 foundation | Server-authoritative attempts and completed results | DATA-01, ID-01, QBNK-01 or compatible transitional schema | READY after DATA-01 | High | 4-6 days | Browser-tampered score is rejected; exact question/scoring version is stored; duplicate completion is idempotent; safe public projection excludes private data |
| 2 | QBNK-01 | P20 | Versioned, sourced, reviewable question-bank engine | DATA-01, FND-02 | READY | High | 6-10 days | Only published questions can be selected; selection is seeded, balanced and duplicate-free; every attempt records exact versions; current 60 questions migrate unchanged |
| 3 | CHAL-01 | P9 | Opaque challenge creation/retrieval/expiry/revocation | RESULT-01, ORIGIN-01 | READY after dependencies | High | 5-8 days | Codes resist guessing/collision; repeated taps are idempotent; tampered scores fail; expired/revoked states return safe generic responses |
| 3 | CHAL-02 | P10 | Server-rendered personalised challenge landing | CHAL-01, ENTRY-01 | READY after dependencies | High | 3-5 days | Raw HTML contains safe inviter/avatar/edition/score-to-beat; one tap begins correct region; crawler fetch creates no acceptance; invalid codes do not leak existence |
| 3 | CHAL-03 | P11 | Challenge completion and score comparison | CHAL-02, RESULT-01 | READY after dependencies | High | 4-7 days | Beat/tie/did-not-beat, incompatible scoring, deleted inviter, duplicate and concurrent completion tests pass without shaming copy |
| 3 | NOM-01 | P12 | Three-person nomination flow and legacy `nominated=1` compatibility | CHAL-03 | READY after dependencies | Medium | 3-5 days | Three intents can be initiated in under 30 seconds; no contact data is requested/stored; cancelled shares are not counted as messages; old links remain safe |
| 3 | SHARE-01 | P13 | Explicit multi-platform Share Centre | CHAL-01, OG-01, NOM-01 | READY after dependencies | Medium | 4-6 days | WhatsApp, Facebook, copy, native share and Instagram/TikTok file fallbacks use canonical URLs; unsupported/cancelled API tests and accessible confirmations pass |
| 3 | MEDIA-01 | P16 | Central regional design tokens and shared render model | FND-02, cultural review input | READY | High | 4-7 days plus cultural review | In-app, OG, portrait and Story fixtures consume one model; all five regions pass contrast, Unicode, missing-asset and visual-regression tests; provenance is documented |
| 3 | OG-01 | P14 | Permanent `/result/{slug}` pages and dynamic Open Graph assets | RESULT-01, MEDIA-01, ORIGIN-01, R2 | READY after dependencies | High | 6-10 days | Two results produce different opaque URLs, server-rendered metadata and fetchable images; bot tests work without JavaScript; no private photo or secret appears |
| 4 | STORY-01 | P15 | Five-second 9:16 Story/Reel media with fallback | MEDIA-01, RESULT-01, SHARE-01 | READY after dependencies | High | 7-12 days | Supported browsers create measured five-second media; unsupported/reduced-motion/low-memory modes create a 9:16 PNG; resources are cancelled and released correctly |
| 4 | ANALYTICS-01 | P17 | First-party event taxonomy and validated event collector | DATA-01, PRIV-01 design, FND-02 | READY after dependencies | High | 5-8 days | Allowlist rejects prohibited/oversized data; event-order tests pass; opt-out blocks optional events; bots are separated; quiz works when analytics is unavailable |
| 4 | PRIV-01 | P19 | UK privacy, storage controls and clear-local-data flow | DATA-01 design, ID-01 | READY | High | 5-8 days plus legal review | Machine-readable storage inventory matches UI; optional measurement can be rejected/changed; local data clears; no non-essential script runs before choice |
| 4 | DASH-01 | P18 | Owner-only funnel and viral-coefficient dashboard | ANALYTICS-01, server-side owner authorisation | READY after dependencies | High | 5-8 days | Anonymous users receive no dashboard data; filters and viral formula match fixture queries; share handoff is never counted as a sent message |
| 5 | QREVIEW-01 | P21 | Research 65 candidates per region and human approval gate | QBNK-01 | READY as five separate research/review projects | High | 5-10 days per region plus reviewer time | Draft import, review sheet, source register, issue log and coverage report pass validation; only human-approved entries can become published |
| 5 | DAILY-01 | P22 | Random play, deterministic daily challenges and streaks | QBNK-01, QREVIEW-01, DATA-01, ANALYTICS-01, PRIV-01 | READY after dependencies | High | 6-10 days | Seed/date/DST/leap-day/retry/duplicate/offline/streak-reconciliation tests pass; normal anonymous play remains available |
| 5 | MODE-01 | P23 | Groom and Couples Challenge modes | CHAL-03, MEDIA-01, PRIV-01 | READY after dependencies | High | 7-12 days | Both completion orders, abandoned/expired/deleted participants, scoring compatibility, sharing and public/private projections pass; no relationship judgement |
| 5 | PARTY-01 | P24 | QR party mode and 20-player leaderboard | DATA-01, RESULT-01, MODE-01 patterns, rate limits | READY after dependencies | Very high | 10-15 days | 25 concurrent joins cap at 20; host token is private; deterministic ties, reconnect, polling backoff, expiry and 20 simultaneous completions pass |
| 6 | MIG-01 | P25 | Commerce-host migration decision and export plan | Stable free data/media model | READY when architecture is stable | High | 4-7 days | Dry-run exports have checksums/row counts/resume; target mapping, rollback and DNS approval gates are documented; no services provisioned |
| 6 | MIG-02 | P26 | Separate Netlify preview, migration and approved cutover | MIG-01, owner/service/DNS approval, all free journeys passing | Not authorised in this task | Very high | 7-15 days plus migration window | Preview passes all journeys and crawler metadata; data reconciles; explicit DNS approval is recorded; SSL/rollback/live writes verified |
| 7 | PAY-01 | P27 | £1.99 Royal Reveal, Stripe checkout and entitlements | MIG-02 proven in production | **BLOCKED on ChatGPT Sites** | Very high | 8-15 days after migration | Must first prove production is off Sites; then test-mode checkout, signed webhooks, idempotency, refunds and expiring access all pass |
| 7 | PAY-02 | P28 | Other paid products, orders and tenant-safe commercial offers | PAY-01 stable, MODE-01, PARTY-01 | **BLOCKED on ChatGPT Sites** | Very high | Multi-release programme | Every entitlement, refund, capacity, expiry and tenant-isolation test passes; each product rolls out separately |
| 7 | TIKTOK-01 | P29 | Official TikTok Content Posting API | Approved TikTok app/scopes, privacy model, suitable host, STORY-01 | Blocked by external approval until proven | Very high | 8-15 days after approval | OAuth/token rotation/status/privacy-option tests pass; disconnect deletes tokens; download/native-share fallback always remains |
| 7 | SPONSOR-01 | P30 | Sponsorship interfaces and optional advertising controls | PRIV-01, ANALYTICS-01, MEDIA-01, owner-approved provider | READY for interfaces only | High | 5-8 days plus legal/brand review | No ad request before valid choice; kill switch/caps/labels work; scoring is unaffected; upload/photo data is never used for targeting |
| 8 | QA-01 | P31 | Full security, accessibility, performance and cultural preflight | All release-candidate features | Not ready | Very high | 7-15 days | No unresolved critical/high findings; WCAG 2.2 AA target, mobile budgets, abuse controls, backup/restore and cultural approvals are evidenced |
| 8 | LAUNCH-01 | P32 | Controlled production launch and monitoring | QA-01, explicit production approval | Not ready | Very high | 3-5 days plus monitoring | Owner smoke, invited cohort and staged public gates pass; anonymous/custom-domain/social previews work; rollback thresholds and previous version are confirmed |
| 9 | EXP-01 | P33 | Privacy-minimised CTA experiment | Stable ANALYTICS-01, sufficient sample, LAUNCH-01 | Deferred | Medium | 3-5 days plus experiment duration | Server assignment has no flicker; exposure precedes outcome; stopping rule/sample size are predefined; primary metric is referred starts per completion |
| 9 | SPON-WEEKLY-01 | P34 | Synthetic sponsored weekly challenge pilot | SPONSOR-01, DAILY-01, cultural approval | Deferred | High | 3-5 days plus approvals | Clear sponsor label, dates/expiry, approved Culture Gem, aggregate reporting and no score change or third-party pixel |

## Payment and commerce gate

No Stripe package, payment link, checkout button, transaction redirect, price activation, payment table or entitlement unlock may be added while the production quiz is served by ChatGPT Sites. `PAY-01` and `PAY-02` remain **BLOCKED** until `MIG-02` is complete and the live production origin is demonstrably served by an approved commerce-capable host.

Premium previews on Sites must remain descriptive and non-transactional. They must not accept money, redirect to a payment transaction or imply that a browser/localStorage flag is a paid entitlement.

## Immediate recommended slice

`FND-01` and `FND-02` are complete in the approved regression-foundation commit. The next Build Bible task is `ORIGIN-01` / Prompt 3: verify public access and centralise the intended canonical origin without changing DNS. It should begin only as a separately approved prompt and must preserve the passing regression gate and commerce guard.
