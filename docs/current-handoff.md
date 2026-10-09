# Current handoff

## Source and deployed state

Branch `feature/viral-build-sprint`; verified correction checkpoint
`a036c991b296d23494cb2896e22a89e7eb6f7529`. PR #1 open/draft/unmerged, base master.
[Private application](https://wybp-protected-test.netlify.app/) is restored to
verified random-only release `f1cbdeec1c3df2340ed58efbaddc49d24061bb6e9e13cfd12437a0adf110dd70`;
Netlify `6ac815e3a823977864ab5e66`, Worker
`5d5e11fa-604c-4fd1-9bc1-beb35eee74fd`. Owner-only primary/previews: anonymous 401;
109 client checksums matched. Unsigned Worker requests and disabled webhook POST
return 404. Commerce, Cowrie enforcement, webhook, cron, analytics, fast_entry and
unrelated optional features are off; R2 unbound. Existing websites are untouched.

## Catalogue and recovery

Reuse D1 `wybp-test-d1-r001`, `1a268b28-e6d5-4431-8f84-a886df9369f1`, bound only
to `wybp-test-r001`. Migrations 0000–0012 unchanged; do not repeat migrations,
seed or publication. Canonical 60 plus approved 90 provide 30 eligible/region.
Manifest `4b6883d08e9efceb336ab333bab0e67e0219d107693ec85b99757170dff8c22d`.
Research drafts/reserves remain unpublished; machine evidence is not human approval.
Random recovery is independent of fast_entry; five-region desktop/mobile games
and recovery without duplicate charges are verified.

## Sandbox results and next action

Only Classes for Culture parent `acct_1UOOZAIb8Lefpj36`, sandbox
`acct_1UOOZKEsGCyaV3rl`; reuse four existing fixed-GBP links and webhook
`we_1UOQOYEsGCyaV3rlnR8Gk5LJ` (five events, API `2026-09-30.endive`). Installed
secret values remain unread. No live payments or duplicate resources.

Recorded live sandbox passes: all bundles for the same owner; result-specific Royal
Reveal; two free plays then one paid play with recovery; declined payments and
redirects grant nothing; full unused refund, distinct dispute reversal and retries.
The du_ dispute-ID correction is committed at the checkpoint above.

Audit correction: the atomic webhook writer now records first processing time only
when a received event is reconciled. Replays preserve it. Historical processed rows
with null timestamps remain untouched: their processing dates cannot be inferred.
Reconciliation and retention use order state, expiry and protected dependencies,
not processed_at; the defect affects audit completeness, not balance or purge timing.
No migration or historical backfill.

Verified payment release `9722d2c51cb9c88b05a9d0451c3b8efa49c268a61078d6bcd69997dee041f4e1`:
Netlify `6ac8deaa5073347cf3b46352`, Worker `bc65deb0-adc0-4ede-9d38-ea1d6ff57bbe`.
Fresh fifteen-Cowrie purchase credited 15; its full refund restored balance 54.
Both new signed events have valid first-processing timestamps. Refund then older
checkout replays returned 200, preserved both timestamps and did not recredit.
Seven historical nulls remain. Wallet active, bonus 0, no pending/review orders.
109 client checksums matched; primary/previews anonymous 401, direct Worker 404.
Payment release rolled back after checks; commerce/webhook disabled again.

Remaining: original fifteen-checkout failure is not root-caused; repeated purchases
now succeed, and retained counts exclude a full commerce rate bucket. Do not call
it resolved. Frozen-wallet live verification needs a separate authenticated browser
profile/synthetic owner; only the current owner browser is connected. Do not freeze,
reset or recreate the current wallet. Earlier accidental confirmation did not record
a freeze. Local frozen-settlement, ownership and initial out-of-order cases pass;
these do not substitute for outstanding independent-owner/live frozen checks.

Validation: 62 payment/accounting/retention tests and 23 hosting/wallet/recovery tests
passed; matched secret-free payment build and actual 140-module Wrangler package
passed; diff check passed. Previously passed compiled navigation/mobile return checks
reused because client source is unchanged. Evidence outside Git:
`outputs/activation-preparation/stripe-sandbox-20261009/` and TEMP audit logs.

## Constraints and contracts

Pending copy/FAQ work stays local, unstaged and excluded. Public launch requires
random replay, Cowrie access/purchases and Royal Reveal together, verified payments
and explicit activation. Seller Ayodele Ayeni, UK sole trader, not VAT registered;
Classes for Culture; team@classesforculture.com. Seller/legal/provider gates remain.
Preserve Wigsmi/Sherwood, other websites/DNS/Workers/Sites, staging and stash.
Secret-free builds; disconnected Git builds. No hosted retention activation.

[Hosting/rollback](netlify-cloudflare-hosting.md), [payment setup](stripe-payment-link-setup.md),
[activation](isolated-test-approval-package.md), [retention limits](retention-operations.md),
[evidence custody](launch-evidence-backup.md). Live restore/custody and purge limits
remain; exports cap at 100/category and 64 KiB. OneDrive deferred; historical
capture backup unverified. Owner policy approval is not professional legal sign-off.
