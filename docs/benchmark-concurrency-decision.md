# Stopped r002 run: decision required

18 October 2026. Proposal only; no new resource or measurement window is approved.

## Observed result

The owner-approved regular environment-variable exception was installed only for
the disposable signed-proxy credential. Netlify publication
`6ad43154be115fa5241127e0` matched the verified isolated Worker. Signed/anonymous
ingress checks passed. The shared clock started once and was stopped after about
288 seconds of increasing queue delay and a missed first completion deadline.
There were11 synthetic starts, one accepted answer and zero completed games.
All15 setup/workload actions settled; no uncertain mutation was replayed.

Start-admission gaps were approximately26–28 seconds while work was queued. Each
start used90 counted internal operations and23–24 external/client/provider requests.
These are observed serial admission intervals, not separately measured Drive,
fence or CPU latency. The driver queues the entire request/response, including
read-only questions, to enforce aggregate external pacing. It consequently cannot
establish concurrent500/hour capacity. This harness limitation is confirmed; an
application concurrency ceiling, Google latency attribution and a monthly launch
cost are NOT established. It would be misleading to extrapolate this into either
production readiness or a definitive production maximum.

The global fail-stop remains authoritative. Phase C was not executed. Do not reset
the clock, clear reservations or reopen this run. A rejected read-only reconciliation
query used an incorrect wallet column; its conservative reservation is retained.
The corrected read used verified purchased/bonus columns and found11 wallets,
zero balance/ledger/orders/results/answers and idle journal/writer fences.

## Smallest proposed next experiment

Locally validate a bounded parallel controller (at most8 in-flight actions) with
one shared outbound pacing coordinator. Merely removing the current queue would
break the10-request/sec aggregate provider limit and is not acceptable. A proposed
implementation is one isolated SQLite-backed Durable Object namespace/class on
the recreated benchmark Worker, class `BenchmarkPacing`, binding `BENCHMARK_PACING`,
with one active instance. A first class setup tag `benchmark-pacing-r001` would
initialise only its disposable counter/progress storage. It must pace the actual outbound
fetches, including client/proxy requests, rather than issue reusable timing tokens.
Keep the existing D1 financial writer fence, durable reservations, exact identities,
rejection handling and unknown-outcome fail-stop. Concurrent writer rejection is
an outcome to measure, not permission to weaken the fence or silently retry money.
Record separate queue, fetch, authority and fence timings without bodies or SQL.

This adds a hosted resource outside the approved three-resource list, so creation
and another measurement window require owner approval. It is not a proposed
production architecture change. Local tests must prove aggregate pacing across
concurrent calls/restart, bounded queue/backpressure, preserved unknown reservations,
no duplicate effects and no timing/body/credential leakage before any deployment.
The coordinator stores only counters, hashes, deadlines and progress; no credentials
or customer data. Its separate storage/class setup is not a D1 migration.

If approved, recreate only the same three disposable r002 resource names plus that
one namespace, using synthetic data and unchanged D1 migrations0000–0013. Preserve
all old receipts and count prior expenditure/publications against the same limits.
Use one new immutable60-minute B window and one60-minute C window. All revised
resource/traffic caps,20% reserves,100ms CPU and GBP8/GBP50 ceilings remain; do not
start if aggregate old+new admissions cannot fit. No500k benchmark, schedule or
production resource is included. Full30-day stock recovery remains a separate gate.

## Cost and cleanup conditions

No plan upgrade or new subscription is proposed. Durable Objects are available
under the existing Workers Paid plan. Its included allocations and overage rounding
must be checked:1m requests/month,400k GB-s/month; SQLite storage/read/write
allowances are separate metered dimensions. Limit this coordinator to150k calls,
64MB stored data and6h maximum active lifetime including protected preparation
and cleanup (about2,765 GB-s at128MB).
Reserve4,000 GB-s including shutdown/timeout allowance,1m writes and2m reads. Require fresh included headroom for all those dimensions and their associated
reads/writes; stop before creation if unavailable. Duration overage is rounded in
large billing units and must not be assumed negligible. Reserve any coordinator
CPU/request costs within GBP8; the earlier GBP7.40 estimate does not automatically
cover a changed design. Recompute the conservative total before seeking execution.
Pricing reference checked18October:
[Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Stop on queue/latency failure, unknown billing, authority/fence/integrity failure or
the existing admission thresholds. Retain sanitised receipts, verify complete
synthetic Drive inventory before deleting its root, then delete only the recorded
disposable site/Worker/D1/namespace and verify absence. Preserve approved backup
parents and all existing application/operational resources. No automatic top-up,
public game, DNS, real charge or live payment is authorised by this proposal.
