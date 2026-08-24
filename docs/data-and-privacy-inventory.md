# Data and privacy inventory

Audit date: 23 August 2026
Scope: current repository behaviour only. Hosting-provider operational logs and access-policy data are outside the source repository and were not inspected.

## Current privacy posture

The app is a device-local anonymous experience. It has no active application database, object storage, analytics collector, account system or application write API. A selected original photo and the sanitised copy are never transmitted by application code. Ordinary production persists only the browser-local map of best regional scores. The feature-flagged fast-entry build also keeps a short-lived, tab-gated quiz recovery record and a separate tab-scoped anonymous functional session described below.

Prompt 8 adds binary signature checks, bounded pixel re-encoding, metadata-marker tests, Unicode-safe name validation, a clear-local-data action and an inactive deletion-service contract. Residual risks are browser/codec behaviour on low-memory devices, provider logs outside the repository, no standalone privacy route, and no live deletion mechanism because durable storage remains inactive.

## Preview D1 gate record, 23 August 2026

The approved preview-only request named `wybp-preview` with logical binding `DB` for development and preview testing of results, challenges and referrals. Provisioning stopped before any mutation because the available Sites interface could not enumerate account-wide D1 resources or express and prove same-project preview isolation from the public live deployment.

The live deployment overview returned no D1 bindings and no tables. Repository configuration remains `d1: null` and `r2: null`. No database, bucket, binding, preview application, migration ledger, seed, table, row, media object or application personal record was created or accessed. Migrations applied: none. Seed applied: none. Preview table and row counts: not applicable because the resource does not exist.

Activation requires the six operator-provided isolation proofs in `docs/storage-binding-readiness.md`, followed by the approved empty-target, checksum, migration, idempotency, deterministic-seed, projection and fail-closed checks. Production data must remain inaccessible throughout.

At this historical checkpoint, Prompt 9 remained blocked. The recommended next option was a separately created, owner-only staging Site with its own isolated D1 database. It must not share a binding, deployment or data path with the live public Site, which must remain untouched and unbound.

### Isolation resolution, 23 August 2026

The separate restricted Site now exists as **What’s Your Bride Price Staging** at `https://whats-your-bride-price-staging.ayo43077.chatgpt.site/`. Sign-in protects custom restricted access, the owner is the only permitted viewer, and workspace administrators retain normal oversight. Its isolated D1 database is bound as `DB` and is empty with zero tables. R2 is null, no custom domain is connected, no production data was imported, and no migrations, seeds or public writes have occurred.

The live Site at `https://brideprice.classesforculture.com` remains separate, unbound and unchanged. The historical same-Site blocker remains part of the audit record. At this checkpoint Prompt 9 was paused pending official staging source association and validation of a non-deployed staging build. Migration and seed approval remained separate future gates.

## Prompt 5 fast-entry preview boundary

Prompt 5 adds a local, feature-flagged fast journey while `fast_entry` remains false in ordinary production builds. The preview implementation does not bind D1 or R2, call an analytics collector, add a service worker or transmit a player photo. It introduces two strictly functional recovery keys:

- `localStorage["wybp-active-quiz-v1"]` contains schema version 1, a random tab instance ID, edition, stable avatar ID, next question position, selected option indexes for answered questions, an update timestamp, allowlisted attribution and an optional trusted challenge code. It expires after 24 hours and rejects malformed, oversized, future, stale or incompatible data.
- `sessionStorage["wybp-active-quiz-instance-v1"]` contains only the matching random instance ID. Recovery is allowed only when this tab-scoped value matches the local record, preventing a new tab or another browser session from silently adopting a previous player's in-progress identity.

Names, raw anonymous session IDs, photos, blobs, object URLs, filenames, score claims, free text, answer text, correct-answer text, raw URLs, secrets and HTML are prohibited from the recovery record. `Start again` removes both recovery keys. `Clear local quiz data` also clears recovery, best scores and this tab's anonymous session. Storage errors are caught and never block the quiz. The fast avatar step accurately explains the 24-hour, tab-scoped, non-authoritative recovery boundary.

Trusted challenge readiness is an input boundary, not a public query-string trust mechanism. The client accepts only a complete validated `TrustedChallengeEntry` passed by the server layer. Raw inviter names and claimed scores in a URL are ignored. The only current personalised record is a controlled local review fixture gated by both `WYBP_REVIEW_BUILD=true` and `WYBP_REVIEW_CHALLENGE_FIXTURES=true`, with the `challenges` feature flag enabled. Ordinary production builds cannot resolve it. Rendering a challenge does not create an acceptance record; the player must explicitly accept before reaching the avatar step.

