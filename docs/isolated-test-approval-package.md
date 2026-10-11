# Isolated test activation approval package

Updated 9 October 2026. Owner-approved isolated catalogue/replay and subsequent sandbox payment checks are completed as recorded in the current handover. Earlier dated checkpoints below are historical. Commerce/webhook are disabled again; hosted retention, production provisioning, live payments and public cutover are not authorised. Resolve final source using `git rev-parse HEAD`.

## Fixed scope and target

Reuse Netlify `wybp-protected-test` (project `edee23f4-b86f-4975-8859-9c4be03ebbc0`) and Worker `wybp-test-r001`, Cloudflare account `b6b22a9a87b5758725e5c499782160af`. Private origin `https://wybp-protected-test.netlify.app`; Worker `https://wybp-test-r001.ayo-m-ayeni.workers.dev`. Create only D1 `wybp-test-d1-r001` after duplicate inventory. Its verified UUID is `1a268b28-e6d5-4431-8f84-a886df9369f1`; migrations/catalogue are complete. The binding was removed by the verified application rollback; rebind only this Worker during the corrected retry. Keep R2 unbound, owner-only Netlify primary/preview access, ASSETS authentication and signed Worker ingress. Existing sites, Wigsmi/Sherwood, DNS, other Workers/databases/branches/stash remain excluded.

## Approved scope and remaining stop gates

