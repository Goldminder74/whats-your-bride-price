# Data and privacy inventory

Audit date: 22 August 2026
Scope: current repository behaviour only. Hosting-provider operational logs and access-policy data are outside the source repository and were not inspected.

## Current privacy posture

The app is currently a mostly device-local experience. It has no active application database, object storage, analytics collector, account system or application write API. The original uploaded photo is not transmitted by application code. Ordinary production behaviour persists only the browser-local map of best regional scores; the feature-flagged Prompt 5 preview also keeps a short-lived, tab-gated quiz recovery record described below.

The main current privacy gaps are incomplete file-signature/metadata hardening, indefinite mastery-score retention, no single clear-all-local-data control, no explicit privacy route, no deletion mechanism for future durable data, and wording that does not fully explain user-initiated result sharing.

## Prompt 5 fast-entry preview boundary

Prompt 5 adds a local, feature-flagged fast journey while `fast_entry` remains false in ordinary production builds. The preview implementation does not bind D1 or R2, call an analytics collector, add a service worker or transmit a player photo. It introduces two strictly functional recovery keys:

- `localStorage["wybp-active-quiz-v1"]` contains schema version 1, a random tab instance ID, edition, stable avatar ID, next question position, selected option indexes for answered questions, an update timestamp, allowlisted attribution and an optional trusted challenge code. It expires after 24 hours and rejects malformed, oversized, future, stale or incompatible data.
- `sessionStorage["wybp-active-quiz-instance-v1"]` contains only the matching random instance ID. Recovery is allowed only when this tab-scoped value matches the local record, preventing a new tab or another browser session from silently adopting a previous player's in-progress identity.

Names, photos, filenames, free text, answer text, correct-answer text, raw URLs, secrets and HTML are prohibited from the recovery record. `Start again` removes both recovery keys. Storage errors are caught and never block the quiz. The fast avatar step explains this behaviour in the interface with: “If this tab refreshes, your edition, avatar and quiz answers can be restored for up to 24 hours. Photos and names are never saved.”

Trusted challenge readiness is an input boundary, not a public query-string trust mechanism. The client accepts only a complete validated `TrustedChallengeEntry` passed by the server layer. Raw inviter names and claimed scores in a URL are ignored. The only current personalised record is a controlled local review fixture gated by both `WYBP_REVIEW_BUILD=true` and `WYBP_REVIEW_CHALLENGE_FIXTURES=true`, with the `challenges` feature flag enabled. Ordinary production builds cannot resolve it. Rendering a challenge does not create an acceptance record; the player must explicitly accept before reaching the avatar step.

## Current data inventory

| Data item | Example/shape | Source | Processing location | Storage | Current lifetime | Leaves device? | Sensitivity and notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selected region | `west`, `east`, `central`, `north`, `south` | Player choice or `edition` query | Browser | React state; also URL query | Until navigation/restart; URL may persist in history/share | Yes, in URL and share link | Low sensitivity; can be an inferred interest, not a verified identity |
| Display name/pseudonym | Up to 30 JavaScript string units | Player input | Browser | React state only | Until refresh/page close | Yes, if player shares result or nomination | User-generated personal data; React escapes DOM output, but no trim/normalisation policy |
| Selected avatar | Stable allowlisted avatar ID resolved to a static asset URL | Player choice | Browser | React state; Prompt 5 recovery record when `fast_entry` is enabled | Current attempt; recovery expires after 24 hours | Yes, avatar pixels can be included in result share | Low sensitivity; IDs are stable and reject uploaded-photo or unknown values |
| Original uploaded image | Same-origin browser `blob:` object URL referencing the selected local file | Player file picker | Browser only | React memory and browser object-URL registry | Until explicit removal, avatar replacement, restart, replacement by another photo or page close | Not by app automatically | JPEG, PNG or WebP only; 8 MB, 6000-pixel-side and 24-megapixel caps; decode must succeed. No signature inspection or explicit EXIF stripping yet |
| Rendered portrait pixels | Cropped visible pixels drawn into result canvas | Original photo or avatar | Browser only | Canvas memory, then PNG Blob | Until operation completes/GC | Yes, only through explicit share or download | New PNG normally omits original EXIF, but this is not tested or guaranteed by explicit code |
| Quiz answers | Binary correctness values in memory; selected option indexes in Prompt 5 recovery | Player actions | Browser | React state; versioned local recovery only when `fast_entry` is enabled | Attempt lifecycle; recovery expires after 24 hours and is tab-gated | Not directly | Behavioural/game data. Recovery recomputes scores from the unchanged question bank rather than trusting a stored score |
| Score | Integer `0..12` | Client calculation | Browser | Derived React value | Until restart/refresh/page close | Yes, in shared text/result PNG | Not server-verified; must not be trusted for future competitions or entitlements |
| Result tier | Four named tiers | Client calculation | Browser | Derived value | Until restart/refresh/page close | Yes, in shared text/result PNG | Entertainment result |
| Aura/streak/gem state | Numeric game feedback | Client calculation | Browser | React state | Current attempt only | Aura appears in UI, not current share text | Functional game state, not a durable retention streak |
| Regional best scores | Object keyed by five regions | Completed results | Browser | `localStorage` key `wybp-region-scores` | Indefinite until site data is cleared | No automatic transfer | Functional persistent behavioural data; no expiry or in-app clear control |
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
| `sessionStorage` | `wybp-active-quiz-instance-v1` | Require the same tab session before local recovery can be used | Tab session | Visible `Start again` or tab close | Tab-scoped anti-merge guard |

