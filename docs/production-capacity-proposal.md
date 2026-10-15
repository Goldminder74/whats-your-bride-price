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

## Read-only headroom and smaller pilot proposal — 13 October

Owner clarification: GBP50 covers hosting, backups and operations only; Stripe
processing/dispute fees are separate. No upgrade or additional spending approved.
Goldmind Personal is USD9/month, 1,000 shared credits, four projects, no add-ons,
auto recharge OFF. General billing showed 598.8 remaining after initial temporary
payment release/restore, 26 publications/390 credits, 20,055 requests/4 credits and
7.2 bandwidth credits. Usage charts lagged the general balance. These are whole-team
figures, not an attribution to other projects or a final bill. Preserve other sites.
Final general billing:583.8 credits remaining,27 publications/405 credits,20,080
requests/4 credits,7.2 bandwidth credits. Existing credits used; no purchased packs.

Wrangler read-only rolling24h counters: private test D1 ~1.33MB; ops D1 ~909kB,
60,249 reads/2,778 writes. These are not UTC-day remaining account quotas. Connected
Cloudflare sign-in subsequently completed through the existing Google identity.
Intended account dashboard verifies Workers Free current plan; Paid offerUSD5/month
plus usage, not selected. Workers & Pages observed257/100,000 requests today
(~99,743 nominal headroom at that instant); October1–13 total1.53k requests and
29.78k CPU ms. This is delayed accounting, not a throughput proof. The ops overview
reported101 invocations/21 uncaught exceptions across historical versions/24h,
zero CPU-limit errors. Active7de3483b alone:2calls/1uncaught exception, median CPU
0.98ms, p90/p99 10.41ms. Recorded final gate check is one200 read-fence plus one503
blocked rehearsal, consistent with these counts but not a proved event attribution;
logs/traces disabled. Do not infer sustained Free10ms compatibility from this sample.
Original no-route
ops version7de3483b remains deployed. Official account-subscriptions API returned403 with
existing CLI authentication; no extra CLI scope requested. Intended Drive account quota subsequently observed:343.5GB
free of400GB. Owner confirms this is paid separately and explicitly excludes it from the GBP50
project budget; do not request its price again. Backup use still consumes that quota.

**Recommend evaluating a provisional100 completed games/day pilot**, not launching
or claiming certified capacity. Retain5k/day as the longer-term target. Reuse the
70% completion, four abandoned answers,20% recovery,3% retry,10% abuse and purchase
assumptions above/below: ~2,378 API/day, ~5,738 total requests/day. At4.5MB transferred
per completion, monthly Netlify traffic is13.5GB/270 credits plus~34.4 request credits.
Reserve120 credits for EIGHT publications across the ENTIRE team,50 other-site
traffic/compute credits and200 safety credits: ~674.4/1,000. These are proposed
budgets, not measured steady usage; the current26-publication preparation pace
cannot continue unchanged. Viral sharing, bots, larger assets or other-site growth
consume the same reserve. No publication or traffic cap has been implemented.

Conservative provisional D1 envelope:180 gameplay/payment/authority billed writes
plus120 steady purge writes per completion; a48h purge backlog drained in24h adds
240 writes/completion/day. With10k other-operation reserve,100/day gives64k/day,
not a measured amplification factor. Reads:500k gameplay + ~535k backlog purge
scans +500k operations reserve = ~1.54m/day. Both require representative billing
verification before approval. Worker-first assets/ops/other Workers must fit shared
100k requests/day. No new benchmark was run or authorised by this proposal.

Candidate50-answer purge pass every5min yields14,400/day nominal,7,200/day at50%
success.100 completions produce~1,371 answer rows/day; a48h backlog (~2,743) could
drain in~11.3h after new arrivals, before the seven-day deadline. This assumes the
existing small-fixture pass duration holds, fair capacity for OTHER record families,
protected holds and adequate D1 billing. It is NOT an approved/activated schedule.
Retention-stock estimate72–253MB at one year excludes uncertain index/authority
growth and does not prove multi-year financial retention fits500MB. Upper growth
could exhaust Free in year2; never shorten approved retention to avoid an upgrade. Thirty full daily snapshots
would need roughly2.2–7.6GB plus journals/retries; 343.5GB free was observed, but retain approved backup lifetimes. Do not shorten retention to fit a quota.