## Current data inventory

| Data item | Example/shape | Source | Processing location | Storage | Current lifetime | Leaves device? | Sensitivity and notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selected region | `west`, `east`, `central`, `north`, `south` | Player choice or `edition` query | Browser | React state; also URL query | Until navigation/restart; URL may persist in history/share | Yes, in URL and share link | Low sensitivity; can be an inferred interest, not a verified identity |
| Display name/pseudonym | Optional NFC string, at most 30 grapheme clusters | Player input | Browser | React state only | Until restart/refresh/page close | Only in a deliberately generated local portrait or share text, never a URL | Leading/trailing whitespace is trimmed, internal whitespace collapsed, and controls, unsafe bidi/invisible formatting and angle brackets rejected; fallback is `A Most Excellent Player`, never `Guest` |
| Selected avatar | Stable allowlisted avatar ID resolved to a static asset URL | Player choice | Browser | React state; Prompt 5 recovery record when `fast_entry` is enabled | Current attempt; recovery expires after 24 hours | Yes, avatar pixels can be included in result share | Low sensitivity; IDs are stable and reject uploaded-photo or unknown values |
| Original selected image | Ephemeral `File` and byte buffer after an explicit picker action | Player file picker | Browser only | Function-local memory during validation/decode | Until processing succeeds, fails, is cancelled or is superseded | No | JPEG, PNG or WebP declaration, extension and binary container must agree; SVG, GIF, HEIC, active-content markers, trailing polyglot content where detected, malformed containers, more than 8 MB, more than 6000 px per side or more than 24 MP are rejected |
| Sanitised private photo | Fresh JPEG made from decoded pixels | Browser pixel decoder and clean canvas | Browser only | In-memory Blob plus one local object URL | Up to 30 minutes, or earlier removal, replacement, avatar selection, restart, failure, cancellation or unmount | Only in a deliberate local download or OS file share composition | Maximum 1600 px side, aspect ratio preserved, JPEG quality 0.90, maximum 3 MB; EXIF/GPS/device/thumbnail/comment data is not copied and controlled markers are asserted absent |
| Rendered portrait pixels | Cropped sanitised private photo or approved avatar pixels drawn into result canvas | Browser only | Canvas memory, then PNG Blob | Until operation completes/GC or downloaded file is deleted by player | Yes, only through explicit share or download | Public URLs, metadata, challenge previews and future public result projections use approved avatars and regional artwork, never this private photo |
| Quiz answers | Binary correctness values in memory; selected option indexes in Prompt 5 recovery | Player actions | Browser | React state; versioned local recovery only when `fast_entry` is enabled | Attempt lifecycle; recovery expires after 24 hours and is tab-gated | Not directly | Behavioural/game data. Recovery recomputes scores from the unchanged question bank rather than trusting a stored score |
| Score | Integer `0..12` | Client calculation | Browser | Derived React value | Until restart/refresh/page close | Yes, in shared text/result PNG | Not server-verified; must not be trusted for future competitions or entitlements |
| Result tier | Four named tiers | Client calculation | Browser | Derived value | Until restart/refresh/page close | Yes, in shared text/result PNG | Entertainment result |
| Aura/streak/gem state | Numeric game feedback | Client calculation | Browser | React state | Current attempt only | Aura appears in UI, not current share text | Functional game state, not a durable retention streak |
| Regional best scores | Object keyed by five regions | Completed results | Browser | `localStorage` key `wybp-region-scores` | Until site data or `Clear local quiz data` is used | No automatic transfer | Functional device-local convenience, not authoritative |
| Anonymous functional session | Versioned 128-bit lowercase hexadecimal identifier with creation and expiry | Web Crypto | Browser | `sessionStorage` key `wybp-anonymous-session-v1` | Current tab, maximum 24 hours before rotation | No | Raw value is private, never logged, transmitted, placed in URLs/metadata/events/recovery or used for advertising. Future durable use requires an approved server-side pseudonymous or salted-hash representation |
| Sound preference | Boolean | Player toggle | Browser | React state only | Current page lifecycle | No | Functional preference; resets on refresh |
| Shared nomination URL | `?edition={region}&nominated=1` | Client construction | Browser/recipient platform | OS share target, clipboard or WhatsApp | Controlled by external target | Yes, by explicit action | Contains region and nomination marker only; `nominated=1` is ignored by recipient app |
| Shared result text | Score, tier, region and link | Client construction | Browser/OS share target | External target chosen by player | External target policy | Yes, by explicit action | May be associated with the player's chosen identity outside the app |
| Downloaded result | PNG with portrait/avatar, name, score, tier and region | Canvas renderer | Browser/device | Downloads/file storage | Until player deletes it | Stored on player's device; may be re-shared | Contains personal image pixels if a photo was selected |
| Clipboard content | Nomination copy and URL | Nominate fallback | Browser/OS clipboard | System clipboard | OS-defined | Available to other local apps per OS policy | Current code may report success without verifying the write |
| Audio/vibration signals | Generated tones and vibration pattern | Game interaction | Browser/device | AudioContext/memory only | Current page lifecycle | No network transfer | AudioContext is retained and not explicitly closed |
| Local error diagnostic | Allowlisted error code, message and small context object | Runtime failures | Browser console | Developer tools/console only | Browser-defined | Not transmitted by application code | No stack trace is shown in the player UI; messages could still contain browser-supplied failure text and should not receive personal data |
| HTTP request data | URL, headers and standard connection data | Browser/hosting platform | Hosting infrastructure | Not defined in repository | Unknown | Reaches hosting provider | Provider logs/access policy are outside repository scope; the app's structured error helper logs locally and has no network collector |
| Optional ChatGPT identity headers | User ID, email, optional full name | Sites/SIWC platform | Server, if helpers are called | None in current quiz | Not used | Headers reach runtime if platform supplies them | `app/chatgpt-auth.ts` exists but is unused; the quiz does not read or persist these values |

