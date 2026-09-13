# Data and privacy inventory

Audit date: 26 August 2026
Scope: current repository behaviour only. Hosting-provider operational logs and access-policy data are outside the source repository and were not inspected.

## Current privacy posture

The app is a device-local anonymous experience in ordinary production. It has no active application database, object storage, analytics collector, commerce system or account system because D1 and R2 remain unbound and every feature flag remains false by default. Prompt 16 adds an inactive, build-time-gated first-party analytics route and consent interface. Prompt 17 adds an inactive commerce and entitlement implementation for a future commerce-capable host. Both fail closed without approved D1 storage and rate limiting; query parameters cannot activate them. A selected original photo and the sanitised copy are never transmitted by application code.

Random Quick Play is also false by default. When separately activated with approved D1 storage, it reuses the existing anonymous functional credential and stores only its derived owner hash, an immutable ordered question/version/option-ID snapshot, a non-secret selection reference and bounded attempt timestamps. Recent-question avoidance reads at most 100 references from the preceding 90 days. It requires no analytics consent, creates no analytics identity, places no history in URLs and does not extend result or streak retention. Full selection and recovery rules are in `docs/random-quick-play.md`.

Prompt 16 analytics is optional and technically consent-controlled. Before acceptance, the app reads only the minimum analytics-consent preference record; it creates no analytics identifier, queue, cookie or network request and collects no referral analytics. Rejection remains browser-local. Acceptance creates a separate 128-bit tab-scoped analytics credential for at most 24 hours, sends only allowlisted first-party events, and stores only a domain-separated SHA-256 hash server-side. Withdrawal immediately clears the memory queue and browser credential, then deletes the session's raw event rows. Owner and appropriate legal review are still required before any production activation.

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

- `localStorage["wybp-active-quiz-v1"]` contains schema version 1, a random tab instance ID, edition, stable avatar ID, next question position, selected option indexes for answered questions, an update timestamp, allowlisted attribution, an optional trusted challenge code and, for fresh Quick Play only, the server-issued attempt reference. It expires after 24 hours and rejects malformed, oversized, future, stale or incompatible data.
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
| Daily streak ownership continuity | The existing 128-bit anonymous ownership credential plus a functional expiry | Official daily play request and authoritative completion | Browser | `localStorage` key `wybp-daily-owner-v1` | Initially to the active UTC boundary; only a confirmed official completion may reset it to the exact 180-day server streak expiry | Same-origin daily and clear POST bodies only | Feature-gated and strictly functional; never used for analytics, marketing or cross-site tracking; Clear my streak data removes it without creating a replacement |
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
| `localStorage` | `wybp-daily-owner-v1` | Continue an anonymous daily streak across browser sessions when the separate streak flag is active | Initially to the next UTC boundary; after official completion, exactly to the server-confirmed 180-day streak expiry | Clear my streak data, Clear my local data, expiry or browser controls | Existing anonymous credential retained only for functional daily ownership; transmitted only in same-origin POST bodies and never used for analytics |
| `localStorage` | `wybp-analytics-consent-v1` | Minimum versioned record of accept/reject choice and notice version | 180 days; invalid, expired or notice-mismatched values are removed | Manage preferences, replacement choice or browser controls | Strictly necessary preference memory only; no marketing consent or analytics identifier |
| `sessionStorage` | `wybp-analytics-session-v1` | Raw cryptographically random analytics credential created only after acceptance | 24 hours or tab close | Reject/withdraw, expiry or tab close | Separate from game ownership; sent only in same-origin POST bodies and never stored server-side |
| `sessionStorage` | `wybp-analytics-seen-v1` | At most 40 semantic event keys for refresh/Back deduplication | Analytics tab session | Reject/withdraw, session clear or tab close | Created only after acceptance; contains no code, hash, URL or internal identifier |
| `sessionStorage` | `wybp-pending-royal-reveal-v1` | Opaque pending-order reference used by the bounded return-page status check | Current tab; cleared on terminal outcome | Terminal payment state, explicit return to free result or tab close | Non-authoritative navigation continuity only; contains no Stripe ID, result, owner or credential |

