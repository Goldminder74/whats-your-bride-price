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
| **Complete exports:** implement checkpointed, paginated database/authority export and restore beyond the current 100/category and 64 KiB caps. Include every protected financial dependency, holds, closure clocks and restore suppression; test interruption/resume, duplicate pages, completeness/checksums and repeat restore without resurrecting access. Keep approved retention periods. | Codex implements/tests; owner reviews | Scoped local implementation approval first; no hosted writes required. |
| **Independent custody:** appoint an accounting/support custodian; choose a restricted encrypted operational database/authority backup destination, access list, key custody, approved rolling window and readback procedure. Verify independently downloaded checksums and current authority journal. Existing verified research Drive archives are not payment backups. | Owner selects custodian/destination; operator implements and verifies | Explicit destination/access and backup-operation approval; any charge separately approved. |
| **Hosted restore rehearsal:** choose a separately isolated rehearsal D1 within verified allowances, or explicitly approve maintenance-window restoration of test D1. Export current state, keep all features/cron off, restore with independent latest authority, reconcile payments/ledger/holds/closures, replay suppression, prove expired/deleted/closed data inaccessible, install fresh reviewed restore receipt. Preserve a recovery copy and test DB. | Owner approves target; Codex/operator rehearses and records receipts | Exact resource/restore scope and allowance ceiling. Time Travel availability is verified, restoration is not; it cannot clone the database. |
| **Purge capacity/schedule:** supply peak games/day, backlog and tolerated outage. Benchmark the entire hosted scheduled path, including bonus expiry and unissued-play reversals, query/CPU/row usage, deadline age and outage catch-up; choose bounded schedule with headroom, alerts and an escalation owner. Local 12,000-answer/240-pass proof is not hosted throughput. 50 answers/15 minutes is only 4,800/day before arrivals/outages. | Owner supplies demand/operations owner; Codex/operator measures | Exact synthetic benchmark target/volume/allowance; approve measured schedule and cron activation separately. |
| **Seller/legal:** confirm Ayodele Ayeni trading as Classes for Culture, non-VAT registered, support team@classesforculture.com; supply geographic contact address/phone where required securely. Complete consumer delivery/cancellation/refund and durable receipt review, privacy/processor/transfer/ICO/children/accessibility checks; approve final notices and support/claims process. Remove draft status only after recorded approval. | Owner with appropriate legal/privacy/accounting advice | Final disclosure/policy approval; owner approval alone is not professional sign-off. See legal activation checklist. |
| **Stripe live readiness:** verify the Classes for Culture parent account's current payments/payouts/verification status directly in Stripe; enter identity/bank details there. Confirm GBP market/tax treatment and resolve Adaptive Pricing so currencies offered match server validation. Wigsmi/Sherwood are excluded. | Owner in Stripe; Codex may inspect under separate authority | Live account/configuration authority and any costs; no live setup implied by sandbox evidence. |
| **Production source/runtime:** implement reviewed production DB/runtime/restore-receipt, rate-limiter, retention and webhook wiring. Current private profiles, scheduled entry and exact test webhook are test-only; never accept live events on the test route. Decide actual canonical domain: current future Netlify production allowlist is https://classesforculture.com, while Sites defaults use https://brideprice.classesforculture.com. Neither may replace an existing website without an explicit domain decision. Preserve authenticated assets, raw-body signatures, replay/ownership/origin checks and fail-closed limits. | Owner chooses domain/topology; Codex implements/tests | Scoped production implementation approval after domain decision. No domain setting, source allowlist change or new resource yet. |
| **Isolated production provisioning:** inventory existing resources, approve exact new project/Worker/D1 names, account IDs and cost ceilings; configure private protection first, verified migrations 0000–0012 and only approved catalogue publications, 30 eligible/region. Never copy sandbox financial records or secret values. Establish independent operational backup/authority custody and restore receipt before opening traffic. | Owner approves; operator provisions/verifies | Explicit resource creation, hosted migrations/catalogue writes and cost approval. Existing test publications do not authorise production publication. |
| **Four LIVE links/webhook:** create/reuse live one-off GBP Royal Reveal £1.99 and 5/15/40 Cowrie £1.99/£4.99/£9.99 objects in the correct parent only. Set exact approved production /royal-reveal/return and /cowries/return URLs; let the application append opaque client_reference_id. Register only the five documented events on the separately implemented production POST webhook. Install live IDs, amounts, expected livemode and signing secrets securely at runtime; separate Netlify proxy secret from secret-free build/upload. Never reuse sandbox IDs or secrets. | Owner/operator, with Codex under explicit authority | Live Stripe configuration and secret-installation approval; no live charge yet. |
| **Private production release gate:** build matched client/Worker from approved commit, verify package/client checksums, production origin, secret absence, private/preview protection, signatures, live-event route isolation, catalogue, limiter and retention readiness. Review final copy and payment terms. Sandbox checks need repeating only for changed paths. Define explicitly authorised low-value live fulfilment/refund check, limits and operator before live traffic. | Codex/operator; owner signs off | Private production deployment approval; live transaction authority separately specified. |
| **Domain cutover and activation:** snapshot existing DNS/site deployment and verified rollback pair; prepare exact DNS/hosting diff without changing other sites. After all receipts pass, obtain approval for that diff and simultaneous replay/Cowrie/Royal Reveal activation, then verify HTTPS, navigation, image rounds, mobile returns, fulfilment and monitoring. Leave analytics, daily/streaks, owner tools and unrelated features off. | Owner authorises; operator executes | Final exact domain/DNS, public deployment and live-payment activation approval. |
| **Rollback:** stop new checkout/payment feature exposure, preserve signed settlement handling for payments already accepted, disable affected public entry points, restore previous matched code/config and approved prior DNS/site state. Preserve D1/ledger/holds/closures and reconcile in-flight payments; never roll back financial data or erase orders. Restore suppression must precede access after any database recovery. Keep an on-call owner and decision thresholds. | Operator; owner controls domain rollback | Include exact rollback operations in cutover approval; financial-data restore still needs explicit incident authority. |

**Smallest next approval:** authorise local paginated export/restore and independent
operational authority-journal implementation with affected tests, keeping the existing
retention rules and hosted state unchanged. In parallel the owner can choose the
custodian/destination and intended domain. Hosted rehearsal/capacity, provisioning,
Stripe live setup and cutover each remain later, separate approvals.

Detailed contracts: [retention operations](retention-operations.md),
[legal activation](legal-content-activation-checklist.md),
[Stripe seller/payment setup](stripe-payment-link-setup.md),
[hosting and rollback](netlify-cloudflare-hosting.md),
[evidence backup receipts](launch-evidence-backup.md).