## Data stores and bindings

### Browser storage

| Store | Key | Purpose | Expiry | Clear mechanism | Authority |
| --- | --- | --- | --- | --- | --- |
| `localStorage` | `wybp-region-scores` | Preserve each region's best score and five-seal mastery progress | None | Browser/site-data controls only | Device-local convenience, not authoritative |
| `localStorage` | `wybp-active-quiz-v1` | Prompt 5 accidental-refresh recovery for minimal quiz state | 24 hours from last valid write | Visible `Start again`, automatic rejection/clear, or browser controls | Device-local convenience, not authoritative |
| `sessionStorage` | `wybp-active-quiz-instance-v1` | Require the same tab session before local recovery can be used | Tab session | Visible `Start again`, `Clear local quiz data` or tab close | Tab-scoped anti-merge guard, not an identity |
| `sessionStorage` | `wybp-anonymous-session-v1` | Privacy-minimised continuity handle reserved for later approved functional durable operations | 24 hours or tab close; rotates after expiry | `Clear local quiz data` or tab close | Private tab-scoped identifier; not authoritative and not transmitted |

No IndexedDB, Cache Storage, service worker, application cookie or browser database use was detected.

### Server and platform storage

| System | Current state |
| --- | --- |
| Sites D1 | Not bound: `.openai/hosting.json` has `"d1": null` |
| Sites R2 | Not bound: `.openai/hosting.json` has `"r2": null` |
| Drizzle schema | 19 storage-ready tables, inactive and unbound |
| Drizzle migrations | Source-controlled D1-compatible migrations plus local synthetic verification only |
| Active API routes | None |
| External database/blob provider | None detected |
| Analytics/event collector | None detected |
| App-owned authentication/session store | None |

The worker type proposes `DB` and `MEDIA`, but `.openai/hosting.json` keeps both bindings null and the worker exposes no application data or deletion route. The unbound repository fails closed and has no browser-storage authority fallback.

## Photo data-flow analysis

```text
Explicit user file-picker action
  -> browser supplies File object
  -> declared MIME, extension and binary signature must agree
  -> reject unsupported, malformed, detected polyglot or oversized input
  -> parse dimensions and orientation before browser decode where possible
  -> decode pixels locally, apply orientation and draw to a clean canvas
  -> resize to at most 1600 px per side, preserve aspect ratio
  -> encode a new JPEG at quality 0.90 and cap it at 3 MB
  -> assert controlled EXIF, GPS and comment markers are absent
  -> discard the original bytes and filename
  -> create one object URL for the sanitised Blob and display locally
  -> replacement, removal, avatar choice, restart, expiry and unmount revoke it
  -> optional canvas drawing for result
     -> new PNG Blob
        -> explicit download, or
        -> explicit navigator.share file handoff
```