No IndexedDB, Cache Storage, service worker, application cookie or browser database use was detected. Analytics uses no cookie, persistent event queue, advertising identifier or fingerprint.

### Server and platform storage

| System | Current state |
| --- | --- |
| Sites D1 | Not bound: `.openai/hosting.json` has `"d1": null` |
| Sites R2 | Not bound: `.openai/hosting.json` has `"r2": null` |
| Drizzle schema | 22 storage-ready tables, including exactly three inactive commerce tables; all are unbound |
| Drizzle migrations | `0000` through local-only `0008_simple_nocturne.sql`; migrations `0000` through `0007` remain byte-identical and `0008` has not been applied to hosted storage |
| Active API routes | Analytics and commerce route source exists but is unreachable in ordinary production because both flags are false; all storage-dependent routes fail closed while bindings are null |
| External database/blob provider | None detected |
| Analytics/event collector | Inactive first-party route only; no third-party SDK, pixel, script or hosted collector is active |
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
- No third-party analytics or tracking. The optional first-party implementation is off by default and transmits nothing without valid consent.
- No contact-list request or recipient-data collection.
- External informational links use `noreferrer`.
- Public assets are same-origin.
- Photo/result sharing requires a player action.
- Roadmap feature flags default off at build time; the Sites build rejects `commerce=true`.
- The route error boundary hides stack traces and provides retry/home actions.

## Missing privacy controls

- A standalone privacy notice route and owner-approved jurisdictional wording.
- Minimum-audience statement.
- Production owner/legal approval, approved D1 binding, migration application, independent rate limiting, retention scheduling and deletion planning before first-party analytics activation.
- Durable-record retention and deletion/anonymisation model before D1 is introduced.
- Activation of the deletion-token contract after D1, rate limits, audit controls and preview integration are approved.
- Rate limiting and abuse logging without fingerprinting.
- Machine-readable storage inventory linked to automated tests.
- Provider-log/access-policy inventory from the hosting owner.

## Prompt 8 anonymous identity and deletion readiness

`app/anonymousSession.ts` creates 16 random bytes with Web Crypto, encodes them as 32 lowercase hexadecimal characters and normally keeps the versioned record only in `sessionStorage`. It expires after 24 hours, rotates on the next scheduled or page lifecycle check, and is cleared by `Clear my local data`. Separate tabs receive separate raw values. If secure randomness or storage is unavailable, no weak fallback is created: the quiz continues, while an authoritative operation remains unavailable.

When the separate streak flag is active and a player explicitly starts official daily play, `app/dailyChallengeClient.ts` may retain that existing raw credential in the dedicated `wybp-daily-owner-v1` functional record. Before completion it expires at the current UTC boundary. Only a server-confirmed official completion can reset its expiry to the matching server streak deadline, exactly 180 days later. Practice, page visits, retries, sharing and analytics do not extend it. It is sent only in same-origin daily and clear POST bodies, never in URLs, metadata, analytics or logs, and Clear my streak data removes it without creating a replacement.

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

Prompt 13 adds a reusable Share Centre without adding durable data. Its typed safe projection contains only a controlled surface, approved edition and label, validated canonical URL, and, only for an existing personalised challenge, the reviewed display name, authoritative score, approved avatar and score-derived result title. A generic projection has null name, score, title and avatar fields and resolves only to the approved regional entry URL.

The Share Centre may retain one prepared PNG blob and File object in component memory while its dialog is open. Result media may include the current player’s already sanitised device-local portrait only when the player expressly selected it. Challenge-landing media uses an approved static avatar. The blob is never written to recovery, session snapshots, D1, R2, logs, metadata, URLs, events or a server request. Downloads use a short-lived object URL that is revoked. The fixed filename includes only the approved edition key.

