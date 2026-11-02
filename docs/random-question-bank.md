# Random question bank

Each paid round is 12 questions drawn from that region's published bank. The classic 60 stay in the pool. The bank lives in `data/question-bank/published/*.json`. It is not stored in D1, so turning it on does not need a migration.

## Flag

`RANDOM_BANK=on` is set in `wrangler.jsonc`. That is the test config and the value a deploy of this file will use. On the live Worker, leave it `on` for the large bank. Set `RANDOM_BANK=off` only to force the fixed classic 12.

The paid site shell is built with `WYBP_FEATURE_RANDOM_BANK=true` in `scripts/assemble-paid-assets.mjs`. `npm run test:e2e` builds with that flag and plays a full random round. A plain `npm run build` leaves the flag unset, so those pages still play the classic 12 in order.

The browser loads `/question-bank/<region>.json` from the paid asset directory. With `run_worker_first`, the Worker serves only those five region files. Other JSON in the asset directory, including the build manifest, stays unserved. If that fetch fails, the game falls back to the bundled region chunk.

With the flag on:

- A new round avoids the player's latest 24 questions when the bank allows it.
- Questions are spread across categories and difficulty.
- Options are shuffled unless the prompt depends on order, or the question is a picture.
- Picture rounds keep neutral alt text (`Photo for question N, choice A`) and never put the answer in the image address.
- Opening the same round id returns the same questions and the same option order.
- A refresh during the React game restores the round from this browser's session storage.

## Pipeline

```bash
npm run question-bank:build
```

That rebuilds generated rows, checks every source URL, and writes:

- `data/question-bank/published/<region>.json` for questions that passed
- `data/question-bank/held/<region>.json` with reasons
- `data/question-bank/reports/summary.json`

A question is published only when the schema, answer key, options, source URL, quoted evidence sentence, duplicate check, sensitivity filter, ambiguity check, and country-to-region map all pass, and an editorial score is at least 4 for clarity, fun, and accuracy. The evidence quote is stored on `gateReport.evidenceQuote`. No quote means the question is held. The quote has to state the answer and the claim, including a wedding custom when the question is about one. The 352 research drafts are imported from `data/question-bank/drafts`. Drafts that fail the gate stay held.

Prompts are ordinary quiz English. Category labels such as "language point" or "wedding custom" are not used as scaffolding, and a question is held if the correct answer, or its distinctive word, is already in the prompt. "Current champion" and undated world-record claims are held. The published files also include a human editorial pass. Re-running `npm run question-bank:build` rebuilds from the fact rows and replaces that pass.

Sensitivity holds sacred or secret rites, initiation, FGM, witchcraft accusations, genocide, the slave trade, ethnic stereotypes, and any line that prices a person's worth. Wedding questions stay on dress, music, food, and family gatherings that the source page actually describes.

The gate records `evidence-quote` when a sentence on the source page supports the question. HTTP 200 is required. Results are cached in `data/question-bank/source-cache.json` so a later run does not refetch pages that already resolved. The editorial scores are rule-based (clarity, fun, accuracy), each from 1 to 5.