No application network call exists in this flow. Neither original nor sanitised photo bytes are written to D1, R2, localStorage, sessionStorage, IndexedDB, diagnostics, events, URLs, metadata or an application server.

### Photo risks and required controls before expansion

1. Browser decoders remain a trusted platform boundary; malformed and low-memory behaviour needs real-device testing across launch browsers.
2. The 8 MB and decoded-dimension limits reduce decompression risk but do not replace browser process isolation; a decode timeout is still a future hardening option.
3. Container checks detect common mismatch, trailing-content and active-text patterns, not every theoretically possible polyglot.
4. Canvas JPEG re-encoding intentionally removes transparency and may vary slightly by browser encoder.
5. If a future user expressly chooses a server upload, require a separate notice, R2 storage, safe content type, ownership metadata, retention, deletion and access control. Selecting a local photo never implies upload consent.

## Sharing and external recipients

| Action | Recipient/controller | Data handed off | Current user gesture | Current issue |
| --- | --- | --- | --- | --- |
| Native result share | OS share sheet and chosen target | Generated PNG where supported, score/tier/region text and nomination URL | Yes | A selected private photo enters the PNG only through this deliberate action; the URL contains no name, session or photo data. Handoff is not proof of publication |
| Native nomination share | OS share sheet and chosen target | Validated optional name in copy, region and generic nomination URL | Yes | Names remain outside the URL; non-cancellation failures are logged only as bounded local error context |
| WhatsApp nomination | WhatsApp/web endpoint | Region and nomination URL | Yes | No durable challenge, score verification or privacy-safe result record |
| Clipboard fallback | OS clipboard | Copy text and URL | Yes | Success is not verified before alerting |
| Download | Local file system/download manager | Generated PNG with optional sanitised private photo | Yes | The result UI explains that a private photo enters only a deliberately downloaded or OS-shared portrait |
| Source links | UNESCO/British Museum/Met websites | Normal outbound request and referrer policy | Yes | `rel="noreferrer"` is present |

No Meta Pixel, TikTok Pixel, Google Analytics, social SDK or third-party advertising script was found.

## Query-string inventory

| Parameter | Accepted values | Handling | Persistence/attribution |
| --- | --- | --- | --- |
| `edition` | One of five internal region keys | Parsed on the server for `fast_entry`; direct links server-render the compact regional avatar step | Preserved through the active journey and approved share URLs |
| `nominated` | `1` only | Preserved as safe legacy context and local event context; does not claim a verified inviter | Preserved through allowed navigation/share construction |
| `source` | Eight controlled source values | Allowlisted, normalised and otherwise reduced to `unknown` | Safe attribution only |
| `utm_source`, `utm_medium`, `utm_campaign`, `ref` | Bounded token formats | Preserved through allowed navigation and minimal recovery attribution | No arbitrary URL or free text accepted |
| `challenge` | Opaque token shape only | Shape validation is not trust. Without a separately resolved `TrustedChallengeEntry`, the app removes challenge claims and shows the generic selector | Optional trusted challenge code may enter recovery only after server-side validation |
| `fixture` | Exact controlled review ID only | Read only by the server page when both review-build and challenge-fixture gates are enabled | Excluded from ordinary production behaviour; not copied into general entry context |

Current query input is not inserted as arbitrary HTML. Invalid editions are ignored.

## Privacy and security controls already present

- Central NFC/grapheme display-name validation plus React output escaping.
- Client-side allowlist check for region values.
- MIME, extension, signature, structure, size and dimension validation before local decode.
- Clean-canvas JPEG re-encoding with controlled metadata-marker exclusion tests.
- No automatic photo upload or public-photo projection.
- No analytics or third-party tracking.
- No contact-list request or recipient-data collection.
- External informational links use `noreferrer`.
- Public assets are same-origin.
- Photo/result sharing requires a player action.
- Roadmap feature flags default off at build time; the Sites build rejects `commerce=true`.
- The route error boundary hides stack traces and provides retry/home actions.

## Missing privacy controls

- A standalone privacy notice route and owner-approved jurisdictional wording.
- Minimum-audience statement.
- First-party analytics opt-out model before analytics is introduced.
- Durable-record retention and deletion/anonymisation model before D1 is introduced.
- Activation of the deletion-token contract after D1, rate limits, audit controls and preview integration are approved.
- Rate limiting and abuse logging without fingerprinting.
- Machine-readable storage inventory linked to automated tests.
- Provider-log/access-policy inventory from the hosting owner.

