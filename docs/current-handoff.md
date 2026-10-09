# Current handoff

## Source and deployed state

Branch `feature/viral-build-sprint`; payment correction starts from
`a7f3ade1754a965a3c39061771dd9f75a826bd2f`. PR #1 open/draft/unmerged, base master.
[Private application](https://wybp-protected-test.netlify.app/) is restored to
verified random-only release `f1cbdeec1c3df2340ed58efbaddc49d24061bb6e9e13cfd12437a0adf110dd70`;
Netlify `6ac815e3a823977864ab5e66`, Worker
`acd2f47a-2c19-47f6-8f42-dd35e16a7b3b`. Owner-only primary/previews: anonymous 401;
109 client checksums matched. Unsigned Worker requests and disabled webhook POST
return 404. Commerce, Cowrie enforcement, webhook, cron, analytics, fast_entry and
unrelated optional features are off; R2 unbound. Existing websites are untouched.

## Catalogue and recovery

Reuse D1 `wybp-test-d1-r001`, `1a268b28-e6d5-4431-8f84-a886df9369f1`, bound only
to `wybp-test-r001`. Migrations 0000–0012 unchanged; do not repeat migrations,
seed or publication. Canonical 60 plus approved 90 provide 30 eligible/region.
Manifest `4b6883d08e9efceb336ab333bab0e67e0219d107693ec85b99757170dff8c22d`.
Research drafts/reserves remain unpublished; machine evidence is not human approval.
Random recovery works independently of fast_entry; five-region desktop/mobile
verification remains recorded. Recovery never creates or charges another attempt.

## Sandbox results and next action

Only Classes for Culture parent `acct_1UOOZAIb8Lefpj36`, sandbox
`acct_1UOOZKEsGCyaV3rl`; reuse four existing fixed-GBP links and webhook
`we_1UOQOYEsGCyaV3rlnR8Gk5LJ` (five events, API `2026-09-30.endive`). Installed
secret values remain unread. No live payments or duplicate resources.

Five-, fifteen- and forty-Cowrie purchases succeeded for the same owner. Royal
Reveal delivered only the bought result; another result still offered purchase.
Two free games caused no debit; third game charged once, survived refresh and
completed. Declined card/direct return granted nothing. Full unused five-Cowrie
refund reversed exactly five. Fifteen/forty checkout retries and refund replay
returned 200 without duplicate credit/reversal.

Confirmed defect: validator/test fixtures expected `dp_` dispute IDs; actual signed
Stripe event uses `du_`, causing 400. Corrected prefix with real-shape regression;
real event then settled one `verified_dispute` reversal, distinct from refund.
Final tested payment release `f753dbc91ac8f09b8893144aeafc1c828df779630b55ff17f7ca4999f21d9276`
(Netlify `6ac8d7591511aa7a4a89baa6`, Worker `190565e9-6873-4bed-a2b6-f9d473b38866`)
was rolled back safely. No temporary diagnostics remain in its source.

Remaining: original fifteen-checkout failure is not reproduced or root-caused;
retained counts rule out a full commerce rate bucket. Frozen-wallet live check
stalled at browser confirmation; owner must Cancel it. D1 remains active, balance
54, free plays consumed 2; no reset. Resume live frozen settlement/ownership/replay
checks after browser recovery. Do not claim complete payment approval.

Validation: 44 payment/accounting tests +30 security/wallet/recovery tests;
focused purchase/return gate and 3 UI tests passed; both compiled hosting/navigation
builds and regional desktop/mobile harness passed. New regression fails against
original validator. Logs/receipts outside Git: `outputs/activation-preparation/stripe-sandbox-20261009/`, TEMP.

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