Prompt 12 and Prompt 13 reuse one safe nomination snapshot and canonical code. No new challenge identity, storage table or migration is required. Share Centre events contain only controlled event, surface, channel, edition and timing fields and transmit nothing. The detailed platform and media boundaries are in `docs/share-centre-platform-contract.md`.

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
| `results` | Immutable score snapshot and optional safe sharing | Opaque slug, edition, score/total/tier, versions, safe avatar, safeguard, independent `visibility`, lifecycle | Private by default; minimal safe public projection only after explicit owner publication | Public default proposal 90 days; private audit no longer than needed | Unpublish immediately by returning visibility to private; anonymise optional name/avatar; delete/tombstone under approved process | Public projection and private owner export | Local schema and service only; hosted D1 inactive |
| `challenges` | Verified score-to-beat invitation | Opaque code, inviter result, edition, score, safe inviter projection, hashed creation-idempotency and revocation verifiers, expiry/use state | Minimal safe public projection plus private linkage | 30 days or earlier inviter-result expiry | Capability-based revoke; remove inviter name/avatar; mark unavailable when source is gone | Private owner/subject export | Local service and migration only; hosted D1 inactive |
| `challenge_attempts` | Explicit idempotent acceptance and outcome | Challenge, recipient attempt, scoring version, timestamps, outcome | Private functional | 30 days after challenge expiry, then aggregate or delete | Anonymise recipient linkage; preserve non-identifying outcome only if justified | Private subject export | Planned D1 only |
| `referral_events` | Honest referred-visit and downstream funnel measurement | Event type, safe code, source, optional hashed subject, expiry | First-party statistical | Raw 30 days, aggregates up to 13 months if approved | Delete subject hash on withdrawal/expiry; retain non-identifying aggregate | Owner aggregate export | Planned D1 only, analytics off |
| `share_events` | Measure interface selection, handoff attempt and copy without false sent claims | Event, channel, optional result/challenge and hash | First-party statistical | Raw 30 days, aggregates up to 13 months if approved | Same as referral events | Owner aggregate export | Planned D1 only, analytics off |
| `daily_challenges` | Deterministic region/date selection | UTC date, edition, versioned scoring/selection authority, deterministic seed hash, exact question versions, state | Public safe set only; no seed or answer key | Available only through the next UTC boundary | Expire without mutating referenced selection | Safe daily projection | Local implementation, feature off |
| `daily_challenge_completions` | One authoritative official result per owner/day | Daily, attempt, result and edition references, functional owner hash, UTC date, scoring version, completion time | No direct public projection | Follows the 90-day attempt/result lifecycle | Bounded lifecycle removal; practice never stored here | Private ownership export only | Local implementation, feature off |
| `daily_operation_limits` | Abuse control for daily POST operations | Purpose-limited HMAC rate key, action, minute window, count and expiry | None | 24 hours maximum | Operational expiry purge | None | Local implementation, feature off |
| `streaks` | Privacy-minimised continuity | Functional ownership hash, regional streak type, current/best counts, qualifying date/time, rule version, exact expiry | Private functional | Exactly 180 days from latest authoritative official daily completion | Unavailable immediately at expiry; bounded purge within 7 days; Clear my streak data removes immediately | Private subject export | Approved product rule, feature off pending privacy/legal review |
| `mastery_seals` | Record exact qualifying rule/result | Hashed subject, edition, result, rule version, state | Private functional | While mastery feature is used, review after 12 months inactivity | Revoke or unlink subject; keep anonymous rule evidence only if needed | Private subject export | Planned D1 only, feature off |
| `parties` | Future capped game room | Opaque code, private host-token hash, edition, capacity, lifecycle | Private host state plus minimal public room state | Expire 24 hours after close, delete within 7 days | Revoke public code and delete host credential hash | Host export during active life only | Planned D1 only, feature off |
| `party_players` | Safe leaderboard participant | Opaque player ID, safe avatar, reviewed name, result, deterministic tie break | Minimal party-public projection plus private linkage | Delete or anonymise within 7 days after party expiry | Remove name/avatar and unlink result | Host and subject export while active | Planned D1 only, feature off |
| `media_assets` | Metadata for generated result previews and future media | Safe object key, type, owner, dimensions, MIME, size, hash, privacy/state | Private, owner-only or expressly safe public | Match source result, with short orphan cleanup such as 24 hours | Unpublish revokes resolution and deletes generated bytes; later deletion marks metadata deleted | Metadata plus approved object export | R2-ready local interfaces only; D1 and R2 unbound |
| `consent_preferences` | Remember versioned functional/statistical/marketing choices | Hashed subject, notice/category versions, category booleans, withdrawal, expiry | Private preference | Current notice choice plus 6 months after supersession, subject to review | Withdrawal immediately disables optional processing; delete/anonymise on clear | Private preference export | Planned D1 only, no consent UI active |
| `analytics_events` | Optional allowlisted first-party measurement | Event, bounded properties, optional hash/notice, bot class, expiry | Owner-only statistical | Raw 30 days, approved anonymous aggregates up to 13 months | Delete or unlink subject on withdrawal; bots separated | Owner aggregate export | Planned D1 only, transmission off |
| `feature_flag_overrides` | Expiring owner-only preview/rollout control | Flag, enabled value, scope hash, reason, owner, expiry/revocation | Owner-only operational | Expiry required; retain audit for 90 days after expiry | Revoke immediately; anonymise owner ID only under authorised process | Owner audit export | Planned D1 only, no endpoint |
| `schema_migrations` | Prove ordered schema and checksum history | Migration ID, checksum, applied time, runner version | Owner-only operational | Database lifetime | Never selectively delete; export with database | Migration ledger | Isolated local SQLite tests only |