## Prompt 8 anonymous identity and deletion readiness

`app/anonymousSession.ts` creates 16 random bytes with Web Crypto, encodes them as 32 lowercase hexadecimal characters and keeps the versioned record only in `sessionStorage`. It expires after 24 hours, rotates on the next scheduled or page lifecycle check, and is cleared by `Clear local quiz data`. Separate tabs receive separate raw values. If secure randomness or storage is unavailable, no weak fallback is created: the quiz continues, while any future authoritative operation must remain unavailable. The raw value is not consumed by current events, URLs, metadata, recovery, D1 or R2.

`db/deletionReadiness.ts` is a synthetic, inactive service contract. It issues a 256-bit bearer token once and retains only a record-bound SHA-256 verifier, a 30-day expiry and a rotation counter. Verification binds the token to one internal target record and uses a constant-time byte comparison. Synthetic requests return only `accepted`, `already_processed` or `unavailable`, preventing unrelated-record existence disclosure, and idempotency is keyed by a stored operation hash. Approved operation modes cover deletion, anonymisation and public-access revocation while allowing integrity or non-identifying aggregate records to remain only under a documented retention rule.

There is deliberately no deletion HTTP route. Activation requires an approved D1 binding, a concrete repository implementation, bearer-token or authenticated authorization, rate limiting, CSRF analysis for any cookie-authenticated form, sanitized audit outcomes, expiry/rotation enforcement, public-projection and media revocation, isolated preview integration tests, retention approval and a separately approved production migration. R2 is required only if a later approved public media feature stores objects.

## Public-media separation contract

- Static Open Graph/Twitter metadata and `public/og-v2.png` contain no player data.
- Future dynamic result or challenge metadata may use only approved avatar IDs, regional art and safe public result fields.
- A private photo is never a public result field, challenge field, media-object key component, analytics property, server response or automatically generated preview.
- A sanitised photo may enter only the local result view and the PNG created after the player deliberately chooses Download or Share my portrait.
- The filename is fixed by the application and never incorporates the source filename or display name.

## Data classification for the roadmap

| Class | Examples | Rule |
| --- | --- | --- |
| Public static | Question text, approved explanations, region tokens, avatar assets | Publish only after source/licence/cultural approval |
| Strictly functional local | Selected edition, avatar, in-progress answers, best scores, consent preference | Minimise, define expiry, allow clearing, never use as hidden entitlement |
| Private transient | Original uploaded photo, optional display name before share, unsubmitted answers | Keep on-device by default; clear promptly; do not log |
| Private durable | Future session, attempt ownership, deletion token, consent preference | Store only after schema/retention/access controls exist; never expose directly |
| Safe public projection | Future opaque result/challenge page with approved display name/avatar/score band | Resolve server-side from opaque code; omit private photo and internal IDs |
| First-party statistical | Allowlisted event name, coarse source, edition, timing bucket | Optional where required, privacy-minimised, rate-limited, retained for a defined period |
| Prohibited in product analytics | Raw IP, full user agent, original photo, contact list, phone number, free-text answer, arbitrary URL/query, biometric inference | Do not collect |
| Payment data | Future Stripe IDs/status/entitlement only after migration | **BLOCKED on ChatGPT Sites**; never store card data |

## Retention recommendations for future implementation

These are design recommendations requiring owner/legal review, not currently implemented policy.

| Future record | Recommended starting retention approach |
| --- | --- |
| Anonymous functional session | Short expiry such as 30 days, renewable only through use; user-clearable |
| In-progress attempt | Short expiry such as 7 days unless explicitly resumed |
| Completed private attempt | Minimise; retain only for result/challenge need and deletion model |
| Public result/challenge | Configured expiry or revocation plus deletion token; document crawler/cache limitations |
| Referral/share events | Short raw-event retention followed by aggregate roll-up |
| Analytics events | Short raw retention, longer anonymous aggregates, immediate opt-out effect |
| Parties/party players | Auto-expire shortly after event; delete or anonymise names |
| Generated public media | Versioned, access-scoped and removed when source result is deleted/expired where feasible |
| Private photo | On-device transient by default; no server retention |
| Consent preference | Retain only as long as necessary to remember the current choice; provide change/clear control |
| Payment/entitlement | Not applicable on Sites; define statutory/accounting retention only after approved migration and legal review |

## Data work required before viral features

