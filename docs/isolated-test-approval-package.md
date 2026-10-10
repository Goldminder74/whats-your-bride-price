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
