# Isolated capacity benchmark — approved conditionally, not executed

15 October 2026. Supersedes the older Phase B/C caps in the capacity proposal.
Requirement remains 5,000 completions/day, 500/hour and a 48-hour outage allowance,
within £50/month excluding separately funded Drive and Namecheap Private Email.
The owner approved these capped phases and conditional Workers Standard Paid purchase,
subject to£8 incremental/£50 total, fresh headroom and no top-ups. No purchase or
execution had occurred at approval. On18October the owner confirmed checkout terms;
one activation succeeded, verified by Paid/Current plan on Workers plans. No hosted
benchmark execution yet. See the latest [handover](current-handoff.md) for evidence.

## Preconditions and resources

First verify current whole-account plan/usage read-only, available Netlify credits,
Workers/D1 headroom and actual checkout tax/GBP total. Reuse passed payment/recovery
evidence. Inventory names before creation; do not overwrite unexpected resources.

Create only `wybp-capacity-private-r002` (private Netlify on existing team),
`wybp-capacity-worker-r002` (signed ingress) and `wybp-capacity-d1-r002` (synthetic D1,
bound only to that Worker). The Worker also hosts a private operator service binding;
no additional production operator resource. Apply unchanged 0000–0013, synthetic
150-question catalogue, no real owner/wallet data, no Stripe calls or payment features.
Create one private benchmark folder and 16 child partitions within the approved
Drive destination. Record all IDs privately; no sharing change or customer access.
Reuse the approved Drive OAuth client through secure runtime installation and use
a separate synthetic encryption key; no Stripe credentials or existing-wallet
recovery credentials belong in this benchmark. All secrets stay absent from builds.
Prepare and locally validate the isolated harness before running: the existing
commissioning/rehearsal RPC deliberately rejects partitioned custody. Do not enable
its legacy flag as a workaround. Use the tested partitioned adapter and pinned
inventory protocol in the isolated harness, with restore access held until verified.
Use explicit isolated bindings in that harness; do not spoof a production database
name or weaken existing production configuration/target guards.

Optional local code setting `WYBP_DRIVE_SHARD_FOLDER_IDS` is an ordered JSON array
of exactly 16 distinct private folder IDs, excluding the legacy root. It is configuration,
not a secret. No folders are created by the adapter. Do not install it in existing
test/production Workers under this approval. Recovery receipts pin actual folders.

## Bounded execution

| Phase | Duration and work | Hard resource caps, including setup/retries/cleanup |
|---|---|---|
| A: corrected baseline | 30 min; at most 22 more completed games, so 25 cumulative including the original three; 1 external request/sec | 1,000 external/provider HTTP, 10,000 billed writes, 100,000 reads, 10MB D1 growth, 100MB transfer, 100 Drive objects/10MB. New counters/window need approval; no reset of old receipts. |
| B: peak hour | 60 min; exactly 500 successful completions sought, at most 215 incomplete starts, 100 refresh recoveries, representative results/sharing and signed synthetic financial/hold/closure fixtures | 80,000 external/client/provider HTTP plus 600,000 separately counted internal RPC invocations; 2m billed writes, 10m reads, 100MB D1, 1GB external transfer, 6,000 Drive objects/100MB. At most 40 external HTTP/sec for one 60-sec interval, otherwise 10/sec. Internal RPC has an independent 500/sec cap. |
| C: outage/retention | 60 min measured drain; at most 150,000 aged answer rows plus at most 10,000 dependent/held/financial fixture rows; at most 2,000 purge passes of 100 rows and 2,000 journal flushes of 25 events | 3m writes, 60m reads, 250MB D1, 750MB transfer, 100,000 external/provider HTTP, 500,000 internal counted operations, 6,000 Drive objects/250MB. Include fixture writes and journal/index costs. No 48-hour real service outage is induced. |

Stop admissions before 80% of any metered resource cap; completion targets are goals,
not permission to exceed caps. Reserve the remaining 20% for readback and cleanup.
Stop immediately on unexpected data, unknown billing, integrity/chain/index mismatch,
privacy or ingress failure, unresolved recovery fence, increasing undrainable backlog,
repeated unexplained errors, insufficient shared headroom or cost forecast above budget.
Do not keep rerunning failed phases. Capture sanitised evidence, diagnose locally,
and request a revised scope if the cap prevents the intended sample.

Implementation clarification: B/C each have one measured60-minute workload window
after protected setup. Setup/retries remain charged to the same immutable resource
and shared-credit counters. A one-way preparation transition cannot restart an
active/stopped window or the expired A baseline. Fresh headroom is required before
measurement. C also reserves all retained B Drive objects/bytes before new work;
phase changes do not reset physical storage. No production schedule is installed.

Local limits remain material: a snapshot invocation has 1,000 data pages at default
50 rows/page; a full boundary has at most 10,000 outbox events; inventory defaults to
100 pages/10,000 objects. These fail closed rather than truncate. Do not increase them
to hide a failure. Full launch-size snapshot/inventory work needs a separately
validated resumable plan if projected stock exceeds those bounds. A successful small
benchmark cannot waive that technical gate.

## Cost approval requested

Workers **Standard Paid $5/month minimum**, account-wide, with D1 Paid allowances,
is necessary before tests above Free quotas. Proposed **maximum £8 incremental total**
for this benchmark and its first paid month, including tax/FX and any measured overage.
Before purchase verify actual GBP total and sufficient remaining monthly allowance;
stop if £8 or the £50 whole-account ceiling cannot be met. No Netlify plan change,
duplicate subscription, automatic recharge, top-up, R2 or paid monitor is included.

