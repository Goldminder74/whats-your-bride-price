# Private retention operations

Prepared 8 October 2026. Local implementation and owner-approved policy only;
no hosted execution, legal professional sign-off or feature activation is implied.
The six rules and authoritative closure definition are in [the schedule](retention-schedule.md).

## Schema and authority

Apply unchanged migrations 0000â€“0011 followed by the single additive
`0012_retention_authority.sql`, only after separate hosted approval. Exact hashes
are in `drizzle/migration-checksums.json`. The seven private authority tables store
holds, minimal support/privacy/refund/dispute case references, verified settlement
receipts, immutable closures, irreversible financial minimisation, rolling restore
suppression and the current restore receipt. No public route exposes these operations.

`node --experimental-strip-types scripts/private-retention.mjs --action <private-json>`
is a local dry run. Apply additionally requires `--apply --remote
--approve-target <actual-test-D1-UUID> --approve-action <input-SHA256>`.
The securely supplied `CLOUDFLARE_API_TOKEN` must have access to the exact isolated
account/database. Never place it in commands, Git, client builds or logs. Every apply
rechecks database name/UUID, complete migration ledger, schema hash and foreign keys.
Input is bounded and identifiers validated; errors do not log credentials or input.

Action JSON uses `operation`: `hold`, `release-hold`, `open-case`, `close-case`,
`settlement`, `close-wallet` or `erase`; see `operatorRetentionPlan` for exact fields.
Each new authority has an evidence hash pointing to privately reviewed evidence,
not a claim that the operator supplied cultural or professional legal approval.
Holds can cover global, wallet, order, attempt, result or case subjects. Unknown or
conflicting authority fails closed. A verified settlement must match the persisted
signed Stripe event, exact order/allocation and controlled refund/dispute reason.
Consumed or partial adverse balances remain review-required.

Final closure is an explicit operator action after every pending payment/reversal,
remaining purchased value, case, legal hold and reconciliation requirement is resolved.
Clearing, freezing, inactivity and expiry never close a wallet. The timestamp is
immutable; repeat calls cannot restart it. Closure disables recovery immediately.
Thirty days later wallet owner/recovery hashes become a common non-authenticating
zero marker, never a replacement credential. Financial order ownership is retained
only through the longer statutory/case/dependency period, then minimised atomically
with entitlement ownership. Amounts, ledger history and allocation/order lineage
remain immutable. Active cases/holds stop affected purge, not access expiry.

## Maintenance and custody

`runTestRetention` now uses the approved bounded purge. Each statement changes at
most the configured limit (1â€“100); answer rows drain over repeated passes. Held
proof remains inaccessible after ordinary expiry. Support/privacy case authority
uses 12 calendar months; refund/dispute authority uses six calendar years, with
annual human necessity review. Statutory accounting uses UK tax-year boundaries
in Europe/London and retains through the fifth anniversary of the filing deadline.
The 400-day webhook technical deadline never erases unresolved or necessary proof.

At future activation, monitor aggregate backlog and oldest eligible deadline;
size/schedule the bounded job to meet the seven-day physical-purge requirement.
Do not enable cron until the owner separately approves it. No identifiable deletion
event log is added. Minimal suppression IDs are solely for the 30-day recovery window.

Ayodele Ayeni/team@classesforculture.com must maintain restricted case correspondence
and accounting export custody outside the application. Mail/export deletion and
annual claim review are operational duties, not automated mailbox integration.
Erase unnecessary case fields; retain only necessary proof under documented holds.
Operational exports roll off within 30 days; accounting/held-case exports follow
their approved period and are removed within 30 days afterwards. Research evidence
archives in Google Drive are separate and unchanged.

## Restore procedure â€” mandatory before any access resumes

1. Disable data/payment access and cron; remove the separately configured runtime
   `WYBP_RESTORE_RECEIPT_SHA256` before a D1 restore. Keep the protected all-off release.
   The application cannot detect a privileged, unannounced provider rollback by itself.
