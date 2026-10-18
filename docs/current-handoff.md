# Current handoff

## Decision and checkpoint

Branch `feature/viral-build-sprint`; continuation based on `bbb8352bdbc9f6d5fb1d4acab49d3984e1356621`.
Resolve the validated continuation with `git rev-parse HEAD`.
Launch REQUIRES **5,000 completed games/day,500/hour,48h outage allowance**.
GBP50/month covers hosting/backups/operations; Stripe fees, separately funded Drive
and Namecheap Private Email excluded by explicit owner decisions.500k redesign deferred.
Owner now approves ONLY the documented capped benchmark and conditional Workers
Standard Paid$5/month, <=GBP8 incremental/first-month andGBP50 total, after fresh
headroom/quote checks. No top-up, other paid service, production schedule, public
access, DNS or live payment approved. Workers Paid activation is now verified below;
no hosted benchmark execution has occurred.

## Latest continuation — 18 October, read first

### Latest result — stopped experiment, cleanup complete

This result supersedes the pending B/blocker/resource notes below. The explicit
benchmark-only regular-variable exception succeeded; it did not apply to production.
Netlify deployment `6ad43154be115fa5241127e0` matched the isolated Worker. Private
signed ingress, anonymous401/direct404 and assets passed. The sole B clock ran
about288 seconds before new admissions were stopped for increasing harness queue
delay and a missed first completion deadline.15 setup/workload actions settled:
11 synthetic starts, one accepted answer, zero completed games. Phase C did not run.
No clock, reservation, wallet or authority fence was reset, and no uncertain mutation
was replayed. Shutdown produced Windows WSARecv warnings after stopping/disposal;
do not mislabel those as the original latency cause.

Confirmed limitation: `ApprovedBenchmarkDriver.action` serialises entire responses,
including read-only answers, to keep all client/provider I/O within the shared
rate cap. Queued start-admission intervals were approximately26–28 seconds;
starts used90 counted internal operations and23–24 external/client/provider requests.
Those are not separate fence/Drive/CPU timings or a measured application concurrency
ceiling.500/hour,5,000/day, whole-account launch costs and48h recovery remain NO-GO/
unverified. Removing serialisation without replacing aggregate pacing is unsafe.
See [concurrency decision](benchmark-concurrency-decision.md) for the smallest proposed
new resource/window scope; no coordinator or replacement test is authorised/created.

Read-only aggregate reconciliation found11 attempts/wallets, zero balance, ledger,
orders, results, stored answers or holds, and idle journal/writer fences. A first
read used a nonexistent balance column and received400; its conservative cleanup
reservation stays reserved rather than inventing zero billing. The corrected read
used purchased_balance+bonus_balance,35 reads and zero writes. This was synthetic
r002 only, not any existing wallet. Workload observations before cleanup/setup-inclusive:
419 external,1,025 counted internal,512 writes,8,341 reads,5,043,169 transferred bytes;
57 created objects including folders and513,204 uploaded encrypted bytes. No CPU
throughput/currency charge is inferred from the Netlify compute-zero counter.

Cleanup was tested locally against complete pagination, foreign contents, unknown
index mappings and an unconfirmed stop. The private operator then verified every
child before deleting only its recorded disposable root:17 folders/40 files removed,
approved parent preserved, root absence confirmed. Only then were the exact recorded
Netlify site, Worker and D1 deleted, with identity and absence checks. All three
are confirmed absent; no schedules, public game, DNS or live payments were enabled.
Cleanup-only Worker version `9f3ed33c-f986-447b-862e-e4019b315afc` is now deleted.
The disposable proxy variable was removed with its site. Existing game/ops resources,
backups, catalogue and wallets were not modified. One Netlify publication15 credits;
traffic stayed small. The already approved Workers Paid subscription remains active;
no other plan/service was purchased. GBP7.40 remains a conservative original-scope
forecast including that month, not a verified5k/day operating cost or actual invoice.

