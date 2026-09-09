# Random Quick Play

`random_quick_play` controls fresh ordinary regional games. It is false by default and can be enabled only through the established `WYBP_FEATURE_RANDOM_QUICK_PLAY` build environment value. URL parameters, browser storage, request bodies and request headers cannot enable it. A production build also fails closed unless D1 is configured. Local fixture review additionally requires both `WYBP_REVIEW_BUILD=true` and `WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES=true`.

## Readiness

Each region needs at least 30 currently valid question versions whose publication status is `published` and whose source review status is `approved`. The preferred operating target is 50. The present canonical catalogue has 12 eligible questions in each region, so every region is 18 short and activation remains blocked. The 352 Prompt 21 research candidates stay draft and are never eligible.

When the flag is on but a region is below threshold, the selection endpoint returns a controlled not-ready response with eligible, required and shortfall counts. The interface describes the shortfall and offers the existing classic 12-question edition without calling it fresh or random.

## Selection and persistence

Every genuinely new Quick Play request supplies only the region, the existing anonymous functional credential and an idempotency key. The server derives the owner hash, reads a bounded 90-day history of at most 100 question-version references, and selects 12 unique current versions. It first avoids the latest 24 seen references when capacity permits. When repeats are necessary it prefers the least recently seen versions, then applies the existing category and difficulty balancing policy.

New starts and answer judgements use bounded minute buckets in the existing operation-limit store. Idempotent retries return the already issued attempt before consuming another start allowance. The rate key is the same server-derived functional owner hash; no analytics identity, consent or browser-supplied hash participates.

The server generates 32 random bytes through the platform cryptographic generator. Domain-separated SHA-256 ranks independently choose the set, question order and option order. Only a separately domain-separated SHA-256 reference is stored. The raw seed is never stored or returned. Reproducible seeds remain capability-gated for Daily Challenge and compatible challenge operations and cannot enter the public Quick Play request.

The immutable attempt snapshot stores its array in displayed question order. Each entry contains `stableId`, `version` and the displayed `optionOrder` of stable option IDs. This fits the existing JSON snapshot, seed-reference, idempotency and owner indexes, so migration 0009 is not required. Recovery sends the server-issued attempt ID with the same anonymous credential and receives the exact persisted projection. It never asks the selector for another set.

Answer options are shuffled unless the reviewed prompt or explanation refers to positions or sequence. This fixed-order rule prevents a shuffle from changing meaning while allowing safe single-answer, multi-answer, sentence-completion and image options to vary. Image projections still expose only A–D markers, opaque local assets and reviewed neutral descriptions. The asset and description arrays follow the persisted option-ID order.

## Scoring and game modes

The browser sends only the server-issued attempt ID, the same functional credential, the selected question reference and selected stable option IDs. The server verifies ownership, expiry, membership in the immutable attempt and valid option IDs before returning the judgement and explanation. Canonical answers do not appear in the selection or recovery response.

Replay clears the former attempt reference and requests a new cryptographic selection. Daily Challenge continues to derive one fixed regional set from the UTC date and server secret. Accepted shared challenges continue to use their compatible fixed question versions. Future Couples and Party modes must issue compatible fixed sets to every comparable player rather than independently randomizing them.

Recent-question history uses the existing functional owner relationship. It does not use analytics consent or analytics identifiers, does not create another identity, and is absent from public URLs. Considering a question does not extend attempt, result or streak retention.