2. Independently preserve the latest suppression/hold/case/closure authority.
   Private read-only export: `--export-suppression --remote --approve-target <UUID>
   --output outputs/retention-authority/<new-name>.json`. No overwrite or Git commit.
   Export is explicitly **unreviewed**, never a ready-to-use activation receipt.
   More than 100 records in any export category stops for bounded recovery handling.
3. Restore into the isolated test database. Reconcile signed payments, ledger,
   allocations, settlements and pending reversals first. Reapply active holds and
   case authority from the independent copy, preserving original clocks. Missing or
   conflicting financial/closure dependencies abort; never manufacture ledger entries,
   release a hold, forfeit value or restart a closure clock to make a restore pass.
4. Review a bounded manifest containing `policy: "retention-v1"`, actual `databaseId`,
   `entries`, `activeHolds`, `cases`, `closures`, `backupWindowMaxDays: 30` and current
   `reviewedThrough`. The three reconciliation confirmations must be true only after
   actual financial, hold and case review. Input age is at most 15 minutes.
5. Run `--restore-manifest <file> --approve-backup-review <file-SHA256>` as dry run,
   then the separately approved apply flags above. Suppression never restores access
   or changes balances. Receipt installation is atomic with reviewed replay.
6. Install the matching manifest hash in the separate Worker runtime setting only
   after success. Verify erased/expired and closed-wallet denial, holds, reconciliation
   and ownership before reopening the private data profile. Missing/stale receipts
   return neutral unavailable; neither a restored DB flag nor a browser parameter
   can authorise access. Retain suppression copies no longer than the recovery window.

Independent operational journal custody/verified restore practice must be arranged
before activation. The existing nonpersonal evidence backup does not prove it.
Cloudflare documents seven-day Free/30-day Paid recovery and transactional deferred
foreign keys; live account/provider controls remain a hosted verification gate.
Owner policy approval is not professional legal sign-off.

## Measured local restoration and capacity — 8 October 2026

`npm run test:activation-readiness` includes a failing-before-fix starvation
regression, actual file-backed SQLite restore, repeated authority replay and real
Miniflare D1 migration/purge checks. The prior parent query repeatedly chose the
oldest 50 expired attempts even after their answers drained, starving later child
rows. Parent eligibility is now unrestricted; each child deletion remains bounded
by the unchanged 1–100 limit. Holds and accounting protections are unchanged.
No migration was added or altered.

The file-backed rehearsal copies a pre-operator snapshot, independently reads its
checksum-verified authority, reconciles persisted verified settlement, replays
original case/closure/hold clocks twice, and requires matching external receipt
before access. Deleted results/attempts remain unavailable; closed wallet ownership
and recovery fail. Active holds protect proof and owner links; after release,
already-due minimisation proceeds without touching immutable accounting lineage.
A later restored pre-minimisation snapshot is re-minimised, not reopened. The
separate Drive-downloaded synthetic database/authority also passed these checks.

Recorded measurements, **local only**, at default limit 50:

| Engine / volume | Passes | Purge time | Schedule at one pass / 15 min |
|---|---:|---:|---:|
| SQLite, 1,000 completed quizzes / 12,000 answer rows | 240 | 2,129 ms; p95 13 ms/pass; 5,636 answer rows/sec | 60 hours |
| Miniflare D1, 120 completed quizzes / 1,440 answer rows | 29 | 2,017 ms; about 714 answer rows/sec | 7.25 hours |

Timings exclude fixture/migration setup and are not hosted Cloudflare benchmarks.
Each table's deletion remains separately bounded. At the proposed schedule,
answer-row capacity is 4,800/day or 33,600/week (400 twelve-answer quizzes/day;
2,800 in seven days), assuming uninterrupted jobs and no new backlog. Ongoing
arrivals, retries, outages, holds and dependency delays reduce spare capacity.
A 5,000-quiz answer backlog would take 300 hours and **miss seven days**.
Monitor oldest eligible age and backlog per table, prove hosted completion within
the budget, and approve an adjusted bounded schedule/limit before larger volume.
Do not claim an unconditional deadline guarantee from these local measurements.

