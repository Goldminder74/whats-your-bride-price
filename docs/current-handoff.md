# Current handoff

## Decision and checkpoint

Branch `feature/viral-build-sprint`; continuation based on `9f170ff035f1ff6b1a49cbf756db7531bab49db2`.
Resolve the validated continuation with `git rev-parse HEAD`.
Launch REQUIRES **5,000 completed games/day,500/hour,48h outage allowance**.
GBP50/month covers hosting/backups/operations; Stripe fees and separately funded
Drive storage excluded.500k redesign deferred. No upgrade/top-up, larger benchmark,
production schedules, public access, DNS or live payments approved.

## Deployed and preserved

[Private game](https://wybp-protected-test.netlify.app/) restored after sandbox checks:
Netlify `6acb796444ae067fcc06f6c9`, Worker `1b76d3fd-6d42-478e-a172-36e6c648c05e`,
source42bf37abbfc18e783da3815e12ee9c176007ba1b. Random ON; Cowries/commerce/webhook/
cron OFF. Owner entry observed; anonymous401,unsigned Worker/disabled webhook404;
both test/ops Workers have zero schedules. D1 `1a268b28-e6d5-4431-8f84-a886df9369f1`,
0000–0012,30 questions/region unchanged. Existing54-Cowrie active wallet/frozen records
preserved; new synthetic wallet zero, two orders protected review. No historical rewrites.

Private ops version `09b6acb0-f2af-45bb-a3ca-04591c5453e0`, existing D1
`a5b2b409-ed08-48c9-ac1d-36699fc6c4b9`,0000–0013. Private heartbeat probe deployed;
no HTTP routes, cron or operations activation. No schema/resource changes to these DBs.
Preserve websites/email,Wigsmi/Sherwood,staging/stash,drafts/reserves;R2 unbound.

## Verified work and evidence

Baseline completed3 games/36 answers,769 HTTP,17,487 billed reads,1,964 writes;
not5k proof. Missing operation-ID argument caused `invalid_retention_time` before hold.
Helper/real-authority regressions correct it; pacing serialised/binary transfer counted.
Original window expired/counters not reset. Disposable `wybp-capacity-d1-r001`
`140d6d9b-89d4-488f-acd3-c10990cabf11` reconciled synthetic-only and deleted.
[Capacity model, bottlenecks and proposed capped benchmark](production-capacity-proposal.md).

40-Cowrie EUR12.28/GBP999p credited40 once,full refund-40; same-owner second order
succeeded, signed961/999 dispute retained review/zero balance after retries.
Royal Reveal EUR2.45/GBP199p delivered result-specific pack/mobile390px/certificate
PNG download-start;full refund revoked access and stale replay did not restore it.
Separate result's191/199 dispute arrived before checkout;review/no entitlement persists.
No invented cause for original15-Cowrie failure or earlier unlinked discrepancy.
[Payment evidence](stripe-payment-link-setup.md).

Heartbeat delivery verified through private RPC/installed Secret; owner confirmed
Down detection,email receipt,then PAUSED/restored1day/1hour. No repeated SMTP/key test.
[Operations and previously passed encrypted recovery](private-operations-runtime.md).

Production bonus WITH queries failed the strict read guard; equivalent SELECT queries
fix availability/expiry without weakening guard/FIFO/accounting. Game source-only.
Focused regressions and compiled private RPC passed. Complete `npm run test:all` passed
(lint/typecheck, unit/data, browser suites, builds, paired packages and Chromium/WebKit
private runtime/recovery). `git diff --check` passed; no assertions weakened.
Ignored evidence: `outputs/authority-preparation/20261015-final-gates/`.

## Remaining launch gates / next action

Production counter:18 authority transactions/450 fence reads per game; per-operation
Drive files/full-history scans and snapshot fences cannot be assumed to scale.
Complete bounded journal/index/delivery work locally before separately approving
hosted capacity/recovery validation. GBP50 sufficiency/minimum budget unverified;
source sensitivity~GBP42–203/month,not a quote/cap. No paid change made.
Owner confirms Stripe setup complete; do not repeat setup. Remaining seller terms,
territories,durable contract confirmation and secure WEBSITE address installation:
[exact decisions/cutover plan](production-preparation-continuation.md).
Production catalogue/runtime,recovery-at-stock,approved schedules,live Stripe and
classesforculture.com cutover/rollback remain gates. Owner policy is not legal sign-off.
