# Current capacity decision and deferred proposal — 13 October 2026

## Active decision: current architecture, 5,000/day, GBP50/month

The owner's latest instruction supersedes the500k proposal below. Retain the current
architecture and5,000 completed games/day planning target. Defer the500k redesign
and all proposed benchmark stages; do not start them. No paid upgrade, top-up,
production schedule, public launch, DNS cutover or live-payment activation.

**Assessment:5,000/day withinGBP50 is not verified.** Reused evidence, no new load:

- `outputs/authority-preparation/integration-final.log`: the local actual free-game
  fixture recorded20 logical writes/game (30 games/360 answers; purge95ms total).
  Scaling gameplay alone gives100k writes/day, equal to the D1 Free allowance,
  before index billing, purchased play, authority/index/outbox and purge. This is
  an extrapolation of a measured fixture, not hosted billing at5k/day.
- `outputs/retention-authority/d1-rehearsal-20261010/purge-receipt.json`: hosted
  synthetic purge removed1,440 answers in29 passes at limit50,14,758ms total,
  p95 pass874ms; receipt recorded12,583 writes/280,830 reads. Approximately97.6
  answers/sec over this small sample is not a sustained full-path guarantee;
  instrumentation/fixture effects prevent treating per-row billing as universal.
- Proposed100/minute cadence gives144k/day. Modelled abandonment increases answer
  demand to68,571/day. At50% successful passes,72k capacity leaves only3,429/day
  spare;137,143 rows accumulated over48h would take40 days to drain, beyond the
  five days remaining in the approved seven-day purge deadline. Cadence is not active.
- The richer planning model estimates119k API requests/day before additional
  operational/Worker-first asset calls, exceeding Workers Free100k/day. This is
  assumed traffic, not observed account consumption. Actual plan/whole-account
  headroom must be confirmed before claiming readiness; no upgrade performed.
- At150k completions/month the model gives roughly8.61m total requests, about1,722
  Netlify credits for requests alone, exceeding Personal's1,000 shared credits before
  bandwidth/deploys/other sites. Real cache/browser/request behaviour remains
  unmeasured. The previousGBP60–250 current-path envelope is an estimate, not a
  measured monthly bill; the oldGBP14–25 figure never verified5k/day.

No monetary overspend or full-scale throughput shortfall was newly measured here.
Observed fixtures expose quota/cadence risks;5k/day cannot be certified on that basis.
Do not buy capacity or silently reduce retention/security. Continue already authorised
local production wiring, independent custody and outstanding sandbox/legal work;
reuse passed checks. Whole-account byte/request billing, sustained authority/purge
throughput and independent snapshot growth remain launch gates. With recharge OFF,
exhaustion can affect other Netlify projects, soGBP50 is not permission to consume
the shared allowance unchecked. Provider rate references below were rechecked.

## Deferred 500,000/day proposal — historical planning only

Deferred scenario: **500,000 completed 12-question games/day**; not the active target.
This is not permission to generate load or activate anything. Current GBP50/month
ceiling, no upgrades/top-ups and all existing protected environments remain unchanged.
Source inspected: a70cad7b6f09c3c45d3f2248a95e8d34ef3a66d4. Arithmetic lives in
`scripts/production-capacity.mjs`; it makes no provider calls. Previous synthetic
recovery evidence proves correctness at small volume, not throughput or a 24h RTO.

## Demand assumptions and accounting

Use 30 days/month. Baseline completion rate70%; incomplete starts answer four
questions. Sensitivity:50–85% completion and two–eight abandoned answers. Recovery:
20% of completions refresh after question seven, causing one resume plus seven
server rejudgements. Retries3% of legitimate API requests; rejected abuse10% after
edge filtering, modelled separately. Unbounded attack traffic has no finite cost ceiling.
These are conservative planning inputs, not observed conversion/traffic metrics.

For C completions/day: starts=C/0.7; abandoned=starts-C; answers=12C+4*abandoned.
Include start, each answer, completion, result read, recovery, one wallet read/start,
three sharing requests for20% of completions, four checkout/status requests/purchase.
Assume50% paid plays;2% Cowrie purchases averaging25 Cowries and1% Royal Reveal
purchases per completion. These form a coherent steady-state economic scenario,
not a change to the two-free-game allowance or products. Include three webhook
deliveries/purchase and five additional deliveries for2% adverse payments. No real
Stripe traffic is required for this model.