Current export/restore authority is deliberately capped at 100 records **per
category**, with a 64 KiB input cap; exceeding either fails closed. Automatic
independent journaling, unbounded/paginated restore and provider-level restore are
not implemented or verified. An isolated owner trial must stay below those limits;
scalable independent custody is a prerequisite for broader activation. Before any
provider restore, follow the all-off/external-receipt-removal procedure above and
reconcile the latest independent authority. A privileged unannounced rollback
cannot be detected solely by application state. No live job was activated.


## Readiness audit — 9 October 2026

Current source: `62df79596e16dfa176730c73837cc693a8b6000a`.
The four isolated local rehearsal checks passed again against the audit-timestamp
correction. SQLite drained 12,000 answers in 240 bounded passes, 2,009 ms total,
p95 11 ms/pass (about 5,972 rows/sec). Miniflare D1 drained 1,440 answers in
29 passes, 2,468 ms. These measure local execution, not a hosted deadline guarantee.
File-backed restore replay preserved original holds/closure clocks and accounting
lineage, suppressed deleted/closed access, survived repeated replay and re-minimised
an older snapshot. No hosted purge or restore ran. The existing test database exposes
a current Time Travel bookmark; this verifies availability, not successful restoration.

The timestamp correction does not alter expiry, retention eligibility or financial
protection. Seven earlier processed sandbox events still have unknown processing
timestamps; no dates were manufactured. Operational backup review must preserve
that uncertainty rather than treat a new replay as historical processing proof.

### Exact work and approval still required

1. **Independent operational custody:** appoint the accounting/support custodian and
   approve a restricted, encrypted rolling database/authority export destination,
   access list and verification procedure under the already approved retention
   periods. Google Drive research/synthetic archives do not back up current payment
   records. Automated independent journaling and recovery beyond 100 records/category
   or 64 KiB are missing implementation, not settings to switch on. Approve scoped
   checkpointed/paginated export and restore development before exceeding those caps.
   Preserve financial dependencies and apply the existing 30-day operational window;
   do not invent a longer identifiable suppression log.
2. **Provider restore rehearsal:** separately approve either an isolated rehearsal D1
   within existing allowances or a maintenance-window restore of the existing test D1.
   Do not restore production. Before any restore: verified current export and independent
   latest authority, protected all-off release, cron off, external restore receipt
   removed. Afterwards reconcile signed payments/ledger/allocations, reapply holds,
   cases, closures and suppression, verify inaccessible records and accounting, then
   install a fresh reviewed receipt before reopening. Time Travel cannot currently
   clone a database; an in-place rollback needs explicit approval and a recovery plan.
3. **Hosted capacity proof:** separately approve synthetic hosted benchmarks, their
   exact database/volume and allowance ceiling. Measure the complete scheduled path
   (including bonus expiry and unissued-play reversal), CPU, query counts, rows read/
   written, backlog age, held dependencies and outage catch-up. Current local figures
   cover the approved purge, not every scheduled workload. No benchmark data or job
   was added to hosted storage here.
4. **Volume/schedule decision:** supply expected peak games/day, existing deletion
   backlog and outage allowance. At 50 answers every 15 minutes, theoretical capacity
   is 4,800/day or 33,600/week before arrivals/outages; 5,000 twelve-answer quizzes
   need 300 hours and miss seven days. A five-minute schedule at the same bound would
   triple theoretical capacity but remains unapproved/unverified on the host. Approve
   the measured schedule, monitoring/alerts and operator escalation before enabling
   any cron. The current scheduled entry is explicitly test-only, not production wiring.

Provider documentation checked 9 October 2026:
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) is always
on, has no additional history/restore charge and retains seven days on Free or
30 on Paid; this is not independent custody. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
include invocation/query-duration limits.
[Free-tier enforcement](https://developers.cloudflare.com/changelog/product/d1/)
stops queries at account daily limits until midnight UTC; include all account usage
and index writes in hosted capacity budgeting. No plan or charge was approved here.
Owner policy approval remains distinct from professional legal sign-off.