The full field, relationship, index and projection dictionary is in `docs/data-dictionary.md`. Binding approval requirements are in `docs/storage-binding-readiness.md`.

## Prompt 14 published-result privacy boundary

Migration `0004_yellow_bill_hollister.sql` adds only `results.visibility TEXT NOT NULL DEFAULT 'private'` with allowed values `private` and `public`. Historical rows become private. Lifecycle `state`, name review, expiry and media classification remain independent and unchanged. Completed results expire exactly 90 days after authoritative completion; publication changes only visibility and never extends, removes or restarts that expiry. A public projection requires explicit public visibility, active lifecycle and a future expiry. It always uses `A challenger`; the existing reviewed display name is not treated as public-name consent.

Publication and unpublication require the authoritative completed result, an unexpired ownership window, a same-origin POST and the existing fail-closed rate-limit boundary. The POST body uses the existing raw anonymous-session credential in `anonymousSessionCredential`; it is never accepted in a URL, response, metadata, event or log. The server derives the domain-separated SHA-256 subject hash and compares it in constant time with `quiz_attempts.anonymous_subject_hash`. A client-supplied copy of that stored 64-character hash is not a credential. Missing, malformed, expired, mismatched and post-expiry replay attempts fail with the same neutral response. An authorised retry within the ownership window remains idempotent. The browser cannot submit score, edition, title, avatar or lifecycle state. The only result field updated is `visibility`. Publication prepares one deterministic safe preview; unpublication returns visibility to private, revokes its media metadata and removes generated bytes. Page, metadata, crawler and image GETs never publish a result, create attempts or emit human events.

Dynamic preview input contains only the public result projection, approved avatar identifier, approved edition palette/motif and the permanent safeguard. Entered names, private uploaded photos, session values, answers, internal IDs, tokens and arbitrary URLs are excluded. The dependency-free 1200 by 630 PNG renderer makes no network request, uses deterministic Worker-compatible deflate compression, enforces a 1,000,000-byte hard ceiling and targets less than 500,000 bytes. Generated object keys contain only edition, UTC year/month, SHA-256 content hash and generation version.

## Prompt 15 device-local Story video boundary

The optional `story_video` flow creates a five-second 1080 by 1920 MP4 or WebM entirely in the browser from an allowlisted result projection, approved regional artwork and one approved avatar. It never uses the entered display name or a private uploaded photograph. Canvas capture, browser-generated abstract drum audio, encoding, preview, download and native file-share handoff remain device-local. With Prompt 16 separately enabled and accepted, established local Story-video hooks can produce allowlisted metadata-only analytics events; media bytes, filenames, URLs, names, photographs and internal identifiers never enter them.

## Prompt 16 first-party analytics boundary

The complete event dictionary, routing map, payload allowlist, consent notice, retention schedule and funnel formulas are normative in `docs/analytics-event-dictionary.md` and `docs/analytics-consent-contract.md`. Raw version-1 events expire no later than 30 days after occurrence. The owner-only bounded retention operation is repository-level, has no browser route and never runs during a build or ordinary request. Reports contain aggregate counts only and are labelled `consented_measured_traffic`; consent means reported traffic can undercount total use.