1. **Resources/budget:** owner approved only isolated D1 creation and its test binding within existing allowances. Free Workers plan and empty inventory were verified; actual isolated UUID attested before writes. No plan upgrade/new charge was incurred or approved. The active Worker is currently unbound after rollback; database preserved.
2. **Migrations:** all unchanged migrations `0000` through `0012` completed with committed checksums and exact schema/ledger verification; no `0013`. Wrangler migration query parsing failed at 0009 and was proven completely rolled back before unchanged file-import resumption. Runtime schema SHA-256 `5d45ee35ee5e5cce814d5d4659418324f1bb4fde9657a5f893dbc6640122c9c4`; do not repeat completed migrations. Detailed receipts and supported resumption are in the [runbook](netlify-cloudflare-hosting.md#owner-approved-cataloguereplay-activation--8-october-2026).
3. **Catalogue:** exact immutable v2 SHA-256 `4b6883d08e9efceb336ab333bab0e67e0219d107693ec85b99757170dff8c22d` is owner-approved under machine-evidence policy. Canonical five editions/60 unchanged questions (seed checksum `91ed04fcc134fa53d14a8694eedb04ca7fafb0cbf45c11b07b0d2eff17f8da6a`) and exactly 90 approved ID/version/hash publications completed. Actual application repository validates 30 eligible/region. Do not rerun canonical seed over this populated catalogue. All 352 research drafts remain unpublished; only the two explicitly approved reserve substitutions were imported, with remaining reserves unpublished. Original identities/provenance remain preserved. No human cultural approval is claimed. See [source reconciliation](launch-source-capture-reconciliation.md).
4. **Preservation:** original Drive archives were reused; second-pass supplement readback now verifies all 12 payloads. New owner-only complete v2 evidence archive and receipt independently download/checksum successfully; all 388 payloads pass, all 136 selected bodies present, downloaded source reproduces all 12 outputs. Separate synthetic restore archive/readback also passes authority replay. See [backup receipts](launch-evidence-backup.md). OneDrive is deferred by owner; historical capture custody remains unverified. Synthetic proof does not certify live operational custody.
5. **Data profile deployment:** build secret-free matched client/Worker with actual DB UUID and existing `data` profile only. Verify release receipts and D1 identity; owner-only mobile/desktop replay, 30 eligible per region, ownership, allocation/concurrency, limiter fail-closed and retention checks. Do not enable payment profile early. Use existing [runbook profiles/configuration](netlify-cloudflare-hosting.md).
6. **Retention:** six policies/final closure are owner-approved, not professional legal sign-off. Local restore, holds, dependency preservation, repeat execution, starvation fix and actual Miniflare D1 purge pass; [measured limits](retention-operations.md#measured-local-restoration-and-capacity--8-october-2026) apply. Arrange restricted accounting/support custody, annual necessity review and independent rolling operational authority exports; perform a separately authorised provider restore before scheduling jobs. Export/restore caps are 100 records/category and 64 KiB; initial owner trial must stay within them. Data/payment profiles require matching external `WYBP_RESTORE_RECEIPT_SHA256` and D1 receipt even with cron off. Separately approve test cron `*/15 * * * *` UTC and `WYBP_TEST_RETENTION_ENABLED=true` only after hosted capacity/custody verification; default 50 answer rows/pass supports at most 33,600/week before arrivals/outages. Monitor every eligible backlog/deadline; no identifiable deletion logs. No cron approval is implied here.
7. **Stripe test activation:** future approval for NEW Ayodele Ayeni sole-trader account/sandbox only, four fixed GBP links and exact test snapshot events/API version. Secure direct signing-secret installation, `WYBP_TEST_WEBHOOK_ENABLED=true`, test expected livemode false, existing `payments` profile matched release. Exact POST `/commerce/stripe-test-webhook` is the only owner-login exception; raw-body signature, replay/payment/allocation validation and live-event rejection remain mandatory. Keep all other direct Worker paths/assets protected. Resolve Adaptive Pricing compatibility before accepting payments.
8. **Live checks/rollback:** actual sandbox all-four fulfilment, concurrent duplicates, refunds/disputes, cross-owner denial, mobile returns/downloads and navigation, anonymous/private URL denial, signing, assets and release-match. Restore previous matched all-off private release and disable only test webhook/cron on failure; preserve D1/audit history, do not reverse migrations or erase payment data. This package excludes public launch/live payments.

The resource/catalogue scope is approved and completed; hosted retention scheduling and test account/settings still require separate approval. The six retention policy rules were owner-approved on 5 October 2026; implementation and hosted activation remain separate gates. The isolated authorised database/catalogue operations completed; random application activation was rolled back after the live recovery failure below. Public launch later requires random replay, Cowrie access/purchases and Royal Reveal together, approved seller/legal/privacy and verified live payment/runtime flows. Analytics, owner dashboard, daily/streaks and unrelated optional features stay disabled.

## Execution checkpoint — 8 October 2026

OAuth d1:write was approved and added; Free plan/headroom verified. Actual isolated
UUID is `1a268b28-e6d5-4431-8f84-a886df9369f1`. All unchanged migrations 0000–0012,
canonical 5/60 and approved 90 publications completed, with 30 eligible/region.
Exact schema fingerprint and ignored operational receipt paths are in the runbook.
Initial actual empty financial/authority restore review installed; this does not
certify provider restoration or independent operational custody.

Matched random-only release temporarily deployed and verified (109 client files,
140 server modules, signed ingress, anonymous primary/preview denial). All five
complete desktop games/results passed. Mobile West reached question seven, but
refresh lost recovery because existing recovery depends on disabled fast_entry.
No additional feature was enabled to bypass this blocker. The previous verified
private all-off pair was restored; active D1/R2 bindings removed and data preserved.
The private link currently serves the previous classic application, not the new
random milestone. Remaining all-five mobile/recovery verification is outstanding.

Next required correction: make random recovery independent of fast_entry with
compiled refresh/ownership regression, then repeat the matched deployment/live
mobile gate. Do not recreate D1, reseed the imported catalogue, or repeat completed
migration/publication operations. Follow [execution and rollback receipts](netlify-cloudflare-hosting.md#owner-approved-cataloguereplay-activation--8-october-2026).
Cron/Cowrie/commerce/Stripe remain disabled; provider restore/custody and hosted
purge-capacity limits remain unresolved. No human cultural or professional legal
approval is claimed.

## Verified recovery retry — 8 October 2026

The recovery blocker above is resolved and the matched random-only release is now
active privately. See the [recovery execution receipt](netlify-cloudflare-hosting.md#recovery-correction-and-successful-private-retry--8-october-2026).
All five mobile-viewport games and desktop recovery completed, with refresh after
seven answers and unchanged question/option order. Exact snapshot/previous-answer
and no-new-attempt/charge regression passed on Chromium/WebKit; live D1 counts were
unchanged across desktop refresh. Owner-only primary/preview and signed ingress
were reverified. No migrations, seeding or publication were repeated. Cowries,
commerce, cron, fast_entry and webhook remain disabled. Stop before Stripe activation;
provider restore/custody and purge-capacity limits remain outstanding.

## Production activation checklist — 9 October 2026

This is a plan, not activation authority. Sandbox payment evidence is reusable;
repeat it only if the relevant code/configuration changes. Public launch must deliver
random replay, Cowrie play access/purchases and Royal Reveal together. No step below
has been executed by preparing this checklist. Keep the private test resources/data
separate. Owner-approved retention is not professional legal sign-off.

| Gate / exact action and acceptance evidence | Who acts | Approval needed |
|---|---|---|
| **Complete exports:** implement checkpointed, paginated database/authority export and restore beyond the current 100/category and 64 KiB caps. Include every protected financial dependency, holds, closure clocks and restore suppression; test interruption/resume, duplicate pages, completeness/checksums and repeat restore without resurrecting access. Keep approved retention periods. | Codex implements/tests; owner reviews | Local implementation authorised and verified; provider integration and hosted rehearsal remain separately approved gates. |
| **Independent custody:** appoint an accounting/support custodian; choose a restricted encrypted operational database/authority backup destination, access list, key custody, approved rolling window and readback procedure. Verify independently downloaded checksums and current authority journal. Existing verified research Drive archives are not payment backups. | Owner selects custodian/destination; operator implements and verifies | Explicit destination/access and backup-operation approval; any charge separately approved. |
| **Hosted restore rehearsal:** choose a separately isolated rehearsal D1 within verified allowances, or explicitly approve maintenance-window restoration of test D1. Export current state, keep all features/cron off, restore with independent latest authority, reconcile payments/ledger/holds/closures, replay suppression, prove expired/deleted/closed data inaccessible, install fresh reviewed restore receipt. Preserve a recovery copy and test DB. | Owner approves target; Codex/operator rehearses and records receipts | Exact resource/restore scope and allowance ceiling. Time Travel availability is verified, restoration is not; it cannot clone the database. |
| **Purge capacity/schedule:** supply peak games/day, backlog and tolerated outage. Benchmark the entire hosted scheduled path, including bonus expiry and unissued-play reversals, query/CPU/row usage, deadline age and outage catch-up; choose bounded schedule with headroom, alerts and an escalation owner. Local 12,000-answer/240-pass proof is not hosted throughput. 50 answers/15 minutes is only 4,800/day before arrivals/outages. | Owner supplies demand/operations owner; Codex/operator measures | Exact synthetic benchmark target/volume/allowance; approve measured schedule and cron activation separately. |
| **Seller/legal:** confirm Ayodele Ayeni trading as Classes for Culture, non-VAT registered, support team@classesforculture.com; supply geographic contact address/phone where required securely. Complete consumer delivery/cancellation/refund and durable receipt review, privacy/processor/transfer/ICO/children/accessibility checks; approve final notices and support/claims process. Remove draft status only after recorded approval. | Owner with appropriate legal/privacy/accounting advice | Final disclosure/policy approval; owner approval alone is not professional sign-off. See legal activation checklist. |
| **Stripe live readiness:** verify the Classes for Culture parent account's current payments/payouts/verification status directly in Stripe; enter identity/bank details there. Confirm GBP market/tax treatment and resolve Adaptive Pricing so currencies offered match server validation. Wigsmi/Sherwood are excluded. | Owner in Stripe; Codex may inspect under separate authority | Live account/configuration authority and any costs; no live setup implied by sandbox evidence. |
| **Production source/runtime:** implement reviewed production DB/runtime/restore-receipt, rate-limiter, retention and webhook wiring. Current private profiles, scheduled entry and exact test webhook are test-only; never accept live events on the test route. Owner confirmed https://classesforculture.com/ as the production launch target on 9 October. Sites defaults remain https://brideprice.classesforculture.com. No replacement, domain setting or DNS change is authorised by that decision. Preserve authenticated assets, raw-body signatures, replay/ownership/origin checks and fail-closed limits. | Owner chooses domain/topology; Codex implements/tests | Scoped production implementation approval after domain decision. No domain setting, source allowlist change or new resource yet. |
| **Isolated production provisioning:** inventory existing resources, approve exact new project/Worker/D1 names, account IDs and cost ceilings; configure private protection first, verified migrations 0000–0012 and only approved catalogue publications, 30 eligible/region. Never copy sandbox financial records or secret values. Establish independent operational backup/authority custody and restore receipt before opening traffic. | Owner approves; operator provisions/verifies | Explicit resource creation, hosted migrations/catalogue writes and cost approval. Existing test publications do not authorise production publication. |
| **Four LIVE links/webhook:** create/reuse live one-off GBP Royal Reveal £1.99 and 5/15/40 Cowrie £1.99/£4.99/£9.99 objects in the correct parent only. Set exact approved production /royal-reveal/return and /cowries/return URLs; let the application append opaque client_reference_id. Register only the five documented events on the separately implemented production POST webhook. Install live IDs, amounts, expected livemode and signing secrets securely at runtime; separate Netlify proxy secret from secret-free build/upload. Never reuse sandbox IDs or secrets. | Owner/operator, with Codex under explicit authority | Live Stripe configuration and secret-installation approval; no live charge yet. |
| **Private production release gate:** build matched client/Worker from approved commit, verify package/client checksums, production origin, secret absence, private/preview protection, signatures, live-event route isolation, catalogue, limiter and retention readiness. Review final copy and payment terms. Sandbox checks need repeating only for changed paths. Define explicitly authorised low-value live fulfilment/refund check, limits and operator before live traffic. | Codex/operator; owner signs off | Private production deployment approval; live transaction authority separately specified. |
| **Domain cutover and activation:** snapshot existing DNS/site deployment and verified rollback pair; prepare exact DNS/hosting diff without changing other sites. After all receipts pass, obtain approval for that diff and simultaneous replay/Cowrie/Royal Reveal activation, then verify HTTPS, navigation, image rounds, mobile returns, fulfilment and monitoring. Leave analytics, daily/streaks, owner tools and unrelated features off. | Owner authorises; operator executes | Final exact domain/DNS, public deployment and live-payment activation approval. |
| **Rollback:** stop new checkout/payment feature exposure, preserve signed settlement handling for payments already accepted, disable affected public entry points, restore previous matched code/config and approved prior DNS/site state. Preserve D1/ledger/holds/closures and reconcile in-flight payments; never roll back financial data or erase orders. Restore suppression must precede access after any database recovery. Keep an on-call owner and decision thresholds. | Operator; owner controls domain rollback | Include exact rollback operations in cutover approval; financial-data restore still needs explicit incident authority. |

**Local preparation completed:** complete paginated offline exports, encrypted atomic
SQLite authority journaling, resumable restore and independent journal readback are
implemented; see [local recovery contract](retention-operations.md#local-complete-operational-recovery--9-october-2026).
There is no new application migration. This does not establish hosted D1/external
journal atomicity, independent payment-backup custody or hosted restore performance.

**Local focus repair:** changing parent close callbacks previously restarted Share
Centre's focus effect. The latest handler now updates independently; focus setup and
return belong to the dialog lifetime. Existing assertions remain, with added keyboard,
touch, nested Escape and close-button focus checks on desktop and mobile profiles.
See the handover for final integration results.

## Proposed isolated hosted rehearsal approval

Owner approved this scope on 10 October, subject to the blocked preflight below.
No hosted operation has run under this scope. Production target is
https://classesforculture.com/; the rehearsal must not serve application traffic.

1. **Inventory and budget:** inspect only Cloudflare account
   `b6b22a9a87b5758725e5c499782160af` for `wybp-restore-rehearsal-r001` and remaining free allowances. Reuse only if empty
   or proven to contain this rehearsal's synthetic data; stop on unexpected data.
   Approve creation of that one D1 if absent, never bind it to any Worker, deploy,
   create routes, connect Stripe or change `wybp-test-d1-r001`. No new charge or upgrade.
2. **Fixtures and migrations:** verify committed checksums, apply unchanged migrations
   0000�0012 only to the rehearsal D1. Use deterministic synthetic fixtures, never
   copy real owners, payments or current test balances: at most 120 completed quizzes
   (1,440 answers), 20 wallets/orders with allocated ledger entries, five holds and
   five closed/deletion cases; cap total fixture rows at 10,000. Record exact counts
   and synthetic fixture hashes. Stop before writing if remaining account allowances
   cannot cover the planned operation; measured budget is a pre-write gate.
3. **Export/restore:** prove consistent provider snapshot/cut-off, every table/count,
   pagination, schema/migration hashes, interrupted-page resume and independent latest
   authority readback. Before claiming D1/external journal atomicity, implement and
   validate provider delivery/crash-gap handling under separately scoped code authority.
   Existing local SQLite sidecar cannot supply that guarantee. Rehearse recovery in
   the isolated synthetic database only; require financial/holds/closure reconciliation,
   suppression before access, repeat-safe replay and a fresh reviewed restore receipt.
   Stop on missing/unacknowledged authority; preserve the encrypted recovery copy.
4. **Capacity:** manually invoke bounded operations (50 records/batch), no cron. Include
   approved purge, held dependencies, bonus expiry, unissued-play reversal and repeat
   execution through an authenticated operator, not a public endpoint. Record D1
   query duration/row usage, elapsed throughput and remaining backlog. Worker CPU and
   invocation limits remain unverified because no Worker binding/deployment is in
   this scope. Stop if provider execution needs an unapproved adapter or resource.
   Stop at the fixture/allowance ceiling; do not extrapolate this small sample into a
   production deadline guarantee. Owner peak games/day, backlog and outage tolerance
   are required before approving a production schedule or larger benchmark.
5. **Custody:** synthetic artifacts may remain in private local temporary storage;
   no cloud backup upload is included. Before real operational backups, owner names
   custodian, encrypted destination/access list, separate key custody and readback
   procedure. Archives expire at 30 days; preserve no identifiable history beyond
   approved rules. Existing research Drive custody is not operational custody.
6. **Cleanup/rollback:** approval must include deletion of only the newly created
   rehearsal D1 after counts, checksum and reconciliation receipts are preserved.
   If reusing a database, do not delete it or unrelated data: obtain an exact cleanup
   approval after inventory. On failure stop operations, preserve private diagnostic
   receipts and the pre-operation synthetic export, keep access blocked, and abandon
   or restore only this isolated rehearsal state after authority reconciliation.
   Never restore/overwrite the private game's D1, wallets or existing websites.
   Delete local synthetic working copies/keys when evidence review finishes and no
   later than the approved backup window. Keep only non-personal verification receipts.

Cron, production resources/runtime activation, live Stripe, DNS/cutover and any costs
remain separate approvals. A hosted rehearsal pass is technical evidence, not legal
or cultural sign-off.

Detailed contracts: [retention operations](retention-operations.md),
[legal activation](legal-content-activation-checklist.md),
[Stripe seller/payment setup](stripe-payment-link-setup.md),
[hosting and rollback](netlify-cloudflare-hosting.md),
[evidence backup receipts](launch-evidence-backup.md).


## Authorised rehearsal preflight � 10 October 2026

Owner authorised the exact synthetic rehearsal above, including private Drive archive
readback and documented cleanup. Starting source `087e6f691104d25a8e043560412945148c911578`,
clean `feature/viral-build-sprint`. Execution stopped before resource creation because
step 3's provider adapter prerequisite is not implemented. No Cloudflare inventory,
allowance check, database creation, hosted migration/write/export/restore, benchmark,
Drive upload/download or cleanup was performed. Do not infer the named rehearsal
resource is absent: existing resources were not inventoried in this stopped run.
No resource created by this run needs cleanup; existing resources remain untouched.

**Observed repository evidence:** `scripts/operational-backup.mjs` is local-only,
rejects `--remote`, and uses attached SQLite databases for atomic authority/progress
commits. The existing remote retention operator is bounded and tied to the existing
private-test identity; it is not a complete paginated D1 export/restore adapter.
Do not retarget that operator to bypass isolation or claim offline replay is hosted
restore. The prior seven focused checks and complete-suite stages remain reusable;
no application test was repeated for this documentation-only preflight.

**Documented provider guarantees, checked 10 October:**
[batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/)
describes transactional batch rollback on statement failure. [Export documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
states exports block other database requests; raw SQLite import is unsupported and
SQL conversion is required. It also warns about numeric precision and unsupported
virtual-table export. [Export API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/)
documents an export bookmark stable for the task and a temporary SQL download URL.
These statements do not establish a transaction spanning D1 and an independent
journal/Drive destination. No live provider behaviour was observed in this run.

**Required scoped implementation before resuming:** a private operator restricted to
the rehearsal database identity, verified export cutoff and lossless SQL-to-local
snapshot conversion, complete table/count/schema receipts, resumable D1 import with
checkpoint reconciliation, and durable journal delivery with idempotent acknowledgement
and tested crash-gap recovery. Design the D1 commit-to-independent-custody boundary
explicitly; if an atomic outbox/schema addition is necessary, explain its exact scope
and obtain approval before creating any migration. Do not assume the existing SQLite
super-journal carries over. This exceeds a documentation or narrow existing-code
correction; seek explicit adapter implementation authority, not a waiver of guarantees.

**Capacity/custody status:** hosted throughput and the new archive's independent
Drive custody remain unverified. Prior research/synthetic Drive receipts remain valid
historical evidence, not a new hosted rehearsal pass. At the proposed 50 answers per
15 minutes, theoretical capacity is 4,800/day or 33,600/seven days, before arrivals,
outages and other work. The 1,440-answer fixture needs 29 bounded passes (conservatively
7h15 at that schedule). This arithmetic is not measured hosted throughput or evidence
of a seven-day production deadline. Owner demand, backlog/outage tolerance, custodian,
private operational destination and separate key custody remain production decisions.

## Approved operational migration extension — 10 October 2026

Owner approval extends this exact synthetic rehearsal to unchanged 0000–0012 plus
`0013_operational_recovery.sql` (SHA-256
`9cc74ee4cd863d2fbde55fcaf8b855547defc88ac5508708e54f6c3d128dc4dd`).
Only `wybp-restore-rehearsal-r001` may receive 0013; existing test/production must not.
No resource was present at authenticated inventory; Workers Free and its D1 limits
were visible in the signed-in account. Current usage must be checked before writes.

See [D1 operator boundaries](retention-operations.md#d1-recovery-adapter-and-approved-migration-0013--10-october-2026).
The rehearsal remains unbound and synthetic-only. Its own data may be restored into
that same isolated database after verified encrypted export; preserve the independent
archive and authority receipt before resetting only the rehearsal state. Keep all
application routes, cron, payments, websites and other databases unchanged. Delete
only the newly created rehearsal database after evidence/custody receipts are saved;
otherwise leave it unbound and report the precise cleanup blocker.

### Rehearsal completed and cleaned — 10 October 2026

The approved synthetic rehearsal received unchanged migrations 0000–0013 only in
`ed22b01c-c791-4982-ba2e-5c8d2aa8c164`, never bound to a Worker. Transaction rollback,
fixed-bookmark full export, interrupted/resumed import and delivery, fresh suppression,
closed-wallet/hold/accounting preservation passed. Measured 1,440 answers/29 bounded
passes: 14.758 seconds total, p95 0.874 seconds. Owner-only Drive download and all
221 file checksums verified. The rehearsal database was then deleted; inventory
confirmed cleanup. Detailed receipts and limitations: [retention operations](retention-operations.md#verified-synthetic-hosted-rehearsal--10-october-2026).

Next approval must identify production custodian, private destination and separate
key custody; expected arrivals/backlog/outage allowance and an operational purge
schedule within quotas; continuous independent authority delivery plus failure alerts;
and the separately reviewed production runtime/live-payment/domain activation scope.
This rehearsal grants none of those activations. Existing test D1 remains 0000–0012;
0013 must not be applied there or to production under this approval.

## Consolidated production proposal - 11 October 2026

Prepared locally, NOT activated. Source checkpoint: b5a93cf7168f2ffa6aef6d2177f00773c745ce7d.
This is the current approval scope; older open tasks are superseded only where the
recorded later rehearsal/payment receipts prove completion. Retention policy is unchanged.

### Verified basis and essential missing code

Reuse recorded desktop/mobile replay, sandbox accounting/payment, focus/media and
synthetic recovery evidence. Local checksum recheck passed all 14 migrations 0000-0013
and exact manifest 4b6883d08e9efceb336ab333bab0e67e0219d107693ec85b99757170dff8c22d.
No application tests were repeated for this documentation-only audit. The isolated
rehearsal proved snapshot/import, interruption, authority, holds/closure/suppression,
1,440-answer purge and independent Drive readback. It did NOT prove production
continuous delivery, key custody, bound application fencing or full scheduled capacity.

Remaining implementation is substantive, not a switch:

- vite.config.ts, scripts/netlify-release.mjs, build/verifier and runtime selectors:
  add separately pinned production identity/profile/D1 and approved launch flags.
  hostingOrigin.ts already allows https://classesforculture.com; current packaging
  rejects non-test D1 and enabled features. Preserve existing test/Sites defaults.
- app/commerceRuntime.ts: select existing D1CommerceRateLimiter for production;
  currently only private payments selects it. Preserve atomic 20 admissions per
  owner/minute, fail closed. Inventory start/answer/result limits and aggregate
  quota abuse; anonymous identities alone are not adequate quota protection.
- worker/netlify.ts and new production webhook adapter: exact proposed POST
  /commerce/stripe-live-webhook, production identity only, raw-body signature,
  bounds, replay/order/product/allocation checks, live-only events. Keep test route
  test-only and every other direct Worker/asset request signature-protected.
- Recovery/custody: existing PrivateCustody is filesystem-backed and provider/import
  adapters are rehearsal-pinned. Adapt for production independent Drive delivery
  and bound DB fencing. Capture EVERY access-relevant writer: API/webhook/operator
  deletion, minimisation, freeze/closure, hold/release and suppression authority.
  Durable encrypted intent must precede atomic D1 mutation/outbox/head recording;
  independently acknowledge delivered hashes/sequences. Polling after an
  unjournalled write is insufficient. Test concurrent writes, unknown commit,
  retries, interrupted upload and outage. Delivery is not atomic across providers.
  Missing authority blocks recovery; partial recovery must never permit access.
- Private scheduled operations Worker: port custody to fetch-based provider I/O,
  no public HTTP handler, fixed DB/identity, no overlapping runs. Wire approved
  retention/accounting dependencies and authority. Current schedule is test-only.
  Use unchanged 0013 if adequate; explain any additional schema need BEFORE creation.
- Complete actual legal configuration/text and durable purchase-contract/consent
  receipts, not merely remove draft warnings. Names/address and professional approval
  cannot be invented. Optional public results/challenges, analytics, daily/streaks,
  owner tools and R2 are deferred/off.

Affected gates after implementation: production/test isolation, same-origin credentials,
all ingress, distributed limits, every authority writer/crash boundary, complete scheduled
workload, currency/refund/dispute reconciliation, legal consent/receipts; then one final
integration/compiled-package/matched-release gate. Repeat old cases only for changed paths.

### Exact proposed hosted scope

Names are PROPOSED, not verified availability or existing IDs. Inventory/reuse only
empty or proven matching resources. UUIDs/URLs/Stripe IDs arise after approved creation.

| Resource | Proposed change |
|---|---|
| Netlify | Separate production team Classes for Culture Launch, Personal plan, project wybp-production. Owner-only production/previews first, no Git or remote builds, verified local uploads. Separate team prevents new traffic exhausting the existing websites' shared credit pool. |
| Cloudflare | Account b6b22a9a87b5758725e5c499782160af only: application Worker wybp-prod-r001, no-public-HTTP operations Worker wybp-prod-ops-r001, D1 wybp-prod-d1-r001. DB bound only to those resources; authenticated ASSETS, Images, run_worker_first=true; R2 unbound. No other resource/trigger modified. |
| DB/catalogue | Empty-state check; checksum-verified unchanged 0000-0013, including recovery tables. Idempotent five editions/60 canonical seed and exact approved 90-version manifest above, subject to NEW production publication approval. Verify 30 eligible/region. Never import sandbox wallets/orders or unpublished drafts/reserves. |
| Custody | Restricted WYBP Production Recovery subfolder in already approved private Google Drive for ayo.m.ayeni@gmail.com. Continuous encrypted authority and complete encrypted snapshots/readback. Separate restricted accounting/support exports follow their approved schedules; research archives are not customer backups. |
| Keys/secrets | Owner names primary/recovery custodians and independent password-manager/emergency key custody separate from Drive. Prove retrieval/decryption on synthetic data. Production proxy secret only in Netlify runtime/application Worker; live webhook secret only in application Worker; custody OAuth/provider credentials and encryption key only in necessary private runtime(s). Verify least-privilege scopes before requesting. No secrets in builds/client/Git/logs. |
| Monitoring | Independent external heartbeat/alert receiver, recipient proposed team@classesforculture.com. Provider/account/cost remains an owner setup dependency. Monitor last backup/readback, oldest outbox age, sequence/hash lag, unresolved intent, purge backlog/deadline, errors and provider quota. Non-personal metrics only; no analytics-consent dependency or identifiable deletion logs. |
| Stripe | Parent acct_1UOOZAIb8Lefpj36 ONLY. Inventory/reuse four LIVE fixed-quantity one-off GBP links: royal_reveal_v1 GBP1.99; cowrie_5_v1 GBP1.99; cowrie_15_v1 GBP4.99; cowrie_40_v1 GBP9.99. No sandbox IDs/secrets reused. Return https://classesforculture.com/royal-reveal/return or /cowries/return; application supplies opaque client_reference_id. |

Live webhook proposed on new Worker at /commerce/stripe-live-webhook with ONLY:
checkout.session.completed, checkout.session.async_payment_succeeded,
checkout.session.async_payment_failed, charge.refunded, charge.dispute.created.
Pin/validate offered API version and configure exact product/link/quantity/amount/currency
and expected live mode via existing commerce configuration loader. Worker hostname and
Netlify/Drive IDs are unknown until inventory/creation; never substitute proposed UUIDs.
All-scopes Netlify proxy secret remains safe only with secret-free local builds,
disconnected Git/remote builds and separate installation; automated builds need review.

### Operating schedule and measured limits (proposals, not guarantees)

- Authority: independent durable intent before relevant mutation; deliver/read back
  immediately, retry every five minutes. Alert immediately on unknown/conflicting intent,
  or after 15 minutes of acknowledgement lag. Never discard unresolved authority silently.
- Complete snapshot daily 02:17 UTC and before migration/recovery/cutover. Fence relevant
  writes, reconcile and acknowledge latest authority before reopening. D1 export blocks
  queries: measure maintenance time and show a usable maintenance response. Daily snapshot
  plus authority does NOT reconstruct all intervening gameplay/payments. Owner approves
  ordinary-data recovery point/time; reconcile subsequent Stripe payments before reopening.
- Bounded purge/cleanup every five minutes UTC, limit 50 per existing operation,
  idempotent/resumable/non-overlapping. Keep approved seven-day physical purge and 30-day
  backup window, financial dependencies, holds and closure clocks. Alert oldest eligible
  item at 24h or projected deadline miss; escalate 48h; stop new writes/paid entry before
  exceeding safe capacity, preserving accepted-payment settlement handling.
- Capacity calculation: 50 answers x 288 runs/day = 14,400/day theoretical. A 48-hour
  outage leaves 72,000 answers/seven days. Reserving half for retries/other work leaves
  36,000. Proposed 400 games/day x 12 x 7 = 33,600, with 2,400 existing-answer headroom.
  This is an UNAPPROVED demand envelope, NOT measured capacity/admission enforcement.
  Benchmark the ENTIRE bound scheduled path, CPU/queries/rows and catch-up; include
  incomplete attempts, bursts and non-answer records. Larger demand needs recalculation,
  never relaxed expiry. Existing rehearsal timing is evidence, not a production SLA.
- Daily operational review; weekly independently downloaded backup/authority check;
  monthly isolated restore exercise; annual held-case necessity review. Name owner and
  absence cover. Cleanup only disposable rehearsal target after reconciliation receipts.
  Do not rely solely on a failing provider to alert about its own outage.

### Costs checked against official sources, 11 October

Separate Netlify Personal lists USD9/month, 1,000 credits. Workers Paid lists USD5/month
account minimum if not already subscribed. Proposed BASE approval ceiling: USD14/month
incremental before tax/FX, usage and backup/alert services. Existing Workers subscription
may remove the incremental USD5. This is NOT a total cost or hard provider spend cap.
No automatic credit recharge, plan change or other charge without an approved ceiling;
usage may incur charges under metered Paid plans, so do not provision/activate if the
owner requires a hard cap the provider cannot enforce.

Netlify production deploys cost 15 credits, bandwidth 20 credits/GB, web requests
2 credits/10,000. Exhaustion can pause ALL projects on a team. Verify the selected
team's actual billing before creation and forecast combined usage before launch.
[Plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/),
[meters](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
[pause scope](https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/).

Paid D1 includes 25 billion reads, 50 million writes and 5GB/month; excess USD0.001/million
reads, USD1/million writes, USD0.75/GB-month. Worker request/CPU overages also apply.
Images Free includes 5,000 unique transforms/month then rejects new transformations;
Paid excess is USD0.50/1,000. Verify actual image variants/caching; no implicit upgrade.
Drive available quota and alert-provider costs remain unverified.
[Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[D1](https://developers.cloudflare.com/d1/platform/pricing/),
[Images](https://developers.cloudflare.com/images/pricing/).
Stripe standard UK cards list 1.5% + 20p; other cards/FX/disputes differ. Proposed
four-product live verification spend totals GBP17.96, then verified refunds; fees may
remain. Owner must specifically authorise/perform real card steps, not provide card
information in chat. [Stripe fees](https://stripe.com/gb/pricing).

### Owner inputs and genuine blockers

1. Approve custodians, independent key store, restricted Drive/alert access and a named
   operator/absence cover. Choose/securely connect external monitor; no purchase assumed.
2. Confirm 400-games/day planning envelope (or give expected peak/backlog), 48h outage
   allowance and acceptable ordinary-data loss/recovery time; approve measured schedule
   only after full bound workload benchmark. No unverified deadline promise.
3. Approve budget/usage ceilings and isolated resources/publication scope. Production
   0013 approval is new; rehearsal approval did not cover production databases.
4. Supply accurate geographic business/contact address through secure setup, confirm
   support/privacy/reporting mailbox operations; record final consumer/cancellation,
   refund, durable receipt, privacy, processor/transfer, ICO/children and tax decisions.
   Ayodele Ayeni, sole trader/Classes for Culture/non-VAT/support email are already known.
   Legal pages still draft. Owner retention approval is not professional legal sign-off.
   [UK online selling](https://www.gov.uk/online-and-distance-selling-for-businesses/online-selling).
5. Currency compatibility is a launch BLOCKER: Stripe says Adaptive Pricing always applies
   to Payment Links; current validation rejects non-GBP events. Prove authoritative
   original GBP price/link/amount AND converted checkout/refund/dispute reconciliation
   using focused sandbox evidence before live activation. Never accept arbitrary currency
   or take legitimate converted payment without delivery. If unavailable securely,
   report precise alternative Checkout scope for decision; do not silently change products.
   [Stripe confirmation](https://support.stripe.com/questions/adaptive-pricing?locale=en-GB).
6. Recheck exact parent account capability/verification directly in Stripe; enter sensitive
   details there. Original fifteen-Cowrie incident remains unroot-caused; subsequent
   repeated-owner/retry/frozen-wallet evidence stands. Historical timestamps stay unknown.

### Deployment/payment/cutover/rollback order

1. Finish scoped production/custody/currency/legal code, affected tests and one release gate.
2. Inventory actual permissions, billing, existing public site/project/DNS and rollback
   state. Protect NEW production project first; provision new DB/catalogue/secrets and
   independently monitored jobs. Rehearse bound fencing/recovery/full scheduled workload
   with disposable synthetic data; preserve existing private game and all its records.
3. Private prelaunch build uses one exact authorised fixed Netlify origin. Then build
   canonical classesforculture.com pair from same source, secrets absent. Do not claim
   canonical browser/signing checks before its domain routes to that release.
4. Prepare live Stripe links/webhook under approved scope, keep public checkout off until
   all capability/currency/legal/custody/capacity receipts pass. No live charge yet.
5. Download/check existing website source/config/assets; record deploy rollback ID and
   exact DNS/domain/SSL state. Prepare minimal reviewed cutover diff (actual registrar,
   DNS values/project IDs are NOT known from this audit). Preserve MX/subdomains/other
   sites; do not change nameservers. Prefer domain attachment only if DNS already suffices.
6. Review actual cutover diff and authorised low-value transaction scope. Release random
   replay/Cowries/Royal Reveal together, previews stay private, optional features off.
   Owner performs card/security steps. Verify canonical HTTPS/mobile return, receipt,
   ledger/entitlement/refund and monitoring before declaring launch complete.
7. On ingress/security, accounting/fulfilment, gameplay or operational failure: stop new
   purchases/paid entry; preserve signed settlement handling for accepted payments.
   Restore captured previous public site/domain/DNS and matched release as appropriate;
   reconcile in-flight orders. Never revert financial data, erase orders or reopen closed
   wallets. Any DB recovery stays fenced until latest independent authority reconciles.

ONE consolidated approval request: approve scoped implementation and conditional private
production provisioning/operations/live-object preparation above, supplying the inputs
and budget. DNS/public activation and real charges remain held for the concrete reviewed
cutover/transaction scope within this package. Unknown costs/permissions/schema need an
actual decision, never a guessed approval. No hosted changes occurred in this audit.
## Owner-approved gated preparation - 11 October 2026

This supersedes conflicting PROPOSALS above. Owner approval is not completed setup,
legal sign-off, provider guarantees or launch approval.
- Primary operator Ayodele Ayeni; separate secure key storage available. No independent
  recovery custodian. Follow retention-operations.md; a second personally controlled
  copy does not remove absence/shared-credential risk. Actual retrieval unverified.
- Recovery <=24h; ordinary gameplay loss <=24h. Financial/closure/deletion/hold authority
  requires stricter independently verified protection before reopening access.
- GBP50 TOTAL/month including existing hosting, tax/usage; no automatic top-ups. Reuse
  existing Goldmind Personal team if suitable. Separate paid team proposal WITHDRAWN.
- Benchmark5000 games/day,500/hour,48h outage replaces400/day. Schedule not yet approved.
- Documented production resources/unchanged0000-0013/catalogue authorised conditionally.
  No new schema; no DNS/public access/site replacement/live activation or real charges.

### Verified inventory and measured capacity

Starting local/remote feature HEAD b5a93cf7168f2ffa6aef6d2177f00773c745ce7d.
Goldmind team680b7d7c555040fc4a4a0b49 has three existing projects. Personal USD9/month,
1000credits; dashboard659.7 remaining,340.3 used (330 from22deploys), auto rechargeOFF,
no add-ons displayed. Shared exhaustion can pause existing sites. Owner-only setup
is technically supported; no settings changed. Proposed wybp-production absent from
TEAM inventory; GLOBAL name availability not proved.
Cloudflare accountb6b22a9a87b5758725e5c499782160af dashboard confirms Free; Workers only
 afri-track-proxy and wybp-test-r001; D1 only wybp-test-d1-r001. Proposed production
Worker/D1 names absent in this account. Subscription API403; dashboard used instead;
no additional authentication scope requested. No production resources or IDs created.

LOCAL full runTestRetention SQL path sampled at45000 synthetic completed games and
540000answers (7daily volumes +48h backlog). Limit100;60passes removed6000answers in
15254ms,p95 336ms,max362ms. Foreign keys passed. Whole backlog NOT drained. Excludes
hosted CPU, independent delivery, concurrent writers, full financial/case volumes and
500/hour HTTP burst. A normal free-game fixture writes20 logical rows:100000/day at
benchmark, BEFORE HTTP limits,index billing,purchases,journal,purge. Free D1100000/day
is insufficient. Workers Paid USD5/month PLUS usage; CPU limits are not a spend cap.
Upgrade remains held until exact all-in cost is reviewed within owner ceiling.

Run npm run test:production-preparation. Large sample: set WYBP_CAPACITY_BENCHMARK=1,
run Node --experimental-strip-types --test tests/data/production-capacity.test.mjs,
then unset. Logs outside Git. No hosted synthetic data written.
Deployed browser-entry static-import closure:428093 rawbytes,126243 gzipestimate,
109756 Brotliestimate,4JSfiles; excludes lazy app chunks,HTML,CSS,images,API. At150000
cold games/month that Brotli assumption alone gives16.46GB; actual compression/cache/
provider meters are unverified. Complete estimate must include existing sites,recovery
storage,alerts,FX/tax. Known combined proposed BASE USD14/month PRE-tax/FX (existing
Netlify9 + new Workers5), not an approved all-in GBP estimate or guaranteed maximum.

Old50rows/5min:14400/day vs60000 arriving FAILS. Candidate100/min:144000/day;
120000outage answers /84000daily spare =1.43days catch-up within5remaining days under
ideal conditions. Half the runs succeeding is insufficient. Candidate NOT enabled
or guaranteed. Measure full bound journal/custody path/other records/deadline alerts
before owner approves schedule. Expiry/holds/accounting protections unchanged.

### Gates, next actions and retained activation sequence

1. Owner: provide actual other recurring hosting/backup totals and tax/FX assumptions;
   review exact USD5+usage Workers upgrade and budget-safe traffic/credit arrangement.
   No automatic recharge/larger budget implied; protect existing shared-team sites.
2. Owner: enter address/verification directly in Classes for Culture Stripe; perform
   secure key retrieval steps. Operator absence remains a single-person dependency.
3. Agent: complete production profile, bound continuous authority/financial delivery,
   recovery fencing, operations/monitoring and cost protection. Unbound rehearsal
   adapters are NOT a deployed production solution. Provider/alert setup still needed.
4. Agent: complete actual Adaptive Pricing sandbox checkout/refund/dispute evidence
   in payment runbook. Official contract/local signed fixtures support exact GBP;
   converted disputes still need direct evidence. No live object preparation yet.
5. After gates: protect new project -> isolated checksummed0000-0013 DB -> canonical60/
   exact approved90 (30perregion) -> secure secrets -> matched protected release ->
   independent readback/restore -> measured ops/alerts -> owner-approved schedule.
6. Separate launch approval: seller/legal/live-account checks -> four unavailable live
   links/exact signed webhook -> existing-site/DNS/config backup -> reviewed cutover ->
   public replay/Cowries/Royal Reveal activation. Real-card checks need explicit scope.
7. Rollback: stop new paid entry/purchases, preserve accepted-payment settlements;
   restore captured matched release/site/domain only within separately approved scope.
   Reconcile in-flight payments; never roll back ledger or closure/deletion authority.
   DB recovery remains fenced until independent authority verifies. Production absent.

No hosted mutation, schema edit, publication, cron, Stripe object change, public
release or DNS change occurred in this preparation checkpoint.

Focused final preparation checks:21/21 passed; scoped ESLint and git diff --check passed.
No application runtime/dependency/build configuration changed; recorded application gates
reused. All14 migration checksums verified, exact approved manifest unchanged. PR1
open/draft/unmerged, base master. Local capacity log and read-only inventory stay in TEMP;
these are not independent production custody receipts. Static traffic probe limitations
are explicit; no new live sandbox Adaptive Pricing result is claimed.