1. Approve D1 and, where generated public media is needed, R2 logical bindings.
2. Implement typed schemas and migrations in preview only.
3. Separate private/session records from strict public projections.
4. Add opaque codes, expiry, revocation, idempotency and deletion/anonymisation.
5. Make the server authoritative for attempts, scores and challenge compatibility.
6. Define event semantics and retention before enabling analytics.
7. Add owner-only authorisation for dashboards and moderation.
8. Add rate limits and generic invalid-code responses.
9. Keep all contact data and private photos out of nomination records.
10. Keep payment entities and transactions absent while hosted on Sites.

## Prompt 7 durable-data foundation

Prompt 7 adds an inactive D1-compatible schema, typed projections, validation, migration tooling and synthetic tests. It does not add a binding, write endpoint, analytics transmission, database, bucket or browser-storage fallback. `.openai/hosting.json` remains `d1: null` and `r2: null`.

Prompt 9 adds a local-only challenge-creation service and migration `0002_little_inertia.sql`. New challenges require a hashed idempotency verifier and hashed revocation verifier; raw values are never stored. A 192-bit opaque public code is the only capability placed in the canonical challenge URL. The private revocation token is returned once by the private creation response, remains in memory only in the current client integration, and is excluded from public projections, URLs, queries, logs, analytics, share text and metadata. Challenge score, edition and inviter identity are derived from the authoritative completed result rather than accepted from browser claims. Private player photos remain device-local and are never challenge input or storage data.

Prompt 10 adds a server-rendered challenge landing and a narrowly scoped, same-origin, JSON-only acceptance boundary. GET, HEAD, metadata, crawler, prefetch and server-render operations remain read-only. A successful explicit acceptance uses the existing `quiz_attempts` and `challenge_attempts` tables, hashes the acceptance and recipient-attempt idempotency values with domain separation, records only the recipient anonymous subject hash, and returns a minimal public acknowledgement. Browser recovery retains only the existing versioned quiz fields, the opaque 48-character challenge code and bounded attribution. It does not add inviter name, score, private photo, raw session value, idempotency key or private token. The authorised review build uses isolated in-memory records; ordinary builds include no review challenger fixtures and production remains disabled and unbound.

Prompt 11 adds an inactive, feature-gated authoritative completion contract. The browser submits only stable question and option identifiers plus the existing anonymous-subject proof and an idempotency value. The server reloads the accepted attempt, edition, published question versions, answer keys, scoring version and comparison authority. Browser-supplied score, total, edition, result, tier, mastery, outcome and official-marker claims are not accepted. One atomic batch completes the quiz attempt, writes answers and result, records the challenge outcome, sets the internal `is_official_comparison` marker with the first official result and awards the existing 9+ mastery rule idempotently. Migration `0003_clever_joshua_kane.sql` adds nullable `recipient_subject_hash` and `official_result_id` fields, the non-null integer marker defaulted to `0`, immutable integrity triggers and two partial unique indexes. Historical and replay rows remain marker `0`. If the official result is deleted, `official_result_id` becomes null but marker `1` permanently preserves the claimed slot and the player receives an `unavailable` comparison. The marker is private and never enters public projections, URLs, metadata, events or logs. The public Prompt 9 challenge projection remains unchanged and contains no recipient information. Private photos remain device-local and are not completion input, durable data, comparison data, events, URLs or metadata.

Prompt 12 adds a three-slot browser interface without adding a table, migration, binding or analytics write. Personalised sharing uses one existing authoritative challenge projection and one canonical `/challenge/{OPAQUE_CODE}` URL across all slots. A centrally validated optional alias is copied only into the existing `challenges.reviewed_inviter_name` field at first creation; it does not modify the source result, score, edition, expiry or code. If idempotency returns an existing challenge, its safe public projection controls both share copy and landing-page identity. The nomination UI ignores the private revocation token and never places it in browser storage or UI.

For refresh and Back continuity, the tab may store a versioned safe nomination snapshot in `sessionStorage`. It contains only a validated public challenge projection, canonical public URL, non-identifying local scope, completed slot numbers and save time. It contains no raw idempotency key, revocation token, anonymous session value, private photo, recipient detail, contact, share-sheet content or delivery claim. This is not authoritative challenge storage; invalid snapshots are rejected and durable creation is never invented from browser state.

Generic fallback links contain only the selected edition and never generate `nominated=1`. Historical `nominated=1` parsing remains temporarily supported for old links. A valid legacy edition produces neutral nomination-aware entry without inviter identity or score; an invalid or missing edition falls back to safe regional selection. This compatibility parser is deprecated and must not be removed until legacy traffic has been reviewed in a separately approved release.