Sanitised evidence (ignored authority-preparation): `20261018-r002-{b-stop,
reconciled,drive-cleanup,resource-cleanup}.json`, phase-b/cleanup logs. Encrypted local
receipts/DPAPI remain outside Git. Stopped-run reporting now persists safe observations
on failure too, with a regression preserving unknown reservations and preventing
further requests. Focused9/9, cleanup/session3/3 and compiled Worker1/1 passed.
Complete data363/363, full lint and diff gates passed for this final scoped correction.
Evidence: ignored `20261018-{cleanup-data,cleanup-full-lint,cleanup-built,
cleanup-evidence-tests,stopped-evidence-tests}.log`. Unchanged application UI/typecheck/
release evidence is reused. Do not repeat passed Google/key/alert/payment/UI checks.
Resolve this continuation's commit with `git log -1`; only source, tests and documentation
are committed. No further hosted work follows without the new resource/window decision.

### Latest bounded revision and secure-storage blocker

**Later18October owner exception supersedes the blocker below:** explicitly approved
regular Netlify environment-variable storage for the disposable r002 signed-proxy
credential only. It is encrypted at rest but readable by authorised account/API users;
this is not write-only Secrets Controller storage and grants no production exception.
Installation succeeded without displaying the value or buying an upgrade. New site
has no Git/build/functions. One15-credit publication produced Netlify deployment
`6ad43154be115fa5241127e0`, matching the r002 Worker bundle below. The immutable
durable Phase B clock has now started; do not reset it or rerun effects after a lost
response. Results are pending, not evidence of500/hour yet. Only the isolated endpoint
`https://wybp-capacity-private-r002.netlify.app` was published; no existing site changed.

Owner explicitly approved C-only caps of250MB Drive,750MB transfer,100k external
requests,500k counted internal operations, and60 shared traffic credits. All other
limits,80% admission reserve, resources, GBP8 incremental/GBP50 operating ceilings
remain. Local fixture stock profile:84,996,768 encrypted bytes/1,323 objects before
snapshot/inventory and retained B stock. No full30-day recovery claim follows.
Updated fixed-point admission tests preserve B limits and cross-instance reserves.

The owner installed the existing OAuth trio in r002. Presence-only verification
confirmed all seven Secrets;100ms CPU, zero schedules, OFF flags and unsigned404.
Exact tested bundle SHA
`904ef6a5df79fea7e9b7fbfe5b8258c51e3d030fa9395d123e51a19e1a555a65`
was deployed as version `6579ce93-e631-4c83-a56a-dcd818b362aa`, then the verified
partition configuration was deployed separately. Use the ignored partitions-deploy
log for that later version. Only r002 was changed; existing environments remain intact.

Actual private RPC operations passed: approved private parent ownership/quota checks,
one root plus16 partitions, encrypted initial boundary delivery and independent
download/decryption/hash verification. B remains in one-way preparation state:
153 external requests,22 writes,1,290 reads,24 objects,424,856 uploaded encrypted
bytes,2,141,456 transferred bytes; zero completed games/uncertain actions. These
are commissioning evidence, not hosted capacity or populated recovery evidence.
All counters persist; do not repeat provisioning or commissioning effects.
Evidence: ignored `20261018-r002-{folders,commission}-result.json` and logs,
`20261018-r002-hosted-settings.json`; DPAPI copies remain outside Git.

**Genuine blocker before Netlify publication/B traffic:** Personal rejects the
write-only Secrets Controller credential: default scope422 “Secrets are not allowed
to run in post_processing scopes”; runtime-only scope403 “Upgrade your Netlify
account to set specific scopes”. Automatic approval review rejected storing the
same credential as a regular environment variable because it weakens access
protection beyond current authority. That write was NOT executed. No upgrade,
Netlify publication or B/C traffic occurred. A specific owner exception was requested
for this disposable credential only (encrypted at rest but account/API-readable),
or keep the benchmark blocked. Do not bypass the rejection. No need to repeat Google
setup. Existing private game and schedules remain unchanged; monitor stays paused.

Latest affected budget/controller/provision/session gate30/30; complete data gate
361/361, full lint, typecheck and diff pass. Evidence: ignored
`20261018-{cap-revision,approved-caps-data,cap-final-lint,cap-typecheck,cap-diff}.log`.
Earlier complete UI/browser/build gates remain applicable to unchanged application UI.
Final isolated version `2160bd78-af33-4211-8269-7e2a9939d590` includes the verified
initial boundary receipt; metadata confirms16 partitions, receipt present, OFF flags,
zero schedules,100ms and unsigned404. This is the harness, not a private-game release.
Resolve this continuation's scoped commit with `git log -1`; generated evidence,
resource IDs, encrypted operational records and DPAPI credentials stay outside Git.
No resource cleanup yet: retain only the approved idle resources/folders while the
specific access decision is pending; reconcile their recorded IDs before deletion.