The route is same-origin POST-only, HTTPS outside local review, strict JSON, limited to 16,384 bytes and 10 events, Fetch-Metadata checked, credential-hash and consent checked, centrally validated and idempotent. It returns neutral acknowledgements without records or exception text. Production intentionally uses an unavailable rate-limit boundary, so activation fails closed until an independently approved limiter exists.

## Prompt 17 Royal Reveal commerce boundary

Royal Reveal is fixed at `royal_reveal_v1`, one-off GBP 199 (£1.99), with no subscription. Commerce and its review fixtures are build-gated, false by default and query-inert. The order endpoint requires an active completed result, raw tab-scoped owner credential in a protected same-origin body, constant-time server-derived ownership verification, explicit immediate-delivery consent, strict input limits, idempotency, approved rate limiting and D1. A copied stored owner hash cannot authorise anything.

The purchase context is created only by the server-authoritative result-completion boundary. The browser submits stable question/option identifiers, an allowlisted avatar, the raw tab credential and an idempotency value; edition, score, total, tier, title, result slug and payment identifiers are forbidden. D1 supplies and binds the single active edition, published question versions and answer keys. One atomic batch stores the completed owner-bound attempt, twelve answers and immutable private result, and only its opaque slug returns. The result uses the existing 90-day completed-result window, which exceeds the 30-minute pending-order lifecycle; this adds no table or migration.

The only added stores are `commerce_orders`, `commerce_entitlements` and `stripe_webhook_events`. They hold controlled state, result/owner/product relationships, minimal verified Stripe identifiers, timestamps, retention/deletion readiness and payload digests. They prohibit full webhook payloads, customer profiles, cards, bank accounts, invoices, subscriptions, advertising data, names, email, phone, billing addresses and receipts. Premium media remains on-device and private photos remain excluded.

A public Payment Link receives only an opaque `client_reference_id`. The return page cannot grant access. Only raw-body-signature-verified, exact-product/currency/amount webhook processing can create or revoke a result-specific entitlement. Full refunds and disputes revoke; partial refunds enter manual review. Analytics is optional and separate: commerce works after rejection, and reserved commerce events can be ingested only when analytics consent, analytics and commerce are all active.

The in-memory projection contains only edition, score, maximum score, score-derived result title, approved avatar ID and asset path, approved regional artwork and palette, mastery state, permanent safeguard and an optional validated public-result URL bounded by the result’s original 90-day expiry. Challenge codes, session credentials or hashes, idempotency or revocation values, answers, internal IDs and arbitrary URLs are rejected or absent. Object URLs are revoked after downloads and when the panel unmounts. Generated media is capped at 8,000,000 bytes and is not persisted by the application. `story_video` remains false by default and cannot be activated through a public query parameter.

## Prompt 19 privacy, storage and local-control boundary

`app/storageInventory.ts` is the canonical versioned inventory for application-controlled browser keys, in-memory files and media, browser APIs, absent technologies, Sites/trusted-dispatch boundaries, and deliberate Stripe or social navigation. The public storage notice renders from it, its machine-readable form is exposed without secret values, and the local clearing routine derives its exact-key allowlists from the same entries. Application code contains no cookie write, IndexedDB, Cache Storage, service-worker registration, marketing tag, advertising pixel or third-party analytics script.

Privacy choices remains site-wide even while analytics is disabled. Required functionality is not bundled with optional analytics. The existing `analytics-notice-v1` preference lasts 180 days, analytics sessions last 24 hours, raw events last no more than 30 days, and withdrawal immediately removes the raw browser credential and stops future transmission. Clearing local data removes only registered keys and safe nomination prefixes, emits no analytics request or identifier, releases open in-memory photo/media state, and returns the quiz to a safe initial state. It does not claim to delete downloads or server-held records.

The public legal routes are technical drafts and fail closed through a prominent unapproved state plus `noindex` metadata while required controller, contact, lawful-basis, transfer, children, consumer-rights and professional-review decisions are absent. No legal identity, postal address, privacy email, DPO, company number, ICO number, lawful basis or transfer mechanism is invented.

