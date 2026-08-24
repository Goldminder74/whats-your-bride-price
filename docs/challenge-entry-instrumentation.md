# Challenge entry instrumentation contract

Date: 24 August 2026

Prompt 10 provides three dependency-free browser-local event hooks. They dispatch `wybp:challenge-event` as a `CustomEvent` and add a performance mark named `wybp:{event_name}`. They do not transmit, persist or queue data. No analytics SDK, pixel, cookie or remote endpoint is present.

| Event | Exact meaning | Must not be interpreted as |
| --- | --- | --- |
| `challenge_view` | A challenge landing component with an active safe public projection hydrated in a browser and became eligible for human interaction. Emitted at most once per page lifecycle. | A link delivery, link click, unique person, quiz start, challenge acceptance, crawler view or completed play. Server rendering, metadata generation and raw GET requests do not emit it. |
| `challenge_accept` | The recipient explicitly activated `Accept challenge` and the protected POST returned a successful, authoritative, idempotent acceptance. Emitted once before the accepted quiz UI opens. | A challenge page view, attempted tap, failed/offline request, quiz completion, comparison outcome or invitation sent. |
| `challenge_invalid` | A neutral unavailable or temporary-failure landing hydrated in a browser. The coarse `state` is only `unavailable` or `temporary_failure`. | Proof that a record existed, a reason such as expired/revoked/deleted, a human visit, or a failed acceptance. |

The hook payload allowlist is `name`, optional `edition`, coarse `state` and `elapsedMs`. It must never contain a name, score, challenge code, full URL, query, referrer, IP address, user-agent string, session ID, subject hash, internal ID, idempotency value, revocation token or private photo. Later analytics work must preserve bot classification and consent rules and must not count server or crawler fetches as human starts.

Challenge acceptance itself is not an analytics event. It is a strictly functional private record created only by the explicit POST boundary. The hook cannot authorise or substitute for that write.

## Prompt 11 completion and comparison hooks

These hooks remain browser-local `CustomEvent` and performance-mark signals. They do not transmit, persist or queue data.

| Event | Exact meaning | Deduplication and exclusions |
| --- | --- | --- |
| `challenge_complete` | The protected completion POST succeeded after authoritative answer-ID scoring and returned the official safe comparison projection. | Once per mounted completed quiz. It is not emitted for browser score calculation, failed submission, retry, GET, render or crawler access. |
| `comparison_view` | The validated comparison component mounted and became available to the player after the score reveal. | Once per component lifecycle. It does not mean the player read or shared it. |
| `comparison_outcome` | The validated comparison component displayed one controlled outcome: `beat`, `tied`, `did_not_beat` or `unavailable`. | Once per component lifecycle. The payload contains the enum only, plus approved edition and coarse completed state. |
| `rechallenge_start` | The player explicitly activated `Nominate three people` from a completed comparison. | Once per mounted comparison, even if the nomination panel is reopened. It does not claim that a personalised challenge was created or delivered. |

No completion hook may contain names, scores, score differences, maximum scores, full URLs, challenge codes, internal IDs, anonymous subject values, idempotency hashes, session values, IP addresses, user-agent strings, photos or private tokens. No analytics SDK or remote event endpoint is introduced by Prompt 11.

## Prompt 12 nomination hooks

Prompt 12 dispatches `wybp:nomination-event` and adds a `wybp:{event_name}` performance mark. These hooks are browser-local only. They are not analytics writes, are not queued, and are never sent to a server or third party.

| Event | Exact trigger | Allowed fields | Deduplication and exclusions |
| --- | --- | --- | --- |
| `share_intent` | The player deliberately selects WhatsApp, the native share menu or Copy link for one numbered nomination slot. | `name`, controlled `surface` (`result` or `comparison`), controlled `channel` (`whatsapp`, `native` or `copy`), `slot` 1 to 3, approved edition key and non-identifying `elapsedMs`. | May repeat when the player deliberately retries or shares again. It does not mean a window opened, clipboard write succeeded, share sheet resolved or message was delivered. |
| `share_handoff` | WhatsApp returns a non-blocked browsing context, native Web Share resolves successfully, or clipboard writing resolves successfully. | The same allowlist as `share_intent`. | Emitted at most once per numbered slot. It is never emitted for a blocked window, cancelled native share, rejected share promise, unavailable native share, or failed clipboard write. It means handoff only, never delivery. |
| `referred_visit` | A valid challenge landing projection hydrates in an interactive browser. | `name`, controlled `surface` (`challenge_landing`), approved edition key and non-identifying `elapsedMs`. | Once per mounted landing lifecycle. Server rendering, metadata generation, raw GET/HEAD, Open Graph requests and prefetches cannot emit it because the hook runs only after browser hydration. It never creates acceptance. |

No nomination event may contain inviter or recipient names, score, maximum score, outcome, raw challenge code, full URL, query, referrer, IP address, user-agent string, session ID, subject hash, internal ID, raw or hashed idempotency value, revocation token, private photo, contact data or share-sheet contents. Events named `message_sent`, `share_confirmed` and `delivery_confirmed` do not exist. A cancelled native share may emit `share_intent` but never `share_handoff`.

The three-slot UI keeps a separate controlled state for each slot: `ready`, `opening`, `handed_off`, `cancelled` or `failed`. A successful handoff claims a slot once. Further sharing remains available but cannot increase the three-slot count.