**Latest isolated preparation supersedes the earlier18October narrative below.**
Workers Paid is verified as Current plan after the owner's explicit checkout-terms
confirmation. One Activate attempt only. USD5/month plus metered usage; no other
paid service, recharge, public access, schedules or customer payment activation.

Approved r002 resources now exist, isolated from existing application databases:
- D1 `wybp-capacity-d1-r002`, `a70d7402-5ac9-4298-95e9-7f996b82bd0c`.
- Netlify `wybp-capacity-private-r002`, `7fa52c44-9e5d-4631-9af8-16ec45f78a4c`;
  unpublished, no Git/functions/custom domain, no publication credits consumed.
- Worker `wybp-capacity-worker-r002`; initial code deployment
  `20bf5eb9-91e1-42d1-a150-41e0c2c54ded`, initial source
  `43fbb822709e572bc21b127191f36a4c5e0ea8b46999d72b7c8d365c4043fed2`.
  Later Secret installs create versions; use the newest deployment evidence below.
  Hosted settings independently verify100ms CPU, only the r002 D1 binding, private
  self-service entrypoints, zero schedules, disabled flags and unsigned404.

Unchanged migrations0000–0013 and150 synthetic questions were applied to r002 only.
0013 checksum `9cc74ee4cd863d2fbde55fcaf8b855547defc88ac5508708e54f6c3d128dc4dd`.
The first SQL import failed on duplicate terminators; a read-only schema inventory
confirmed an empty rolled-back target before repair. A new local regression then
passed; the corrected import reports15,631 reads/1,659 writes,1,036,288bytes.
Do not reapply or reseed. Evidence:`20261018-r002-{after-import-failure.json,
schema-import-fixed.log,hosted-settings.json}` in ignored authority-preparation.

Four generated benchmark-only Secrets are installed; their local copies are Windows
DPAPI protected under ignored `outputs/retention-authority/r002/`. No production
key was read/replaced. Latest presence check has NO dedicated OAuth trio in r002.
Owner was asked to install the EXISTING saved `WYBP_DRIVE_CLIENT_ID`,
`WYBP_DRIVE_CLIENT_SECRET`, `WYBP_DRIVE_REFRESH_TOKEN` as Secrets in this new Worker.
Do not repeat Google project/publishing/token setup or extract existing Worker Secrets.
No benchmark Drive folders, B/C workload or Netlify publication has started. Leave
prepared resources idle while that unavoidable secure step is pending; delete only
after the approved run/evidence reconciliation, not while installation is pending.

Local integration now includes actual bounded C fixture/purge/arrivals, private RPC
session wiring, encrypted settled-response readback, one-way measured-clock start,
source-fenced segmented capture and complete pinned-index/import/verification flow.
C retains B's uploaded bytes/object count: changing phase cannot reset Drive stock.
The36,000-answer fixture drains in360 passes of100 with accounting, held records,
closure/deletion protection and original suppression preserved. The benchmark now
fetches all displayed question images plus cold entry/refresh assets, not two art
placeholders. Capture rejects an unresolved writer before freezing/uploading.
No new application migration, actual-game content/score change or protection bypass.

Validation: complete data gate359/359; later affected capacity/image checks6/6 and
14/14; session/recovery integration12/12; full lint/typecheck/diff pass. The complete
browser/release gate passed earlier this continuation for unchanged application UI.
Compiled harness verifies real local D1, cross-instance B/C services, idempotent
fixture insertion, exact recovery, signed ingress, metering and index-loss replay.
Evidence:`20261018-{final-data,session-integration,capacity-model,assets-profile,
benchmark-fence-final,final-scoped-lint,integration-types}.log` (ignored).
Latest local stock profiling also includes actual chunk delivery before forecasting
C headroom; use its result rather than assuming intents/chunks have no duplication.

