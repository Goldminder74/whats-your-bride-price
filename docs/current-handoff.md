# Current handoff

## Source and private deployment

Branch `feature/viral-build-sprint`; resolve the verified recovery commit with
`git rev-parse HEAD` (based on `2613be002e02a97dbba24953debf15ffdf9d2ce8`).
PR #1 remains open/draft/unmerged, base master.
[Private application](https://wybp-protected-test.netlify.app/) now runs
**database-backed random Quick Play**, independently of disabled fast_entry.
Matched release `f1cbdeec1c3df2340ed58efbaddc49d24061bb6e9e13cfd12437a0adf110dd70`;
Netlify deploy `6ac815e3a823977864ab5e66`; Worker version
`a3c48009-acfc-411d-8838-7d39c2299d5d`. Owner-only primary/preview access and
signed ingress/assets remain. D1 is bound only to the isolated test Worker; R2
is unbound. Cowries, commerce, cron, webhook, analytics, fast_entry and other
optional features remain off. No Stripe activation occurred.

## Catalogue and recovery verification

Existing `wybp-test-d1-r001`, UUID `1a268b28-e6d5-4431-8f84-a886df9369f1`, was
reused without repeating migrations, seed or publication. Unchanged migrations
0000–0012; schema fingerprint
`5d45ee35ee5e5cce814d5d4659418324f1bb4fde9657a5f893dbc6640122c9c4`.
Five editions/60 canonical questions plus exactly 90 approved versions provide
30 eligible questions per region. Manifest
`4b6883d08e9efceb336ab333bab0e67e0219d107693ec85b99757170dff8c22d`.
352 research drafts and unused reserves remain unpublished; no human cultural
approval is claimed.

Recovery saves the tab-scoped attempt and choices, resumes its owned server
snapshot and rejudges previous answers. It never selects or purchases another
attempt. Authoritatively completed paid attempts clear recovery only after success.
Unit coverage, the final complete integration suite, both compiled hosting targets,
Chromium/WebKit recovery and secret-free matched release verification passed.
All five live 390×844 mobile-viewport games completed twelve questions/results,
refreshing after seven answers; desktop recovery/image progression also passed.
Recovered question/option order was unchanged. Live desktop D1 counts stayed
13 attempts/zero ledger entries across refresh. Physical-device testing is not claimed.
109 uploaded client checksums matched; primary/preview anonymous requests returned
401, unsigned/invalid Worker requests 404. Ignored receipts/screenshots remain in
`outputs/activation-preparation/`; lengthy logs are outside Git in TEMP.

## Next action and boundaries

Stop before Stripe activation. Next payment prerequisite is authenticated access
to the separate Classes for Culture account `acct_1UOOZAIb8Lefpj36` and secure
sandbox configuration: [setup](stripe-payment-link-setup.md).
Public launch requires random replay, Cowrie access/purchases and Royal Reveal.
Seller Ayodele Ayeni, UK sole trader, not VAT registered; Classes for Culture;
team@classesforculture.com. Address/phone and payment/provider gates remain.
Wigsmi/Sherwood, existing websites/DNS/Workers/Sites, staging/stash are excluded.
No live payments/public activation. Keep secret-free builds and disconnected Git builds.

[Runbook and rollback](netlify-cloudflare-hosting.md),
[activation package](isolated-test-approval-package.md),
[retention limits](retention-operations.md), [evidence custody](launch-evidence-backup.md).
Previous matched all-off release `cb5ce5b6…` and Netlify deploy
`6ac39ed9dc048234fd201369` remain the rollback pair; preserve D1 on rollback.
Live provider restore/custody and purge-capacity limits remain before cron;
exports cap at 100/category and 64 KiB. Retention approval is not professional
legal sign-off. OneDrive is deferred; historical captures remain unverified.