Assets:12 shell/font/script requests/start plus four options for30% image questions;
budget0.75–4.5MB total transferred/completion, including API, cached revisits and
reveal/share downloads. Cache hits still incur Netlify transfer/request credits.
Generated media, transform cache misses, bots and shared-result viewers require
separate measured byte/CPU distributions; the upper bound is not unlimited virality.

| Daily workload |5k completions|50k|500k|
|---|---:|---:|---:|
| Starts / incomplete |7,143 /2,143|71,429 /21,429|714,286 /214,286|
| Answer checks, before recovery/retries |68,571|685,714|6,857,143|
| Recovery requests |8,000|80,000|800,000|
| API incl retries/abuse/webhooks, approx |119k|1.19m|11.89m|
| Asset requests |168k|1.68m|16.8m|
| Paid plays / purchases |2,500 /150|25,000 /1,500|250,000 /15,000|
| Webhooks incl adverse cases |465|4,650|46,500|

Do not equate answer checks with12 independent answer INSERTs: judging reads an
owned selection; completion persists the answer set. Recovery rejudges existing
answers and must never create a new attempt/charge. Actual repository batches,
triggers, indexes, writer fences, durable index/outbox and purge must be metered.
Budget60–300 billed row writes and500–5,000 row reads/completion, including cleanup
and authority overhead: at500k/day,900m–4.5bn writes and7.5–75bn reads/month.
These ranges are unmeasured; unindexed scans can exceed them. Retries cause reads
and rate-limit work even when idempotency prevents duplicate accounting.

Storage sensitivity:6–20KB indexed active data/completion over a conservative
90-day result horizon gives270–900GB at500k/day. Attempts expire after24h; actual
answer purge depends on protected-attempt relationships, not a newly invented TTL.
Financial/hold records outlive results. At50% paid play,1–4KB additional retained
financial data/paid play adds91–365GB/year at this target, before purchases/cases.
Open wallets and holds have no artificial expiry. This is a first-year envelope,
not a steady-state upper bound for years of accounting retention.

Current authority sensitivity:2–10 journalled mutation batches/completion means
1–5m/day,11.6–57.9/sec average. Each new Drive file uses ID generation, probe,
upload and readback; event delivery adds further files/requests. At2–10KB encrypted
authority data/completion, retained30-day journal volume is30–150GB. Thirty full
361–1,265GB first-year snapshots require10.8–38TB plus journal, manifests, retries
and independent copies. Daily capture upload plus readback alone moves722–2,530GB;
restoring in24h needs4.2–14.6MB/sec sustained before parsing/import/verification.

## Capacity and recovery acceptance

Propose20% of daily completions in the busiest hour (4.8x average), with10x average
API traffic for60 seconds. This covers a concentrated campaign/time-zone overlap;
measure real arrivals before accepting larger virality. At500k:100k completions/hour,
about660 API requests/sec during that hour and1,376/sec short burst. At5k/50k divide
by100/10. Assets add roughly933/sec in the peak hour at500k. Test hot-wallet contention
separately from many-owner concurrency; horizontal concurrency cannot fix one hot key.

A48h maintenance outage accumulates137k/1.37m/13.71m answer rows respectively,
assuming arrivals continue elsewhere or become eligible during the outage. A whole
site outage loses admissions; do not fabricate completed games during downtime.
Require restoration/service recovery within24h after providers return, ordinary
gameplay RPO<=24h, and no acknowledged financial/closure/deletion authority lost.
Drain the48h purge backlog in24h while serving new arrivals:3x normal successful
purge throughput. With50% interruption/contention allowance provision6x:
4.76 /47.62 /476.2 answer rows/sec, plus attempts/results/financial/hold operations.
This is stricter than the five days left in the approved seven-day physical-purge
deadline, leaving four days contingency. Holds/dependencies remain protected.

The old100 answers/minute ceiling provides144k/day. It fails500k/day even without
outage or abandonment. At5k it has little safety margin once failure/other tables
are included. **No normal-operation or recovery capacity at any proposed volume
is currently certified.** Measure full-path throughput, not SQLite-only DELETE speed.

## Architecture findings and smallest changes