Capacity remains **NO-GO/unverified**, not a failed5,000/day measurement: no hosted
peak/outage run yet. The model now separates read-only abandoned judgements from
stored answers:60k stored/day,120k after48h.100/min at50% success catches up in10days,
missing the five remaining purge days;100/30sec is an arithmetic proposal only,
not an approved or active schedule. The internal counter includes D1 statement
operations as well as private RPC; it is not a measured Workers invocation/CPU bill.
Full30-day stock has at least1.8m answer rows/36k50-row pages before parents, holds,
journal/index data, exceeding this6k-object hosted scope. Do not claim full-stock
RTO or increase caps; consolidate any necessary follow-up scope after bounded results.
GBP150 remains planning only; actualGBP50/benchmarkGBP8 ceilings remain.

Next: finish secure OAuth installation, fresh metadata/headroom/package verification,
isolated commissioning and matched private publication, then only approved B/C work
whose full stock/transfer forecast fits its caps. Retain sanitised receipts and
clean up the three disposable resources/created Drive folders afterwards. Existing
private game, wallets, catalogue, websites, Stripe and paused monitor are unchanged.

Earlier18October notes below are retained as historical context and are superseded
by the latest isolated-preparation block above. Isolated compiled game/authority transport, known-billing propagation,
provider pacing, cancellation, source-fenced inventory, resumable audited clearing
and import verification now have local regression evidence. They are not deployed.
Hosted orchestration, populated full-stock authority release and PhaseC fixture/
purge integration are still unfinished. No hosted benchmark execution.
Owner explicitly confirmed checkout Terms/Privacy and metered-overage terms.
Activate was clicked once; the separate Workers plans page then verified Paid as
Current plan at USD5/month plus usage. Do not retry that purchase. Checkout supplied
no separate GBP/tax line; the recorded tax/FX allowance is an estimate, not a hard cap.
Fresh pre-purchase headroom: Netlify506.8 credits, recharge Disabled; two D1 databases,
2,285,568 bytes, no r002; month-to-date721.01k reads/28.21k writes; Workers1.75k
requests/34.94k CPU ms. No other paid service or top-up authorised or purchased.
Complete browser gate finished exit0, including compiled hosting and Chromium/WebKit
private refresh recovery. Focused restoration/control regressions are recorded below.
Owner business responses are recorded in [purchase review](owner-purchase-review.md).

## Previous continuation context

[Launch-priority continuation](launch-priority-continuation.md): GBP150/month is now
a planning envelope only, not spending approval. ConditionalUSD5/GBP8 benchmark
and actualGBP50 spending bounds remain unchanged. Global cross-phase35-credit
traffic/compute reservations and bounded segmented snapshot/streaming implemented
locally;24 focused and54 preparation tests, affected lint/diff pass.51,003 synthetic
rows resume across42 capture steps without duplication/premature access. No migration,
deployment, purchase or hosted load. Full boundary/import/lost-index integration and
metered hosted harness remain unfinished; do not claim full-stock recovery/capacity.
Read-only inventory stilltwo D1 DBs/no r002; subscription API403 persists. No broader
scope requested. Realistic PhaseC dependency sizing and actual retained-stock model
must be corrected before execution. See continuation for pricing, assumptions and
consolidated owner decisions; no speculative upgrade request or purchase.

[Consolidated launch decision](launch-decision-report.md) supersedes earlier checkout
blocker: final Workers quote now loads and owner confirms USD5/month due today plus
usage. No purchase or hosted change. Fresh Netlify507.8 credits, auto recharge
Disabled. Real-service synthetic game core exposed issuance SELECT incompatibility
with authority SQL guard; narrow SELECT CASE correction passes66 affected tests.
Runtime-only seller-details route implemented locally, not installed/deployed.
Hosted driver, full-stock segmented recovery and GBP50 capacity proof remain unfinished;
do not attribute these to missing owner permission or claim launch readiness.

Validation: complete integration gate passed across resumed stages after fixing a
metadata-test false positive caused by a public chunk hash containing a short name.
Privacy assertions still reject private metadata/inline/query values. Final lint,
typecheck,331 data tests and66 affected accounting/authority regressions pass.
Compiled hosting/mobile and private runtime pass, including Chromium/WebKit exact
refresh recovery, real local D1, signed webhook isolation and idempotent completion.
Windows sandbox TEMP realpath errors required the existing permitted external
synthetic temp directory; no assertions, timeouts or global lint rules weakened.
Ignored evidence: outputs/authority-preparation/launch-final-{data,lint,typecheck}.log,
launch-accounting-regressions.log and launch-integration-gate-complete.log (initial
chain; final resumed stages verified exit0). No hosted validation claimed this turn.

