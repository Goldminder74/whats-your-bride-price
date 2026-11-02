# Random question bank

Each paid round is 12 questions drawn from that region's published bank. The classic 60 stay in the pool. The bank lives in `data/question-bank/published/*.json`. It is not stored in D1, so turning it on does not need a migration.

## Flag

`RANDOM_BANK=on` is set in `wrangler.jsonc`. That is the test config and the value a deploy of this file will use. On the live Worker, leave it `on` for the large bank. Set `RANDOM_BANK=off` only to force the fixed classic 12.

The paid site shell is built with `WYBP_FEATURE_RANDOM_BANK=true` in `scripts/assemble-paid-assets.mjs`. The ordinary `npm run build` used by browser tests leaves that value unset, so those tests still play the classic 12 in order.

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

A question is published only when the schema, answer key, options, source URL, page support, duplicate check, sensitivity filter, ambiguity check, and country-to-region map all pass. The 352 research drafts are imported from `data/question-bank/drafts`. Drafts that fail the gate stay held.

Sensitivity holds sacred or secret rites, initiation, FGM, witchcraft accusations, genocide, the slave trade, ethnic stereotypes, and any line that prices a person's worth. Wedding questions stay on dress, music, food, and family gatherings.

The gate records `page-overlap` when the source page text contains the claim. HTTP 200 is required. Results are cached in `data/question-bank/source-cache.json` so a later run does not refetch pages that already resolved.