Use at most 60 existing publication credits (four publications) plus 60 traffic credits;
if measured traffic/compute would exceed that, stop. Existing projects keep their reserve.
Use a 100ms per-invocation CPU ceiling for the entire isolated Worker, including
its operator RPC, with fixed request/RPC/row counters. These and admission cutoffs
bound the experiment; they are **not a provider-enforced £50 monetary cap**.
If complete cost cannot be bounded before a phase, do not start that phase.
Preflight must leave at least5.1m included D1 writes,71m reads and250MB included
storage for the entire test/cleanup. Maximum1,281,000 metered invocations at100ms
represent at most128.1m CPU-ms; budget even if the included CPU is already consumed.
At the published $0.02/million CPU-ms this adds about$2.57 before tax/FX, plus the$5
minimum and bounded ingress request overage. Verify actual billing model and GBP
charges before purchase; do not assume internal RPC is free of CPU or D1 costs.
Paid subscription renewal/cancellation must be reviewed before the next cycle;
cleanup does not automatically cancel an account-wide paid subscription.

## What would constitute useful evidence

Measure completed success rate, p50/p95/p99 latency, private writer contention,
fence/read amplification, billed rows, CPU, total transmitted assets, journal backlog,
encrypted delivery/readback time, snapshot duration/stock and cleanup progress.
Separate warm/cold clients, retries, incomplete games, rejects and internal RPC.
Require zero accounting/ownership/hold/suppression violations and no duplicate effects.
Record actual maxima and stop-limited failures rather than selecting favourable samples.

500 completions in one hour substantiates the required peak sample. It does not prove
24-hour reliability. Apply observed per-game and fixed operational costs to 5,000/day
and all existing projects, with incomplete/retry/abuse assumptions from the full model.
With 70% completion and four answers/incomplete game, arrivals are about 68,571 answer
rows/day; a 48h scheduling outage leaves about 137,143. Clearing it within the remaining
five days requires at least 96,000 successful answer deletions/day including arrivals;
at 50% successful operating availability, install capacity must exceed 192,000/day,
PLUS other retention families, protected rows, journal delivery and cleanup.
Use measured effective deletions, not passes multiplied by LIMIT, to assess that bound.
Within Phase C's existing10,000 extra fixture-row allowance, introduce at most3,000
unexpired answer rows over the measured hour to represent ongoing arrivals; count
all fixture writes/requests. They must remain available while eligible old rows drain.
Candidate three 100-row passes/minute is a hypothesis, not an activated schedule.
Measure journal drain separately: 25-event flushes must exceed actual arrivals/backlog.
Restore a populated synthetic snapshot and prove suppression/holds/accounting before
opening its private access. No test result activates production schedules.

## Whole-account estimate and decision threshold

The prior full model is 8.61m external requests/month, 112.5–675GB transferred at
0.75–4.5MB/completion, before additional viral traffic. Netlify consumes about
4,281–15,531 credits including four publications, a provisional 50-credit other-project
reserve and 200-credit safety reserve; compute can add more. All four existing projects
share the account. Those reserves are assumptions, not verified future usage.

Using the documented planning USD1=£0.80 plus 20% tax/FX allowance:
Netlify Pro 5k $33 + Workers $5 is £36.48, then £5–10 operating/storage allowance:
**£42–47 optimistic**, only if low bytes, other-project usage, retained D1/backup stock
and production amplification are measured. Pro20k $126 + Workers $5 + £10–20 allowance
is **£136–146**. Historical source sensitivity up to £203 included unoptimised D1
metadata amplification; it is not a verified post-change quote. A higher budget does
not fix recovery bounds. £50 feasibility and the minimum viable launch budget remain
unproven. Do not purchase a launch tier now.

Drive is separately funded (£0 charged to this ceiling, not zero physical usage).
Owner confirmed Namecheap Private Email is separately funded; free Healthchecks
adds no subscription. Include CPU,
retention, snapshots, independent downloads and other-project headroom in final billing.
Workers Standard service-binding calls add CPU/D1 work but not another request fee;
do not bill each fence RPC as a separate inbound request. No Workers Cache change assumed.

## Cleanup and rollback

Keep the current private game, its D1, wallets, catalogue, deployments and OFF flags
untouched. Stop generators first. Preserve encrypted private evidence and sanitised
checksums/receipts outside Git, reconcile resource IDs/data, then delete only the named
benchmark projects/Worker/D1 and exact benchmark-owned Drive objects/folders. Verify
absence. Never recursively delete the approved recovery root or legacy archives.
If an isolated release fails, disable its ingress and remove its bindings; keep its
D1 only long enough to reconcile evidence, then approved cleanup. No restore into an
existing application DB. Report cleanup or refund/cancellation limitations honestly.

Approval requested: the exact isolated resources, capped phases and conditional
Workers Paid purchase up to £8, within £50 all-in. This is not public-launch,
production-configuration, operating-schedule or live-payment approval.

Prices checked 15 October:
[Netlify tiers](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/),
[Workers/D1 and service-binding billing](https://developers.cloudflare.com/workers/platform/pricing/).

18 October owner-approved bounded revision: only C storage/transfer/request caps and shared traffic allowance above changed. The measured 36,000-answer fixture produced 84,996,768 encrypted bytes across 1,323 objects locally, before snapshot/inventory and retained B data. The same 60-minute window, resources, D1/object limits, 80% admission reserve, GBP8 incremental and GBP50 operating ceilings remain. Conservative tax/FX forecast about GBP7.40 is an estimate, not a provider hard cap. This is not approval or evidence of full 30-day recovery.