Estimated recurring base: USD9 Netlify (~GBP8.64 at assumed0.80 GBP/USD and20% tax
allowance); Cloudflare Free GBP0; Drive/SMTP/monitor GBP0 incremental ONLY if current
allowances and existing mailbox entitlement suffice. Budget GBP5/month contingency:
~GBP9–14 provisional infrastructure total. Exchange rate, actual tax, mailbox renewal,
independent-monitor entitlement, mailbox renewal and shared usage remain
unverified costs. Existing Drive subscription is separately funded and excluded
by explicit owner instruction; no additional storage purchase is authorised.
GBP50 is an owner ceiling, NOT an enforceable multi-provider spending cap. No automatic
top-up; exhausted Netlify/D1 quotas can instead interrupt service.

Potential later change, not purchased: Workers Paid minimum USD5/month plus tax/usage
(~GBP4.80 using the same assumptions), for D1's50m monthly included writes and larger
single database. Combined base ~GBP13.44, before usage/storage/alerts. This alone does
not make5k/day affordable: Netlify traffic and outage capacity remain bottlenecks.
No paid upgrade is necessary to finish the few authorised sandbox transactions.

Sources rechecked13October: [Netlify meters](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
[D1 rates/index billing](https://developers.cloudflare.com/d1/platform/pricing/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
Netlify documents rollback as zero publication credits; observed team balance changed
by30 during the initial verification window, so do not attribute the entire delta to
this project's restore without billing attribution. Provider counters are delayed.

Smallest proposed hosted capacity approval (NOT executed): reuse an inventoried,
unbound synthetic rehearsal resource only; if none exists, request its exact creation
separately. Maximum25 completed synthetic games/300 answers,1,000 HTTP requests,
10,000 billed writes,100,000 reads,10MB new D1 data,100MB transfer,10 encrypted Drive
objects/10MB,1request/sec,30min; GBP0 incremental/new charges. Stop before80% of
any request/row/storage/account allowance, ambiguity in billing, integrity failure or
unexpected data. Measure real index/authority amplification and bounded purge with
48h equivalent aged rows; these small measurements do not certify5k/day. Preserve
approved holds/closure/deletion authority, keep resources unbound, no schedules or
Stripe. Remove only uniquely marked synthetic fixtures/objects after checksums and
receipts, using existing approved cleanup; never alter private-game wallets/catalogue.
Owner approval and current whole-account quota evidence required before execution.

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

## 15 October reconciliation — current launch gate (supersedes smaller-pilot recommendation)

Launch requires **5,000 completed games/day, 500/hour and 48 hours of outage allowance**.
GBP50/month remains the whole-account hosting/backup/operations ceiling. Drive storage
is paid separately; Stripe transaction/dispute fees are separate. No target downgrade,
paid change, schedule or larger benchmark is approved.

### Observed baseline and confirmed defect

The approved up-to-25-game, 30-minute check completed only THREE games/36 answers.
Receipt: outputs/authority-preparation/20261015-final-gates/capacity-receipt.json.
769 HTTP calls,17,487 billed reads,1,964 billed writes,~2.04MB transfer; final database
1,044,480 bytes. These totals INCLUDE migration/seed overhead. Each completed fixture
added101 billed writes and approximately612–619 reads, without production authority,
Drive delivery, recovery traffic or paid play. API-call p50~121ms,p95~182ms measures
the operator REST transport, not browser/Worker latency or sustainable throughput.

After gameplay the runner called applyAuthorityRetentionAction(service,action,time),
omitting operationId. The actual contract requires(service,operationId,action,time).
It therefore rejected the malformed action before recording a hold. Reconciliation
confirmed3 synthetic wallets/attempts,36 answers,zero holds/outbox events. The corrected
holdCapacityAttempt helper generates the required operation ID; real local authority
regressions verify durable, repeat-safe holds and unchanged accounting. Concurrent
budget admission is now serialised to preserve1request/sec and prevent cap races.
The original30-minute window expired; counters were NOT reset or the failed workload
repeated. No hosted purge/authority throughput result exists from this run.
Disposable wybp-capacity-d1-r001 was reconciled and deleted; both existing databases
remain. Sanitised inventory, failure, checksum and cleanup receipts are outside Git.

### Complete daily model (assumptions, not observed conversion)

70% completion gives7,143 starts and2,143 incomplete games at four answers each:
68,571 answer submissions. Include5,000 completion calls plus5,000 result reads,1,000 recoveries
with8,000 recovery/rejudgement calls,7,143 wallet reads,3,000 sharing calls,
150 purchases/600 checkout-status calls,465 webhook deliveries (retries/adverse events),
3,148 ordinary retry calls and10,807 rejected-abuse calls. Total approximately118,877
API calls and168,000 asset calls/day:286,877 total,8.61million/month. Unbounded abuse
has no finite cost ceiling; cache hits still consume Netlify delivery credits.

500 completions/hour implies~11,888 API+16,800 asset calls/hour,~7.97 total/sec.
Use a5x one-minute microburst (~40/sec), separately from the500/hour requirement.
This is a test assumption; production journal hot-wallet contention and external
Drive service limits must be measured. Starts/incomplete/recovery consume capacity
but must never cause duplicate attempts, charges or credits.

The48h answer backlog is137,143. To drain within the five remaining days of the
approved seven-day purge deadline requires96,000 successful answer deletions/day
INCLUDING new arrivals. At50% successful operation, install at least192,000/day;
one100-row pass/minute supplies only72,000 effective/day and takes~40days to catch up.
Three100-row passes/minute would nominally catch up within24h at50% availability,
but OTHER record families, holds, journal delivery and CPU also consume that budget.
This is proposed arithmetic, NOT an approved schedule or measured purge capacity.
Backups must cover24h gameplay RPO and financial/deletion authority's stricter fence;
never acknowledge protected authority as recoverable before durable verified delivery.
Daily snapshots, full paginated inventories,30-day backup cleanup and reconciliation
must be budgeted in bytes/reads/Drive calls; size and continuous delivery costs remain
unmeasured at the full retained stock. A small empty snapshot is not representative.

### Whole-account cost and bottlenecks

Official rates checked15October: Netlify20credits/GB,2credits/10k requests,15/publication;
PersonalUSD9/1,000credits; existing-team Pro5,000credits USD33,10,000 USD63,
20,000 USD126. Cloudflare Workers Paid USD5 minimum;10m requests/30m CPU-ms included;
D1 first50m writes/25bn reads/month and5GB included. No plan was changed.
Use USD1=GBP0.80 plus20% tax/FX contingency (planning assumption, not a quoted exchange
rate or tax assessment). Current shared preparation usage is not a monthly steady baseline.

At150,000 completions/month,0.75–4.5MB/completion gives112.5–675GB,2,250–13,500
bandwidth credits plus1,721 request credits. Reserve60credits for four team-wide
publications,50 for other-project traffic/compute and200 for safety:4,281–15,531credits,
BEFORE additional dynamic compute or viral sharing. Other projects share all meters;
50credits is an allowance requiring monitoring, not verified future demand.

The low envelope needs Pro5k+Workers Paid:USD38~GBP36.48, plusGBP5–10 operational/
storage/CPU contingency =>~GBP42–47/month. It fitsGBP50 ONLY IF low bytes, bounded
other-project demand, D1 stock and authority amplification are verified. Upper unchanged
path needs Pro20k+Workers Paid:USD131~GBP125.76 plusGBP10–20 contingency =>~GBP136–146.
Recommended unchanged-path provisional budget:GBP150/month, approximatelyGBP100 above
the current ceiling; not spending approval. GBP50 sufficiency is NOT established.
Existing Personal+Free cannot support the target: the101-write fixture extrapolates
to505,000 writes/day,405,000 above Free BEFORE production overhead; modelled API
traffic alone exceeds100,000 Worker requests/day. Protected worker-first asset calls
also count; do not remove authentication-first delivery to save money.

Smallest changes to investigate: existing-team credit tier (replace, not duplicate,
Personal), Workers Paid, reduce delivered bytes to<=0.75MB/completion, preserve protected
cache semantics, batch operator transport and independent journal delivery without
weakening the acknowledged recovery boundary, and fairly bounded multi-pass retention.
Paid D1 avoids daily Free write quota but does not prove journal/Drive throughput.
No R2, queue, new paid monitor or alternate hosting subscription is assumed installed.
Separately funded Drive storage addsGBP0 to THIS ceiling, but consumes its own quota;
existing free Healthchecks adds no new subscription. The existing Namecheap mailbox has no new subscription here, but its monthly project cost allocation is unverified and must fit the operational contingency or be explicitly separately funded.

### Production authority amplification — new local evidence

The real production adapter wraps gameplay/financial writers, not just purchases.
A local actual-repository counter (transport stubbed ONLY to count calls) measured
18 authority transactions/33 repository statements/450 fence reads per completed
free game, plus2 transactions/8 fence reads for a new wallet. Receipt:
outputs/authority-preparation/20261015-final-gates/local-authority-workload.json.
This is NOT hosted latency, cryptographic delivery or billed-row measurement. A
second instantaneous same-owner game hit the existing20/minute limiter as expected;
the counted one-game fixture was used rather than weakening/resetting that protection.

At5k completions this models90k protected operations and2.25m private fence RPCs/day,
before incomplete games, new wallets, paid play, payments and purge. With7,143 new
wallets/day the fresh-owner upper scenario adds14,286 operations. Every operation
currently creates an independent .intent and eventually .event: approximately208,572
new files/day,6.26million over the approved30-day backup window, before snapshots.
Google documents500,000 items per non-root My Drive folder. The currently configured
single-folder arrangement cannot retain that stock; more paid bytes do not fix it.
[Google folder limits](https://developers.google.com/workspace/drive/api/guides/folder).
Actual Drive project quota units and sustained latency remain unmeasured; do not
assume old request-quota figures or bypass provider403/429 backoff.

Delivery currently lists ALL retained names, resolves each persistent index entry,
downloads retained intents and takes a full fenced snapshot. Repeating that operation
at purge/heartbeat cadence would grow with retained history and block ordinary writers;
no500/hour or24h recovery guarantee follows from the successful small recovery tests.
Even a10–30 EXTRA billed-metadata-write/operation sensitivity gives31–94m additional
writes/month plus~15m baseline, i.e.46–109m total. This is an explicit assumption,
not measured amplification; D1 overage could addUSD0–59 (~GBP0–57 with the stated tax/
FX allowance). Thus the earlierGBP42–146 delivery envelope is insufficient as a
current-source all-in promise; sensitivity is~GBP42–203 and inventory costs may exceed
it. No finite small-sample envelope certifies this unbounded scan pattern.

Minimum local changes before Phase B: separate ephemeral atomic rate buckets from
financial journalling under the existing fail-closed admission/fence contract; bounded
incremental event delivery and hash-verified compaction/time-partitioned custody with
complete lost-index reconstruction; decouple purge/heartbeat from full daily snapshots;
batch persistent-index reads and bound maintenance lock duration. Preserve every
financial/closure/deletion/hold recovery boundary, strict acknowledgement semantics,
approved retention and idempotency. Do not acknowledge independently recoverable
financial commitment merely because an intent upload or D1 transaction succeeded.
No cross-provider atomicity is claimed. These optimisations are NOT implemented here,
require crash/retry/restore regressions, and no new migration is assumed or approved.

A production-only blocker discovered while counting was the authority guard rejecting
the wallet's legitimate WITH bonus queries. Both were rewritten as equivalent SELECT
subqueries, keeping FIFO arithmetic, balances and the guard unchanged. Actual authority-
backed expiry/repeat/accounting and unsafe-read rejection regression passed. This fix
is source-only for the game; the restored private profile bypasses that production
adapter, and current wallets/data were not modified for it.

Recommendation: first validate these bounded changes under existing local authority.
KeepGBP50 until measured post-change costs show whether it suffices. GBP150 is a
provisional conservative POST-optimisation delivery envelope, not a recommendation
to spend now or a cure for current unbounded work. Current-source sensitivity can
exceed the ceiling by~GBP153/month; minimum viable production budget is still unproved.
Only after local gates, seek the exact separate hosted Phase A/B/C approval below.
### Smallest proposed hosted benchmark — NEW APPROVAL REQUIRED

No new run is authorised by this proposal. First finish corrected local full-path
checks and approve a separate execution window; never reset the original30-minute
baseline budget. Phase A:<=22 additional games (25 cumulative with the original three) with the fixed hold/pacing and a private
RPC harness to remove per-query REST overhead; max1,000HTTP/10k writes/100k reads,
10MB D1/100MB transfer/10Drive objects/10MB,1HTTP/sec,30minutes,GBP0 new spending,
stop at80% any limit. This confirms tooling correctness, not launch capacity.

Phase B: one isolated private Netlify project wybp-capacity-private-r002, one signed-
ingress Worker wybp-capacity-worker-r002 and ONLY its synthetic D1
wybp-capacity-d1-r002; no production DNS or existing application binding. Reuse existing
team, no paid Netlify subscription duplicate. Unchanged0000–0013, synthetic150-question
catalogue, distinct credentials installed securely (absent in builds), owner-only
client and signed Worker ingress. This extra isolated client is necessary to measure
the complete Netlify/Worker path without loading real wallets/catalogue.

Exactly<=500 completed games over60minutes,<=215 incomplete starts,<=100 refresh
recoveries, synthetic financial/hold/closure cases and actual encrypted Drive custody.
Total<=40,000HTTP requests,250,000 billed writes,2m billed reads,100MB D1,1GB egress,
1,000Drive objects/25MB encrypted transfer;<=40HTTP/sec for<=60seconds and<=10/sec
otherwise. Count browser assets, rejects, provider/operator calls and retries as well
as gameplay. Abort at80% ANY cap, integrity error, unknown billing or account headroom
boundary. These maxima require Workers Paid: do NOT try250k writes under Free100k/day.

Phase C, separately metered on the SAME isolated resources:<=150,000 aged answer
rows plus bounded other-family/hold fixtures,<=2,000 passes at100rows,<=60minutes;
max2m billed writes,50m reads,100MB D1,200MB egress,10k HTTP,5,000Drive objects/50MB.
Include creation, journal/index overhead, deletion and cleanup in ALL caps. Measure
actual forward progress and dependency preservation after a simulated48h scheduling
outage. Stop before80% any bound; do not claim success if caps prevent backlog drain.
This models the answer backlog, not a full multi-year retained financial stock or a
real48h provider outage. Require additional retained-stock capacity evidence before
promising the24h RTO or perpetual retention storage fit.

Proposed cumulative execution ceiling:GBP6 NEW spending for one reviewedUSD5 Workers
Paid month with tax/FX allowance, within existingGBP50 total; existing Netlify credits
<=60 for at most four publications plus measured<=35 traffic credits. No top-up or
other paid service. Account-wide Paid change itself needs explicit owner approval;
check existing subscriptions/tax and resource availability first. If the provider
cannot bound the test withinGBP6 or the existing allowance, stop before upgrading.
CPU-per-invocation limits and script request/row counters bound this experiment;
provider spend alerts are NOT an enforceable monthly monetary cap.

Preserve sanitised checksums/receipts, verify holds/accounting/recovery barriers,
restore private feature flags, delete ONLY these synthetic resources/Drive objects
under approved cleanup, verify absence. No cron activation, live Stripe or public
access. Phase B substantiates one measured500/hour sample; Phase C supports bounded
outage-backlog extrapolation. Neither alone proves sustained24h service or unbounded
abuse. Production approval still requires measured billing/headroom/stock, operating
schedule, seller/payment gates and a rollback drill. No proposed phase has been run.
Sources: [Netlify plans/rates](https://www.netlify.com/pricing/),
[Netlify tier prices](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

15October whole-team dashboard readback before final restore:523/1,000 credits
remaining,31 publications/465credits,21,530 requests/4.3credits; compute0. Recharge
settings explicitly Disabled (read-only modal, cancelled unchanged). API top-up pack
amount500 is NOT an enabled-state indicator. Charts lag balance; do not reconcile
future cost from a partial-cycle chart or assume other-project monthly usage is zero.

## Local bounded optimisation — 15 October continuation

Based on dbe0b23; source-only, no deployment, settings, folders or paid plan changed.
[Exact benchmark approval](bounded-hosted-benchmark-approval.md) supersedes the
older Phase B/C caps above. [Owner review](owner-purchase-review.md) consolidates
sales decisions without inventing legal approval or an installed address route.

- Exact Quick Play admission SQL now uses before/after recovery fences without an
  authority intent. Only ephemeral shared counters are exempt; money, attempts,
  answers, closures, deletion and holds remain journalled. Actual local repositories:
  **4 transactions/19 statements/478 fence reads** per game, versus18/33/450;
  new wallet1 transaction/10 fence reads. Transport stubbed only for counting:
  these are not billed-row or latency measurements.
- `flush` readbacks at most25 encrypted committed events in one immutable chunk,
  then transactionally checkpoints delivery. Crashes reuse ciphertext; an uncertain
  writer stays fenced. No snapshot baseline advances, cleanup authority or claim of
  cross-provider atomicity. Precommit intent is still durable before business commit.
- Snapshots pin chunk proofs instead of duplicate per-event files where available.
  Missing/tampered chunks block recovery; legacy boundaries remain readable.
  Chunks keep the earliest event's original30-day expiry, with no retry renewal;
  referencing boundaries expire no later than their chunk.
- Purge ticks report bounded delivery/backlog rather than export the entire source.
  Full snapshots remain separate explicit operator work. Snapshot/outbox keysets
  replace offsets; inventory identity checks use validated primary-key range queries of40 names (80 binds), with no new index.
- Optional16-folder custody preserves legacy root files, pins actual folders and
  resumes lost-index reconstruction. It creates no folders or hosted settings.
  Provisioning and benchmark-only configuration need the separate hosted approval.

At5k/day,4 operations/game plus up to7,143 new wallets imply27,143 intents/day,
814,290 over30days, before incomplete games/payments/retention; roughly1,086 proof
chunks/day when full. Sixteen folders distribute this illustrative stock to about53k
files/folder on average, not a balance/latency/retention guarantee. Counters still cost
D1 writes and fences: completed games alone imply2.39m fence RPC/day.

Remaining **technical gates**: global writer fencing/read latency; cleanup scan
amplification; full stock beyond bounded snapshot/inventory
invocations; incremental recovery and cleanup at that stock. Default1,000x50-row
snapshot cannot cover one day's60k completed answers. Do not increase a limit merely
to hide that gap. A resumable full-stock snapshot/inventory plan needs validation
before launch; explain any future schema/index addition before implementation.
The proposed small benchmark can measure throughput/reveal limits, not waive them.

Official Standard Workers service-binding RPC adds CPU/D1 work but no second inbound
request fee. Do not multiply request fees by fence RPC count. £42–47 optimistic and
£136–146 high-transfer envelopes remain assumptions pending measured CPU, metadata,
retention/backup stock and other-project use. Prior £203 source sensitivity is
historical, not a verified post-change quote. £50 sufficiency remains unproven.
Evidence (ignored): `outputs/authority-preparation/bounded-journal-*.log` and
`bounded-journal-workload.json`. No hosted benchmark or activation occurred.
