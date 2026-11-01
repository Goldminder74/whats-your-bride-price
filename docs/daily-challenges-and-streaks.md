# Daily challenges and streaks

Date: 6 September 2026

Status: local implementation, disabled by default. Production activation requires the documented privacy, legal, storage, secret, migration and deployment reviews.

## Authority and daily boundary

The server creates at most one definition per regional edition and UTC date. It derives the selection seed with HMAC-SHA-256 from the server-only daily secret, date, region, question-set version and scoring version. The raw seed, answer keys, explanations, internal IDs and secret never enter the browser. The saved definition contains only a hash of the seed and the exact ordered stable question/version references.

The selection engine uses twelve currently published, source-approved questions, balances category and difficulty, refuses duplicates and fails honestly when fewer than twelve eligible questions exist. With the current transitional bank of twelve published questions per region, all twelve are returned in a deterministic order. Draft Prompt 21 regional packs remain excluded. Retired versions remain loadable only for an already-created unexpired daily snapshot so a content update cannot change an active set.

The daily date, expiry and countdown originate from server UTC. A dated link is `/daily/{region}/{YYYY-MM-DD}` and becomes a neutral unavailable page outside that exact UTC day. Browser monotonic time animates the countdown after hydration but never establishes authority.

## Official play, practice and recovery

The client sends the existing raw 128-bit anonymous ownership credential only in same-origin POST bodies. When streaks are active, a dedicated functional browser record can retain that credential across sessions. A new pre-completion record expires at the current UTC boundary; only a server-confirmed official completion may reset it to the exact server streak expiry, 180 days later. The server derives the functional ownership hash and rejects a submitted stored hash. Every start has a high-entropy idempotency key, every attempt records exact question/scoring/selection versions, and D1 performs completion as one atomic batch.

The unique daily-owner constraint permits one official completion per region/day. Later starts offer practice; practice has a separate attempt and result, cannot replace the official result and never updates a streak. Daily recovery stores the public question references, selected option IDs, attempt ID and original start idempotency key only until the UTC boundary. It retries only after a deliberate user action and reuses the same authoritative attempt. It stores no answer key or daily seed.

## Streak and retention rule

A streak is created only by a successful authoritative official completion. Consecutive UTC dates increment current; a missed date resets current to one while preserving best. Repeating the same official day cannot increment. Milestones are deterministic UI labels; the rule does not create a tracking identity.

`expires_at` is exactly 180 days after the latest valid official completion and is reset only by such a completion. Practice, visits, failures, retries, analytics, sharing and ordinary quiz play do not extend it. At expiry the record is unavailable immediately. A bounded retention operation deletes expired rows in batches of at most 500 and must run within seven days. A later official completion removes any expired or legacy row in the same transaction and creates a new streak that cannot reconnect the former record.

Clear my streak data reads the existing dedicated credential without creating a replacement, removes matching streak rows immediately, then clears that device credential and daily recovery. No identifiable deletion log is created. Ownership credentials and hashes are restricted to functional authorization and cannot be reused for analytics, marketing or cross-site tracking.

Individual day-1, day-7 and day-30 return analytics are unsupported. Computing them would require reconnecting analytics sessions beyond their 24-hour limit or repurposing a functional identifier, so Prompt 22 adds no daily or streak analytics event and makes no retention-measurement claim.

## Fail-closed activation

`daily_challenge` and `streaks` are separate build-time feature flags and both default to false. Query strings cannot enable either. Streaks cannot be enabled unless daily challenges are enabled. Outside authorised fixture builds, an active flag requires D1 plus `WYBP_DAILY_SECRET`; missing storage, secret, origin/Fetch Metadata, ownership or rate-limit authority yields a neutral unavailable response. Migration 0008 remains local until separately approved for a named hosted D1 database.