No Contacts API, address-book read, recipient field, public analytics write, social SDK or remote event endpoint is introduced. WhatsApp, native Web Share and clipboard are invoked only after deliberate player actions. `share_handoff` means a local platform or clipboard handoff, never message delivery.

The browser-local `challenge_view`, `challenge_accept` and `challenge_invalid` hooks transmit nothing. Their allowlisted semantics and prohibited fields are recorded in `docs/challenge-entry-instrumentation.md` so later analytics cannot relabel a server render, crawler fetch, page hydration or failed acceptance as a completed human start.

This work does not activate a D1 or R2 binding, public write endpoint, hosted migration, seed or deployment. The `challenges` feature flag remains disabled by default, and the existing generic nomination flow remains the fail-closed fallback when the feature or durable storage is unavailable.

All periods below are technical starting proposals pending owner and appropriate legal review. They are not legal conclusions or an activated retention policy.

| Entity | Purpose and proposed functional justification | Principal fields | Classification | Technical retention proposal | Deletion or anonymisation | Export need | Location and status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `quiz_editions` | Publish the approved five-edition registry | Key, name, region, version, status | Public static plus private lifecycle | Keep published versions while referenced; archive retired versions | Retire, do not erase referenced versions | Versioned catalogue | Planned D1 only |
| `questions` | Reproduce and audit authoritative quizzes | Stable/version IDs, scope, text, options, correct answer, explanation, review states, hash | Mixed: playable text public; keys, notes and drafts private | Keep referenced versions while attempts/results exist; archive retired content | Retire rather than delete; remove only unreferenced drafts | Versioned question export with hashes | Planned D1 only |
| `question_sources` | Evidence and cultural/source review | Citation, dates, type, claim link, review metadata | Approved citations public; review administration owner-only | Retain with referenced question version | Anonymise reviewer where required; preserve citation provenance | Source register | Planned D1 only |
| `quiz_attempts` | Private authoritative in-progress and completed attempt | Edition, question/scoring versions, selected versions, status, hashed subject, idempotency, expiry | Private functional | Incomplete 7 days; completed linkage up to public-result need, initially 90 days | Remove identity hash and attribution; tombstone deleted state where audit needed | Private subject/attempt export | Planned D1 only |
| `answers` | Recompute score without trusting a client score | Attempt, exact question version, option IDs, correctness, awarded score | Private functional | Same as owning attempt | Cascade with genuinely deleted attempt after dependencies; otherwise retain pseudonymised audit | Included in private attempt export | Planned D1 only |
| `results` | Immutable score snapshot and optional safe sharing | Opaque slug, edition, score/total/tier, versions, safe avatar, safeguard, lifecycle | Private record plus minimal safe public projection | Public default proposal 90 days; private audit no longer than needed | Revoke public access immediately; anonymise optional name/avatar; delete/tombstone under approved process | Public projection and private owner export | Planned D1 only |
| `challenges` | Verified score-to-beat invitation | Opaque code, inviter result, edition, score, safe inviter projection, hashed creation-idempotency and revocation verifiers, expiry/use state | Minimal safe public projection plus private linkage | 30 days or earlier inviter-result expiry | Capability-based revoke; remove inviter name/avatar; mark unavailable when source is gone | Private owner/subject export | Local service and migration only; hosted D1 inactive |
| `challenge_attempts` | Explicit idempotent acceptance and outcome | Challenge, recipient attempt, scoring version, timestamps, outcome | Private functional | 30 days after challenge expiry, then aggregate or delete | Anonymise recipient linkage; preserve non-identifying outcome only if justified | Private subject export | Planned D1 only |
| `referral_events` | Honest referred-visit and downstream funnel measurement | Event type, safe code, source, optional hashed subject, expiry | First-party statistical | Raw 30 days, aggregates up to 13 months if approved | Delete subject hash on withdrawal/expiry; retain non-identifying aggregate | Owner aggregate export | Planned D1 only, analytics off |
| `share_events` | Measure interface selection, handoff attempt and copy without false sent claims | Event, channel, optional result/challenge and hash | First-party statistical | Raw 30 days, aggregates up to 13 months if approved | Same as referral events | Owner aggregate export | Planned D1 only, analytics off |
| `daily_challenges` | Deterministic region/date selection | Date, edition, deterministic seed hash, question versions, state | Public schedule plus private generation evidence | Retain published schedule while referenced, initially 13 months | Cancel future entry; do not mutate referenced selection | Schedule export | Planned D1 only, feature off |
| `streaks` | Privacy-minimised continuity | Hashed subject, counts, date, rule version, expiry | Private functional | 90 days from last use | Delete or unlink hashed subject | Private subject export | Planned D1 only, feature off |
| `mastery_seals` | Record exact qualifying rule/result | Hashed subject, edition, result, rule version, state | Private functional | While mastery feature is used, review after 12 months inactivity | Revoke or unlink subject; keep anonymous rule evidence only if needed | Private subject export | Planned D1 only, feature off |
| `parties` | Future capped game room | Opaque code, private host-token hash, edition, capacity, lifecycle | Private host state plus minimal public room state | Expire 24 hours after close, delete within 7 days | Revoke public code and delete host credential hash | Host export during active life only | Planned D1 only, feature off |
| `party_players` | Safe leaderboard participant | Opaque player ID, safe avatar, reviewed name, result, deterministic tie break | Minimal party-public projection plus private linkage | Delete or anonymise within 7 days after party expiry | Remove name/avatar and unlink result | Host and subject export while active | Planned D1 only, feature off |
| `media_assets` | Metadata for future generated R2 media | Safe object key, type, owner, dimensions, MIME, size, hash, privacy/state | Private, owner-only or expressly safe public | Match source result/challenge, with short orphan cleanup such as 24 hours | Delete object then mark metadata deleted; revoke public resolution first | Metadata plus approved object export | Planned D1 metadata and R2 bytes, both unbound |
| `consent_preferences` | Remember versioned functional/statistical/marketing choices | Hashed subject, notice/category versions, category booleans, withdrawal, expiry | Private preference | Current notice choice plus 6 months after supersession, subject to review | Withdrawal immediately disables optional processing; delete/anonymise on clear | Private preference export | Planned D1 only, no consent UI active |
| `analytics_events` | Optional allowlisted first-party measurement | Event, bounded properties, optional hash/notice, bot class, expiry | Owner-only statistical | Raw 30 days, approved anonymous aggregates up to 13 months | Delete or unlink subject on withdrawal; bots separated | Owner aggregate export | Planned D1 only, transmission off |
| `feature_flag_overrides` | Expiring owner-only preview/rollout control | Flag, enabled value, scope hash, reason, owner, expiry/revocation | Owner-only operational | Expiry required; retain audit for 90 days after expiry | Revoke immediately; anonymise owner ID only under authorised process | Owner audit export | Planned D1 only, no endpoint |
| `schema_migrations` | Prove ordered schema and checksum history | Migration ID, checksum, applied time, runner version | Owner-only operational | Database lifetime | Never selectively delete; export with database | Migration ledger | Isolated local SQLite tests only |