No IndexedDB, Cache Storage, service worker, application cookie or browser database use was detected.

### Server and platform storage

| System | Current state |
| --- | --- |
| Sites D1 | Not bound: `.openai/hosting.json` has `"d1": null` |
| Sites R2 | Not bound: `.openai/hosting.json` has `"r2": null` |
| Drizzle schema | Empty |
| Drizzle migrations | None; journal has no entries |
| Active API routes | None |
| External database/blob provider | None detected |
| Analytics/event collector | None detected |
| App-owned authentication/session store | None |

The worker type declares `DB`, but the quiz never calls the database helper. The example notes API lives under `examples/` and is not an active route.

## Photo data-flow analysis

```text
Explicit user file-picker action
  -> browser supplies File object
  -> code allowlists JPEG, PNG or WebP and rejects files over 8 MB
  -> browser creates a local object URL
  -> image must decode within 6000 pixels per side and 24 megapixels
  -> object URL stored in React memory and displayed locally
  -> replacement, removal, restart and unmount revoke the object URL
  -> optional canvas drawing for result
     -> new PNG Blob
        -> explicit download, or
        -> explicit navigator.share file handoff
```

No application network call exists in this flow. The original photo is not written to D1, R2, localStorage or an application server.

### Photo risks and required controls before expansion

1. Validate file signatures and decoded MIME, not only `file.type`.
2. Add a decode timeout and test hostile/decompression-bomb files beyond the current size and dimension caps.
3. Re-encode locally to a bounded format/size and explicitly remove metadata.
4. Test forged types, polyglot inputs, EXIF orientation and low-memory mobile behaviour.
5. Keep private photos out of public result/OG/challenge/party records by default.
6. If a future user expressly chooses a server upload, require a separate notice, R2 storage, safe content type, ownership metadata, retention, deletion and access control. Do not infer that choice from selecting a local file.

## Sharing and external recipients

| Action | Recipient/controller | Data handed off | Current user gesture | Current issue |
| --- | --- | --- | --- | --- |
| Native result share | OS share sheet and chosen target | Generated PNG where supported, score/tier/region text and nomination URL | Yes | Handoff is not proof of publication; cancellation is ignored and non-cancellation failures are logged locally |
| Native nomination share | OS share sheet and chosen target | Optional name in copy, region and generic nomination URL | Yes | On any share exception, no clipboard fallback is attempted; non-cancellation failures are logged locally |
| WhatsApp nomination | WhatsApp/web endpoint | Region and nomination URL | Yes | No durable challenge, score verification or privacy-safe result record |
| Clipboard fallback | OS clipboard | Copy text and URL | Yes | Success is not verified before alerting |
| Download | Local file system/download manager | Generated PNG with optional personal photo | Yes | No explicit warning that the exported file contains the selected portrait |
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

- React output escaping for the display name.
- Client-side allowlist check for region values.
- No automatic photo upload.
- No analytics or third-party tracking.
- No contact-list request or recipient-data collection.
- External informational links use `noreferrer`.
- Public assets are same-origin.
- Photo/result sharing requires a player action.
- Roadmap feature flags default off at build time; the Sites build rejects `commerce=true`.
- The route error boundary hides stack traces and provides retry/home actions.

## Missing privacy controls

- A concise, accessible privacy/storage notice.
- Exact distinction between local processing and explicit OS/app sharing.
- Defined localStorage purpose, expiry and Clear my local data action.
- Minimum-audience statement.
- First-party analytics opt-out model before analytics is introduced.
- Durable-record retention and deletion/anonymisation model before D1 is introduced.
- Deletion tokens or authenticated owner controls for future public results/challenges.
- Public/private data projections.
- Rate limiting and abuse logging without fingerprinting.
- Machine-readable storage inventory linked to automated tests.
- Provider-log/access-policy inventory from the hosting owner.

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
