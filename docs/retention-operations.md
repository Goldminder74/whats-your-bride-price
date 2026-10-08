# Private retention operations

Prepared 8 October 2026. Local implementation and owner-approved policy only;
no hosted execution, legal professional sign-off or feature activation is implied.
The six rules and authoritative closure definition are in [the schedule](retention-schedule.md).

## Schema and authority

Apply unchanged migrations 0000–0011 followed by the single additive
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
most the configured limit (1–100); answer rows drain over repeated passes. Held
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

## Restore procedure — mandatory before any access resumes

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