The full field, relationship, index and projection dictionary is in `docs/data-dictionary.md`. Binding approval requirements are in `docs/storage-binding-readiness.md`.

## Prompt 8 read-only dependency audit

The 2026-08-23 read-only audits changed neither dependencies nor the lockfile. `npm audit --omit=dev --json` reported no production dependency vulnerabilities. The complete `npm audit --json` reported 20 development-tree package findings: 1 low, 4 moderate, 15 high and 0 critical.

Direct development findings were `@cloudflare/vite-plugin` (high), `drizzle-kit` (moderate), `react-server-dom-webpack` (high), `vinext` (high), `vite` (high) and `wrangler` (high). Transitive findings were `@babel/core` (low), `@esbuild-kit/core-utils` (moderate), `@esbuild-kit/esm-loader` (moderate), `brace-expansion` (high), `esbuild` (moderate), `fast-uri` (high), `image-size` (high), `js-yaml` (high), `miniflare` (high), `nanoid` (high), `postcss` (high), `sharp` (high), `undici` (high) and `ws` (high).

The Vite, Wrangler, Miniflare, Drizzle and lint/build-chain advisories are not shipped as browser client runtime code and are not reachable through the current static product routes. The `react-server-dom-webpack` and `vinext`/`image-size` findings sit in the build/server toolchain; the app has no Server Actions and uses static or raw image paths, which lowers current exposure but does not make the findings irrelevant. A separately approved compatible dependency upgrade and complete regression/deployment preflight should resolve or explicitly accept them before a production deployment. No automatic audit fix, forced update or unrelated dependency change was performed.
