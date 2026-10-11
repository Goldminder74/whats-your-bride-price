# Production preparation continuation — 11 October 2026

## Current local boundary

`worker/authorityService.mjs` supplies a private, dependency-injected authority
service and bounded delivery tick. It deliberately exposes no HTTP or cron handler.
`authority-runtime.mjs` no longer imports SQLite or filesystem code. The existing
operator imports/re-exports the same implementation, preserving recovery semantics.
D1 batch and query response failures, interrupted delivery, replay, sanitised alerts,
readback and monitor failure are covered by synthetic checks.

This is NOT complete production wiring. Application financial/closure/deletion
writers still need a single authority path, cross-instance concurrency validation,
independent storage credentials/adapter and live heartbeat monitoring. A local busy
flag is not distributed mutual exclusion. D1 fencing remains authoritative; an
unresolved intent prevents a verified recovery boundary. No cross-provider atomicity
is claimed. Do not deploy or activate this service as production-ready.

## One consolidated monthly estimate

Owner confirms no other hosting or backup subscriptions. Recorded Netlify Personal
is USD9/month; proposed Workers Paid is USD5/month plus usage. At an illustrative
USD1 = GBP0.80 and a conservative 20% tax allowance, base estimate is GBP13.44/month.
This is an exchange-rate assumption, not a quote. Other subscriptions: GBP0.
Private Drive backup storage: GBP0 only while existing free capacity suffices.
Alerts: GBP0 proposed existing/free channel; delivery method remains unconfigured.
Cloudflare/D1 usage: provisionally GBP0–5 above base within paid allowances; journal
write amplification, Images and exported bytes must be measured. Netlify extra usage:
GBP0 only with recharge disabled and usage within included credits. Therefore a
provisional planning envelope is GBP14–25/month, NOT verified capacity at 5000 games/day.
Do not buy anything based on this estimate.

Netlify 1000-credit allowance is shared with existing sites; exhaustion can pause
all projects. Example assumptions: 150000 games/month, 40GB transfer (800 credits),
2 million web requests (400 credits), four production uploads (60 credits) total
1260 credits BEFORE existing-site usage: not sustainable on the included allowance.
The measured entry JavaScript alone is not whole-game bandwidth.
Workers Paid usage is metered, not a GBP50 hard cap. CPU limits and billing alerts
are not enforceable account spending caps. No provider upgrade is authorised until
actual charges/tax and workload headroom are reviewed against GBP50. Recharge stays off.

Official pricing:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/

## Smallest proposed hosted benchmark — NOT executed or scheduled

Reuse/create only the previously approved, unbound synthetic rehearsal database
`wybp-restore-rehearsal-r001`, after inventory and free-allowance headroom checks.
Apply unchanged0000–0013 with checksums; no application/service binding. Load 1000
synthetic games/12000 answers and representative synthetic holds/closed wallets and
protected financial dependencies. Preflight actual indexed rows-written estimate;
stop before the remaining account daily free allowance or any new charge.
Run 60 bounded passes at limit100, recording actual rows read/written, wall/CPU time,
removals and protected-row counts. Inject upload outage and interrupted delivery;
verify repeat/resume, independent readback and fail-closed recovery. No source data.
Download/check the encrypted archive in approved private Drive. Delete the unbound
rehearsal DB after receipts; expire archive under approved30-day backup rule.
No alteration of existing test DB, wallets, catalogue or live subscriptions.

This small sample measures per-pass cost, not a proven full48-hour backlog drain.
Extrapolate with measured worst-case throughput plus contention/outage allowance;
approve neither100/min nor any cron until verified capacity, financial dependency
mix and independent delivery throughput satisfy the seven-day deadline. A larger
paid-volume benchmark requires separate exact-cost approval.

## Stripe verification blocker

Automatic approval review rejected a read-only Stripe dashboard selection, citing
an earlier stop-before-Stripe instruction despite current sandbox authorisation.
No workaround attempted. Actual converted purchase/refund/dispute is still pending;
local original-GBP validation tests are not live provider evidence. Existing strict
amount/currency/signature/accounting checks remain unchanged. Commerce/webhook stay off.

## Delivery adapter and secure setup dependency

`DriveCustody` uses pre-generated Drive IDs, a durable atomic ID reservation,
immutable-content checks, complete paginated inventory and download/SHA readback.
A lost upload response resumes with the same ID; corrupt/duplicate/missing inventory
fails closed. Each encrypted chunk is capped at4MiB; larger archives must use existing
paged chunks, never silently truncate. Google documents retry safety for pre-generated
IDs: https://developers.google.com/workspace/drive/api/guides/manage-uploads#use_a_pre-generated_id_to_upload_files

The durable ID reservation adapter is an explicit production dependency, not an
in-memory production implementation. Do not deploy until its persistence/recovery is
verified. OAuth credential refresh, private folder identity and the alert delivery
channel are also outstanding. No new schema or resource was introduced. Scope a durable
reservation design before any schema addition; existing0013 must not be repurposed with
misleading checkpoint hashes. Secure tokens/keys must be installed outside build and
chat. Synthetic tests verify lost upload acknowledgement/process replacement, tampered
readback, incomplete listing, bounds and exact private configuration requirements.

Validation:33 distinct focused tests passed (24 existing recovery/archive tests plus
9 runtime/custody tests); scoped ESLint and diff checks passed. Two in-memory bundles
resolve without local SQLite/operator imports. This is local packaging evidence only,
not deployed Cloudflare compatibility. No full application suite repeated: no existing
application entry point imports the new inactive service. Existing operator behaviour
was exercised by its complete affected recovery tests.
