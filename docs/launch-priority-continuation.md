# Launch priority continuation — 15 October 2026

Owner now allows assessing GBP150/month as a **planning envelope only**. Actual
spending authority remains the conditional USD5 Workers plan and GBP8 capped
benchmark/first-month, within the existing GBP50 ceiling. Drive and email remain
separately funded; Stripe processing/dispute fees must be reported separately.
No purchase, resource creation, benchmark execution, deployment or activation occurred.

## Validated local progress

- Benchmark budget now enforces35 traffic credits globally across phases, including
  compute, before effects. Reservations survive replacement; unknown/overrun outcomes
  stay charged. Normal admissions stop below80%, leaving cleanup reserve. External
  HTTP/bytes conservatively count as Netlify traffic, including provider calls.
  The adapter must report allocated GB-milliseconds explicitly, not silently omit
  compute. No global currency cap is claimed. Existing control journals lacking the
  new compute field fail closed; do not reset an executed run to bypass this.
- Segmented snapshot capture writes at most25 pages of at most100 rows per step.
  Each encrypted immutable segment pins its predecessor, original journal fence,
  counts, cursor and original expiry. Restart retries the same segment without
  rewriting accepted pages or extending the recovery window. Counts are checked at
  table completion rather than rescanning the whole table for every page.
- Authenticated streaming reconstruction verifies the segment chain, exact page names,
  offsets and counts. Missing/corrupted pages, changed fences, wrong keys and expiry
  fail closed. Every yielded page remains blocked pending a separately verified
  boundary, accounting/FK and authority-suppression review. No receipt is fabricated.
- Synthetic51,003-row capture/stream test passes across42 steps, with interrupted
  upload and duplicate retry. This is not a full production-stock or hosted RTO test.
  No migration or existing runtime wiring changed. Existing v1 snapshot behaviour
  and safety limits are preserved.

Focused driver/budget/game/segment tests24 pass; affected production-preparation
gate54 passes; affected lint/diff pass. Ignored evidence:
outputs/authority-preparation/launch-priority-{focused,preparation}.log and
segmented-snapshot-tests.log. Prior complete application gate at19d6784 is reused
for unchanged application/deployment source.

## Remaining implementation and scope limits

The deployable metered adapter still needs provider billing/transport, asset/sharing
verification, realistic dependency fixtures and safe cleanup. Segmented capture is
not yet wired to final authority boundary, full-stock import, independent pinned
inventory/lost-index reconstruction or commissioned production bindings. Current
full delivery still collects bounded events/inventory. None of these are a missing
owner approval; complete them locally before spending or starting hosted phases.

PhaseC's150,000 answer/10,000 dependent-row limits are ceilings, not permission to
invent unrepresentative parent relationships.150,000 answers alone need at least
12,500 attempts when each has12 answers, before results/holds/financial fixtures
and3,000 arrivals. A genuine full48-hour fixture therefore cannot be asserted from
the current descriptor's7,000 dependent rows. Use a representative smaller fixture
within caps and qualify its evidence, or request a single revised data-limit scope
after counting all required parents/results. Do not run the impossible descriptor.

The old137,143-answer backlog model included abandoned answer checks. Actual
completion persists answers as a batch; abandoned judging does not establish stored
answer rows. At5,000 completions/day,48 hours gives120,000 completed answer rows,
plus incomplete attempts and other dependent records. Reconcile the complete stock
from actual schema/retention before fixing benchmark sizing or purge acceptance.

## Fresh read-only provider evidence and costs

Existing CLI/API: D1 inventory200, two existing databases, no r002; Netlify intended
Personal team200; subscriptions endpoint403. No new permission requested. API does
not expose verified recharge state; previous signed-in observation showed Disabled.
Refresh billing usage and checkout before any actual purchase/execution.

Authoritative pricing checked15October:
- Workers minimumUSD5/month;30m CPU-ms and10m requests included, thenUSD0.02/million
  CPU-ms andUSD0.30/million requests. D1 first50m writes/25bn reads/month included;
  additional writesUSD1/million, storage beyond5GB USD0.75/GB-month.
- Netlify PersonalUSD9/1,000 credits; Pro3,000 USD20,5,000 USD33,10,000 USD63,
  15,000 USD95,20,000 USD126. Pro replaces Personal, not another subscription.
  Recharge stays off. Exhaustion can stop projects; it is not availability protection.

Sources: https://developers.cloudflare.com/workers/platform/pricing/ and
https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ .

GBP scenarios use a stated **planning** USD-to-GBP0.80 plus20% tax allowance,
not a verified bank/card rate. Netlify5k+Workers givesGBP36.48 before variable
operations;10k+Workers65.28;15k+Workers96;20k+Workers125.76. Add measured D1/CPU,
other-project usage, backup/retention work and contingency before recommending
a tier. GBP150 may accommodate the upper tier, but fit and capacity remain unproved.
The approved worst-case benchmark usage is aboutUSD1.68 plusUSD5 base:GBP6.41
under this assumption. Actual tax/FX and shared headroom remain purchase conditions.

**No additional spending request yet:** no measured result justifies a Netlify tier
or establishes the lowest practical recurring budget. Do not purchase a speculative
GBP150 plan. Once measured, present ONE request identifying replacement tier,
immediate/prorated charge, tax/FX-inclusive recurring ceiling, necessary blocker
removed, recharge status, admission controls and uncapped provider overage exposure.

## Consolidated owner decisions

Choose paid territories (recommend UK initially); approve/revise purchase/refund
terms with appropriate Cowrie classification review; confirm an achievable support
target and age/audience policy; choose the durable confirmation route; install real
seller-address/contact details securely in the protected application runtime when
ready; record single-person recovery-risk mitigation. Full drafts and secure
installation instructions remain in owner-purchase-review.md and
launch-decision-report.md. Professional legal clearance is separate from product
approval. No repeat Google setup, keys or payment/banking details are requested.

Final public release, DNS/domain diff, production schedules and live-payment
activation remain a later concrete approval after technical and business gates pass.