## Prompt 8 read-only dependency audit

The 2026-08-23 read-only audits changed neither dependencies nor the lockfile. `npm audit --omit=dev --json` reported no production dependency vulnerabilities. The complete `npm audit --json` reported 20 development-tree package findings: 1 low, 4 moderate, 15 high and 0 critical.

Direct development findings were `@cloudflare/vite-plugin` (high), `drizzle-kit` (moderate), `react-server-dom-webpack` (high), `vinext` (high), `vite` (high) and `wrangler` (high). Transitive findings were `@babel/core` (low), `@esbuild-kit/core-utils` (moderate), `@esbuild-kit/esm-loader` (moderate), `brace-expansion` (high), `esbuild` (moderate), `fast-uri` (high), `image-size` (high), `js-yaml` (high), `miniflare` (high), `nanoid` (high), `postcss` (high), `sharp` (high), `undici` (high) and `ws` (high).

The Vite, Wrangler, Miniflare, Drizzle and lint/build-chain advisories are not shipped as browser client runtime code and are not reachable through the current static product routes. The `react-server-dom-webpack` and `vinext`/`image-size` findings sit in the build/server toolchain; the app has no Server Actions and uses static or raw image paths, which lowers current exposure but does not make the findings irrelevant. A separately approved compatible dependency upgrade and complete regression/deployment preflight should resolve or explicitly accept them before a production deployment. No automatic audit fix, forced update or unrelated dependency change was performed.

## Prompt 18 owner-dashboard boundary

Prompt 18 adds no table, migration, identifier, raw event, derived stored report or hosted binding. The hidden routes remain disabled by default. Server authorization uses only the trusted Sites authenticated subject followed by the private `WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS` allowlist; no owner value reaches a client bundle or response. Unauthorized requests stop before runtime acquisition or analytics queries.

D1 reads return bounded aggregate groups only. They include version-1, consented, non-deleted and unexpired records and never return row-level events, session hashes, raw JSON, names, photographs, answers, result/challenge/order identifiers, network attributes or credentials. CSV uses the same boundary. Game mode, exact timing and cross-session retention remain unsupported rather than inferred. Synthetic review fixtures contain no real player data and require explicit review-build gates.

## Cowrie Wallet functional data

The disabled Cowrie Wallet model stores a random internal ID, opaque public reference, server-derived 64-character anonymous owner hash, controlled state, two-free-play counter, separate purchased and bonus balance caches, recovery-credential hash and version, lifecycle timestamps and optimistic version. The immutable ledger stores controlled type, bucket, signed delta, domain-scoped idempotency hash, authoritative relationship references, controlled reason, creation time, bonus expiry and reversal relationship. Purchase allocations reserve exact future verified-order quantity and refund provenance. Raw owner and recovery credentials, names, email, photographs, answers, analytics identifiers and browser-supplied balances are excluded.

Cowrie operations are strictly functional and do not depend on analytics consent. Owner hashes, wallet references, attempt IDs, ledger IDs and recovery values cannot be reused for analytics, marketing or cross-site tracking. The raw 32-byte recovery credential appears only in the controlled creation or rotation response and in a copy or download the player explicitly requests. Clearing browser storage does not fingerprint a returning player; losing both credentials can prevent automatic recovery.

The private nullable Cowrie issuance timestamp records server commitment of a paid attempt projection for return. It is not proof of receipt, viewing or completion; it never enters analytics, public projections, URLs or application logs, and it extends no retention. A pre-issuance reversal retires the paid attempt and restores its exact bucket once; network loss after issuance does not refund.

## Disabled Cowrie purchases

The new tab-local pending purchase key contains only an opaque order reference and is explicitly cleared by application local clearing. No Stripe ID, recovery value or wallet/ledger identifier is stored there. Signature-first webhook audit gains three bounded nullable reconciliation facts; no raw payload/customer/card data is added. Cowrie purchase analytics are unsupported. Draft immediate delivery is separate from analytics. See [Cowrie commerce](cowrie-commerce.md).