1. Netlify proxy/asset traffic is the dominant delivery cost. Recommend serving the
   game and assets through one Cloudflare origin, retaining existing Netlify sites.
   This is a proposed hosting change, not an approved cutover. Worker-first protected
   asset delivery remains billed Worker traffic; do not bypass authentication to get
   free static requests. Preserve same-origin credentials and equivalent ingress,
   ownership, score and cache isolation protections throughout any transition.
2. D1 is single-threaded per database with a hard10GB/database limit. Replicas do
   not scale writes. Measure indexed queries/batches first; then partition by owner,
   co-locating wallet/order/ledger/allocations/holds/outbox in one transactional shard.
   Separate short-lived gameplay partitions and cache immutable catalogue versions.
   Select shard count from measured throughput and retention growth, with>=2x headroom;
   do not invent a fixed shard count or claim cross-shard accounting transactions.
   Storage alone in the first-year sensitivity implies46–159 databases at8GB usable
   each; this is a lower bound, not a throughput recommendation. Compare that
   operating burden with a transactional multi-writer database before committing
   to extensive sharding; either change needs a separate reviewed implementation.
3. The current global authority writer fence spans Drive network operations. Its
   throughput is bounded by1/critical-section latency:250ms would permit only4
   batches/sec, already below the500k average. Partition authority with the wallet,
   use bounded encrypted group commits and replayable outbox delivery. Financial,
   closure and deletion acknowledgement must remain behind verified independent
   durable authority. Async queues or R2 alone do not meet independent custody or
   prove atomicity with D1. Retain fail-closed operation until a new boundary passes
   crash tests; evaluate an independent object store for journal custody, with Drive
   retained for audited recovery copies rather than millions of runtime files.
4. Snapshot code holds a global export fence, uses OFFSET and defaults to1,000
   pages*50 rows. Raising that limit alone is unsafe. Implement keyset/incremental
   immutable chunks with verified daily snapshot manifests and bounded shard fences,
   preserving30-day restore points and suppression/holds. R2 can be bulk storage,
   but remains the same provider as D1; an independent verified copy is still required.
   Lost-index reconstruction must stream bounded inventory partitions and resume
   from durable cursors, rather than collect millions of file mappings in memory.
5. Reject abuse before D1 where possible; preserve fail-closed commerce rate limits.
   Add admission/backlog limits, bounded retries, sampled sensitive-data-free metrics,
   independent heartbeat and cost alerts. Circuit breakers reduce exposure; they
   do not create a contractual GBP spending cap. No operational schedule enabled.

Google's May2026 quotas supersede the old requests/min assumption for this new
project:325k units/min/user,1m/min/project,400m/day billing threshold,1TB/day egress;
reads5, edits50, downloads200 units. Exact media-read charging and account storage
must be measured. Quota-unit/API billing details are not fully published; do not
assume unlimited free Drive. Workspace750GB/day upload restriction must not be
misrepresented as a verified consumer-Gmail allowance.

## Monthly budget envelopes — estimates, not offers or caps

USD1=GBP0.80 plus20% tax/FX allowance (planning conversion, not a tax determination).
Include existing Netlify subscription, four deploys, other-project contingency,
Worker CPU/requests, D1 indexed writes/reads/storage, encrypted storage and independent
copy, image/log/alert/queue allowances. No other paid subscriptions owner-reported.
Other-site demand and independent-store quotes remain unmeasured. Existing Netlify
partial-cycle readings are not a monthly baseline. Staff/development costs excluded.

| Completed games/day |Current path cost envelope*|After proposed changes*|Illustrative Stripe processing separately**|
|---|---:|---:|---:|
|5,000|GBP60–250|GBP40–150|GBP1,035–2,700|
|50,000|GBP500–2,500|GBP150–900|GBP10,350–27,000|
|500,000|GBP5,000–23,000|GBP1,500–7,500|GBP103,500–270,000|

*Infrastructure planning allowances, first-year retention; current-path numbers
are hypothetical metered costs, **not evidence it can actually serve the load**.
Post-change ranges assume batched custody, measured bounded writes and edge delivery;
retain the upper bound until benchmark/vendor quotes narrow it. Not safe to launch
against an unverified low estimate. Annual financial stock, holds and media growth
require monthly revision. Full operating cost adds processing fees, refunds/disputes
and any agreed staffing; the envelopes do not cap those liabilities.

