# Benchmark continuation — 15 October 2026

Latest continuation: see [one consolidated launch decision](launch-decision-report.md).
The checkout error below is superseded: final quote now loads, USD5/month due today
plus usage, independently observed and owner supplied. No tax line or settled GBP
total supplied; no purchase. Fresh Netlify507.8 credits and auto recharge Disabled.
The real-service game core and seller-details installation path are now implemented
locally, not deployed. Complete metered hosted harness and full-stock recovery remain
unfinished. The 66 affected authority/accounting regressions and331 data tests pass;
full lint/typecheck pass. See handover for final integration-gate outcome.

Based on bbb8352. No purchase, hosted creation, deployment, data mutation or load
occurred. The normal private game and its OFF commerce/webhook/cron flags were
not changed. No disposable resource was created, so no hosted cleanup is due.

## Observed access and billing

Existing Wrangler OAuth works with the previously approved account/read,
Workers/write and D1/write scopes. No new scope requested. Read-only D1 inventory
returned two databases and no `wybp-capacity-d1-r002`. The subscriptions endpoint
returned HTTP403; this is an endpoint permission failure, not failed authentication.
Existing Netlify CLI credentials successfully read the intended Personal team.

Browser approval review now succeeds: the previous review usage-limit blocker is
no longer current. Signed-in dashboard sessions were available. Netlify showed
507.8/1,000 credits remaining, $9 Personal, 492.2 consumed (480 deploys,4.4 requests,
7.8 bandwidth), no enabled team add-ons. Recharge status was not established.
Cloudflare showed Free current and Paid $5/month plus usage. Opening its upgrade
checkout produced “Refresh the page to try again”; no final tax/GBP quote or purchase.
Do not substitute the public USD price for a verified all-in quote or broaden API
permissions to bypass this. Account usage/credits must be refreshed before execution.

Owner fallback if the dashboard remains broken: in the usual signed-in browser,
open the account's Workers plans → Upgrade, stop at the final quote, and provide
only the charge/currency/tax lines with all personal/payment details cropped out.
Do not confirm purchase while total incremental cost, recharge status and headroom
remain unverified. Existing approval is sufficient if every condition is met.

## Local implementation and limits

`approved-benchmark-driver.mjs` orchestrates scheduled baseline/peak games and
bounded outage commands through an injected private harness adapter. It uses the
durable budget, exact resource guards, pacing, hashes, duplicate-action coalescing,
unknown-response stops and authoritative completion/recovery assertions. It counts
neither incomplete games nor merely accepted answer responses as completions.
PhaseC descriptors cap aged/dependent fixtures,3,000 arrivals,2,000 purge passes and
2,000 journal flushes. These are requested operations, not measured drain capacity.

**The deployable real-service harness adapter is NOT finished.** It must implement
bounded fixture pagination, actual application/authority services, partitioned Drive
custody and pinned inventory, per-fetch/RPC billing, fence/chain readback, reconstruction
after interruption, sanitised metrics and scoped cleanup. Adapter assertions cannot
stand in for observed results. The existing production/test identity guards must not
be spoofed. The driver itself cannot resume private attempt state from public receipts:
it stops for authoritative readback rather than replaying uncertain mutations.
No500-game-hour, fence/journal latency, outage drain or full-stock recovery measurement
is claimed. The server completion path needs particular care: normal random results
with commerce OFF are client-side; do not count them as persisted completions.

24 focused driver/budget/baseline tests pass with SQLite and synthetic adapters,
including completion, exact recovery, mismatch rejection, incomplete games,
duplicates, uncertain outcomes, target guards and PhaseC command limits.
Affected lint/diff checks pass. Logs remain ignored under
`outputs/authority-preparation/benchmark-driver-tests.log`. Prior full application
validation is reused because application/Worker source is unchanged.

## Concrete owner choices (recommended defaults)

1. Paid territories: UK consumers only initially, or name additional countries.
2. Refund terms: retain statutory rights, original-method refunds and review of
   used/partial/disputed purchases; obtain appropriate review of Cowrie cancellation
   classification before live sales. No blanket digital-content waiver for credits.
3. Support: team@classesforculture.com, acknowledgement within two working days,
   escalated to Ayodele Ayeni; choose another achievable target if necessary.
4. Durable confirmation: saveable order-specific confirmation plus transactional
   email, including the terms and actual consent. Recommended, but sender/customer
   email handling and delivery/retry implementation still require validation.

Owner business approval is not professional legal sign-off. The full draft is in
`owner-purchase-review.md`; statutory/privacy choices remain separate.

## Secure seller-address process

Save geographical seller address, complaints address if different, and applicable
telephone contact in the password manager entry “Classes for Culture — public seller
details”. Do not paste them into chat or commit them. Stripe setup is already complete;
no Stripe re-entry is requested. A runtime-only website installation route still needs
implementation: current `app/legalConfig.ts` has null placeholders, and no working
address Secret/form is verified. Do not invent variable names or put the address in
build variables. Once the validated route exists, enter directly in the provider's
protected UI and inspect private legal pages before separate launch approval.