[Driver, fresh billing observations and owner choices](benchmark-driver-continuation.md): browser review now works; existing CLI/API authentication verified without added scopes. D1 inventory has two databases and no r002. Netlify has 507.8 credits remaining, Personal $9. Cloudflare remains Free; subscription API403 and dashboard checkout error prevent final quote. Recharge/whole-account preflight incomplete. No spending/resources/load. Local orchestration passes24 focused tests, lint/diff; real-service harness adapter and secure seller-address runtime route remain unfinished. Keep private game and OFF flags unchanged.

## Prior blocker and independent preparation (superseded where noted)

Automatic approval review failed the browser inventory action because of its usage
limit; action NOT executed. This is review unavailability, not an unsafe-action
finding. Do not bypass it through another privileged path. Fresh account headroom,
actual tax/GBP quote and Paid confirmation are unverified; stop before spending.
No new disposable cloud resources exist; existing private game/settings unchanged.

[Approved benchmark status and NO-GO assessment](approved-benchmark-status.md)
records conditional monthly scenarios and unmeasured peak/outage gates.
Local `approved-benchmark-budget.mjs` adds SQLite reservations, exact resource guards,
immutable caps, bounded rates/burst/duration, uncertain-response stops across phases,
file-backed resume, actual overrun recording and receipt-backed completion counting.
Pre-purchase quote checks differ from post-purchase execution; execution also requires
verified100ms CPU limit. Decimal byte caps are conservative. This is a local control/
schedule component, NOT a finished hosted application/provider driver.
18 focused budget/baseline tests passed; prior complete build/private game/recovery
gate reused for unchanged application source. Affected lint and diff checks passed. Evidence ignored: `outputs/authority-preparation/approved-benchmark-*`.
[Multiplayer proposal](multiplayer-proposal.md) is preparation only; no implementation,
charges or retention changes. Four owner purchase decisions are summarised in status.

## Deployed and preserved