Reproducible dominant-cost sensitivities: Netlify credits=15*deploys+20*GB+0.0002*
requests+10*computeGBhours. At500k,0.75–4.5MB and57–85 requests/completion give
roughlyGBP3,800–15,400/month Netlify alone on Personal's hypothetical extra-credit
rate, before other projects. D1 writes add GBP816–4,272;361–1,265GB storage adds
GBP256–907. Worker24–45 requests/completion at5–20ms CPU adds aboutGBP140–455.
The independent storage/monitoring/media allowances account for the remaining
range; they are contingencies, not independently verified provider quotations.

**3% purchases/completion,GBP0.23–0.60 fee/purchase sensitivity across approved
GBP1.99/4.99/9.99 products and card mix. Standard UK card baseline1.5%+20p; foreign
cards/currency conversion and disputes can exceed this range. Refund principal,
dispute fees and fraud losses additional. Fees are not deducted from infrastructure
for budget purposes. Royalties/revenue and reinvestment require an owner decision;
no live-payment permission follows from this model.

Recommend a **provisional GBP7,500/month infrastructure envelope for500k/day**, only
after staged evidence and independent-storage quotes; processing funded separately
from receipts under an explicit approved policy. Start with a GBP150/month5k pilot
only after gates pass, then reapprove at50k. Neither recommendation replacesGBP50
today. With recharge off, credit exhaustion risks shared-team service interruption.

## Staged benchmark proposal — separate approval before hosted load

0. Local synthetic only: cap100k attempts/1.2m answers,2GB fixture,30min execution;
   sweep shard count, holds, hot wallets, index sizes and crash boundaries. Measure
   actual bytes/query counts, not just scaled arithmetic. No provider cost.
1. Proposed Worker `wybp-capacity-r001` /D1 `wybp-capacity-d1-r001`, subject to
   inventory/name checks; no application binding, schedules or Stripe calls.
   Apply only existing approved schema after target verification. Limit250 full
   synthetic games,10k HTTP requests,50k billed writes,500k reads,100MB D1,1GB egress,
   100 Drive operations/25MB encrypted data,5requests/sec,30min maximum. No Netlify
   production publication. This is a baseline, not500k certification. Incremental
   spend ceilingGBP2 AND whole-account projected monthly total<=GBP50; if balances,
   daily quotas or allowances cannot establish that, stop before creating resources.
   Smallest next approval: this stage only, atGBP2 maximum within the existingGBP50
   ceiling. It does not approve the futureGBP7,500 envelope or architecture cutover.
2. Only after another approval and necessary paid-plan decision: cap10k games,
   500k HTTP,5m writes,50m reads,1GB D1,5GB transfer,1k independent-storage operations,
   100MB encrypted data,100requests/sec,2h,GBP10 incremental inside the approved
   monthly ceiling. Sweep concurrency and inject lost replies, duplicate webhooks
   as local signed synthetic events, interrupted export/import and delayed custody.
3. Target certification needs a separately priced multi-shard test at>=1,400 API/sec
   bursts,>=476 answer-purges/sec plus other tables, representative90-day indexed
   stock and a13.71m-row purge backlog with new arrivals. **Not authorised by this
   proposal**; scope/cost submitted after stages1–2, no linear extrapolation claim.

Each hosted stage: synthetic namespace, dedicated scoped credentials, explicit
wall-clock/request/byte/write counters with one controller; stop before80% of any
limit or on integrity failure, custody lag, sustained429/overload or cost uncertainty.
Provider billing is delayed: counters/reservations are safeguards, not enforceable
provider spending caps. Do not run a stage without conservative quota headroom.
Capture p50/p95/p99 latency, CPU, billed rows, fence wait, retry/429 rate, upload and
verified journal lag, recovery duration and purge fairness. Candidate interactive
acceptance p95<750ms,p99<2s, no lost/duplicate debit or authority,0 premature access;
thresholds are proposals, not previously observed SLAs.
Delete only stage resources/objects after checksum receipts and sanitised evidence
are preserved; revoke scoped credentials and verify absence. Stop generator first;
rollback benchmark code/unbind isolated bindings. Never roll back existing wallets
or alter public/private-game data. Independent durable-copy and retention cleanup
must match existing policy, not indiscriminately delete approved evidence.

Sources checked13October2026: [Netlify meters](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
[plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/),
[Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 rates](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[R2](https://developers.cloudflare.com/r2/pricing/),
[Drive](https://developers.google.com/workspace/drive/api/guides/limits),
[Stripe UK](https://stripe.com/gb/pricing).