[Private game](https://wybp-protected-test.netlify.app/) restored after sandbox checks:
Netlify `6acb796444ae067fcc06f6c9`, Worker `1b76d3fd-6d42-478e-a172-36e6c648c05e`,
source42bf37abbfc18e783da3815e12ee9c176007ba1b. Random ON; Cowries/commerce/webhook/
cron OFF. Owner entry observed; anonymous401,unsigned Worker/disabled webhook404;
both test/ops Workers have zero schedules. D1 `1a268b28-e6d5-4431-8f84-a886df9369f1`,
0000–0012,30 questions/region unchanged. Existing54-Cowrie active wallet/frozen records
preserved; new synthetic wallet zero, two orders protected review. No historical rewrites.

Private ops version `09b6acb0-f2af-45bb-a3ca-04591c5453e0`, existing D1
`a5b2b409-ed08-48c9-ac1d-36699fc6c4b9`,0000–0013. Private heartbeat probe deployed;
no HTTP routes, cron or operations activation. No schema/resource changes to these DBs.
Preserve websites/email,Wigsmi/Sherwood,staging/stash,drafts/reserves;R2 unbound.

## Verified work and evidence

Baseline completed3 games/36 answers,769 HTTP,17,487 billed reads,1,964 writes;
not5k proof. Missing operation-ID argument caused `invalid_retention_time` before hold.
Helper/real-authority regressions correct it; pacing serialised/binary transfer counted.
Original window expired/counters not reset. Disposable `wybp-capacity-d1-r001`
`140d6d9b-89d4-488f-acd3-c10990cabf11` reconciled synthetic-only and deleted.
[Capacity model, bottlenecks and proposed capped benchmark](production-capacity-proposal.md).

40-Cowrie EUR12.28/GBP999p credited40 once,full refund-40; same-owner second order
succeeded, signed961/999 dispute retained review/zero balance after retries.
Royal Reveal EUR2.45/GBP199p delivered result-specific pack/mobile390px/certificate
PNG download-start;full refund revoked access and stale replay did not restore it.
Separate result's191/199 dispute arrived before checkout;review/no entitlement persists.
No invented cause for original15-Cowrie failure or earlier unlinked discrepancy.
[Payment evidence](stripe-payment-link-setup.md).

Heartbeat delivery verified through private RPC/installed Secret; owner confirmed
Down detection,email receipt,then PAUSED/restored1day/1hour. No repeated SMTP/key test.
[Operations and previously passed encrypted recovery](private-operations-runtime.md).

Production bonus WITH queries failed the strict read guard; equivalent SELECT queries
fix availability/expiry without weakening guard/FIFO/accounting. Game source-only.
Focused regressions and compiled private RPC passed. Complete `npm run test:all` passed
(lint/typecheck, unit/data, browser suites, builds, paired packages and Chromium/WebKit
private runtime/recovery). `git diff --check` passed; no assertions weakened.
Ignored evidence: `outputs/authority-preparation/20261015-final-gates/`.

## Latest local continuation — 15 October

SOURCE ONLY: bounded25-event encrypted journal chunks/checkpoints; crash retries
retain writer barriers; snapshots pin chunk/legacy proofs. Chunk retention inherits
the earliest event's approved30-day expiry, never renewed. Purge ticks no longer take
a full snapshot; separate disabled private `snapshot` RPC preserves explicit boundary
creation. Keyset snapshot/outbox pages, indexed Drive identity ranges/bounded bulk verification and
optional16-folder custody preserve legacy files and pinned lost-index recovery.
No migration, hosted folders/settings, deployment or schedule change.

Only the exact Quick Play ephemeral admission write bypasses journalling, with
before/after recovery fences. Accounting/answers/holds/closure/deletion stay journalled.
Measured local repository counter4 transactions/19 statements/478 fence reads per
game (was18/33/450); new wallet1 transaction/10 reads. Not hosted/billed evidence.
Validation: complete `npm run test:all` passed; final affected73 recovery/accounting/
storage tests and15 source/compiled operations checks passed, plus affected lint and
diff checks. No weakened assertions. Evidence ignored under
`outputs/authority-preparation/bounded-journal-*`; no repeated key/alert/payment test.

[Exact benchmark approval, costs and cleanup](bounded-hosted-benchmark-approval.md)
supersedes earlier Phase B/C caps. Not run; conditional Workers Paid<=GBP8 incremental
is now approved, but fresh headroom/actual GBP check and available review are required.
[One owner-review document](owner-purchase-review.md) contains draft terms, territory
choices, durable confirmation and secure seller steps. Actual website address route
is NOT installed: legalConfig remains null; do not ask for details in chat.

Technical gates persist: fence latency/cleanup scan amplification and resumable
full-stock snapshot/inventory. Default50k-row snapshot is below one day's60k completed
answers. Do not raise limits to disguise it or claim launch readiness from small tests.
£50 fit remains unproven. Complete retained-stock recovery planning before launch.

## Earlier launch-gate context

### 18 October continuation (pending source; no hosted execution)

Private game and operations deployments above are unchanged. No r002 resource
creation, migration, feature activation or alert repeat has occurred.
Owner confirmed Terms/Privacy and recurring metered-overage authorisation. Activate
was clicked once; the separate Workers plans page verifies Paid/Current plan,
USD5/month plus usage. Subscription API403 remains a permission limitation, not
evidence of failed activation. Do not retry purchase. The exact GBP bank settlement
is not observed; GBP4.80 base and GBP6.41 maximum benchmark forecast use the recorded
0.96GBP/USD tax/FX allowance and are estimates, not a provider spending cap.
Wrangler refreshed the existing credential without new scopes: D1 inventory200,
two databases, no r002 match; subscription API403 persists. Netlify account API200
confirms the existing Personal team. A later transient401 also refreshed normally
through Wrangler, returning D1 inventory200 again; no new scopes or sign-in needed.
The earlier transient401 is resolved; do not ask for another Cloudflare sign-in.
Fresh Netlify browser readback18October:506.8/1,000 credits remaining,493.2 used
(480 publication,5.1 requests,8.1 bandwidth,0 compute), auto recharge Disabled,
existing Personal$9. This covers the95-credit benchmark cap, not launch capacity.

Pending implementation adds a compiled isolated, signed-ingress benchmark Worker,
private service-bound authority/operator entrypoints, actual D1/provider metering,
HTTP controller transport, synthetic-only encrypted resumable import/verification,
fenced source audit and staged disposable-target clearing. Clearing and each cursor
advance are transactional; retry after final lost response cannot erase reimported
pages. Complete lost-index inventory uses pinned provider IDs and original clocks.
No migration was added. These are local results, not hosted or full-stock RTO proof.

Evidence (ignored `outputs/authority-preparation/20261018-*`): integration28/28,
compiled private harness1/1, source audit/import2/2 (51,003 synthetic rate-limit
rows plus populated accounting/holds/closures/suppression), adapter8/8. Complete
gate lint/typecheck/unit passed; data343/343 and rendered34/34 passed after repair.
The first lint failure was generated bundled code in an unsuitable output path;
the packager now uses the existing ignored generated-bundle directory, with no
lint-rule weakening. An initial clear-stage regression was fixed and rerun.
Remaining browser/release stages finished exit0, including all five regional
compiled entry flows and Chromium/WebKit exact refresh recovery. Final compiled
benchmark rebuild passed1/1, source49443034a744135a29447caa1f0c80e445bd9988949c7ee0887b1ced34e61983
(later runtime changes require a fresh compiled check before deployment).
The compiled actual-client-shaped fixture passed after removing an extra harness
selection lookup before every answer. The application still validates owned
question/option references; a new invalid-reference rejection assertion remains.
Local one-game totals including refresh+completion replay:28 provider HTTP,
845 private calls,141 writes,4,352 reads,4 encrypted objects. These are local
observations (timing/rate-limit writes vary), not hosted throughput or pricing.
Per-operation upper reservations and tested HTTP transport have been added;
actual hosted commissioning/controller lifecycle and recovery remain unfinished.

Pinned inventory now persists the exact source-fence hash in its local control
journal and encrypted root; a changed fence on resumed capture fails. This is a
local SQLite control table only, not migration0014 or an application schema change.

Corrected PhaseC descriptor to36,000 answers/3,000 games, at most7,000 dependent
rows, plus3,000 arrivals, within the approved10,000 dependent-row cap. The old
150,000-answer/7,000-parent descriptor was impossible at12answers/game. This
smaller coherent fixture only measures bounded drain; it cannot prove the entire
48-hour production backlog. No cap was raised or hosted load sent.

Still incomplete: provider driver orchestration/provisioning and exact metered
upper bounds; complete segmented authority-boundary release/suppression integration;
full-stock hosted import/recovery; PhaseC fixture/purge endpoints; actual benchmark
and final capacity/cost assessment. Do not describe these as completed or solely
owner-blocked. £150 remains planning only; £50/£8 approvals remain unchanged.
The local integrated recovery controller now connects segmented capture, encrypted
restore-plan delivery, pinned full inventory, total file-index loss/reconstruction,
fenced source audit, staged clearing, interrupted import and complete verification.
It persists encrypted progress and keeps application access blocked; it is not a
fresh independent authority/suppression receipt or a production activation.
The populated integration regression interrupts after index loss, clearing and
import, and reads back a lost capture response without another effect. It compares
wallet/ledger/order/event/hold/closure/suppression rows exactly after restoration.
New provisioning regressions preserve a durable pre-POST intent and reject unknown
pagination, pre-existing names and lost create responses rather than duplicating
resources. New B/C preparation state retains every resource/credit reservation;
its one-way measurement start cannot reset an active/stopped run or the old PhaseA.
Fresh headroom is mandatory before that transition. This local control change adds
no application schema migration. Evidence:20261018-controller-final.log,
20261018-preparation-budget.log,20261018-provision.log and controller lint log.
Owner purchase decisions are recorded in `owner-purchase-review.md`: territory
names pending; refund draft approved for final review; escalation Classes for
Culture; saveable confirmation plus email selected; adult-audience draft delegated.

Prior counter18 transactions/450 reads is superseded by4/478 above. Per-operation
precommit intents/full-history recovery and snapshot fences still need retained-stock
evidence. Continue authorised local stock-recovery/driver preparation; hosted benchmark
has conditional approval above but review/headroom gates remain. GBP50 sufficiency unverified;
source sensitivity~GBP42–203/month,not a quote/cap. Only approved Workers Paid
activation has occurred; no Netlify upgrade, top-up or additional paid service.
Owner confirms Stripe setup complete; do not repeat setup. Remaining seller terms,
territories,durable contract confirmation and secure WEBSITE address installation:
[exact decisions/cutover plan](production-preparation-continuation.md).
Production catalogue/runtime,recovery-at-stock,approved schedules,live Stripe and
classesforculture.com cutover/rollback remain gates. Owner policy is not legal sign-off.
