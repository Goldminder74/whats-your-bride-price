# Private operational runtime

## Local continuation — 13 October 2026

Current architecture/5,000 completed games/day/GBP50 ceiling retained;500k redesign
and benchmark deferred. New code below is local, not deployed or activated.

Production commerce now selects the existing atomic20/minute/owner D1 limiter only
with `production-app` role/private authority binding. Recovery fences before/after
admission reject missing/changed authority. Ephemeral buckets grant no money/access;
financial repositories remain journalled. Private payment wiring/defaults unchanged.

Private `RecoveryOperator.maintain(boundaryId,limit)` requires
`WYBP_OPERATIONS_ENABLED=true`, boundary ID beginning `op_`, limit1–100. It checks
recovery, runs existing approved retention through authority, delivers/readbacks a
snapshot, rechecks readiness, then sends a minimal external heartbeat. Missing
monitor configuration stops before purge; any failure cannot report success. There
is no HTTP management route, cron or automatic retry. Use a new boundary per new
run; privately reconcile interrupted boundaries before retry. No cross-provider
atomicity or sustained-capacity promise. Existing retention/holds are unchanged.

Pending configuration in ops only: Secret `WYBP_HEARTBEAT_URL` (full private HTTPS
ping URL); variable `WYBP_HEARTBEAT_HOST` (exact hostname); variable
`WYBP_OPERATIONS_ENABLED` absent/false until capacity/cadence/recovery gates and
activation approval. Nothing installed/changed hosted. Transport refuses redirects,
waits<=10s, sends only component/status/time. Provider2xx is not alert receipt proof.

A free [Healthchecks.io](https://healthchecks.io/) monitor is a compatible candidate,
not a configured independent service. Owner accepts account terms, chooses the
existing monitored noreply@ recipient, keeps it paused and securely installs the
URL after setup agreement; never paste it in chat. Test actual missing-ping detection
before jobs. SMTP alone cannot detect total provider outage. Do not repeat the
already received labelled test alert. A separately monitored custody receipt/key
emergency copy remains required; a personally controlled second copy is not absence cover.

Evidence:21 focused checks,2 actual compiled Worker RPC checks, typecheck/scoped lint,
secret-free synthetic matched build/package verification (143 server modules).
Compiled checks confirm maintenance disabled/HTTP404. Logs ignored under
outputs/authority-preparation/launch-continuation-*. Initial sandbox workerd/Vite
startup restrictions resolved by the same local checks with required filesystem/network
access. No hosted deployment/migration or extra alert; no newly measured load.

`wrangler.operations.jsonc` packages `wybp-prod-ops-r001`. Both HTTP entrypoints
return 404; workers.dev, preview URLs, logs and scheduled handlers are disabled.
`ApplicationAuthority` exposes fenced transactional recording through a private
service binding. `RecoveryOperator` additionally exposes delivery, boundary
verification and the separately gated, single-claim labelled test alert. Never bind
the operator entrypoint to the public application or expose it through an HTTP bridge.

The deployed private version is `7de3483b-f7ac-4440-a7db-72c3151cb9c4`.
On 13 October all six Secret names were confirmed without retrieving values.
The approved isolated D1 `wybp-prod-d1-r001` was created in WEUR, UUID
`a5b2b409-ed08-48c9-ac1d-36699fc6c4b9`, and bound only to this operational Worker.
Empty inventory preceded import; all 14 unchanged migrations 0000–0013 and their
hosted checksum receipts match Git. No catalogue, wallets or application data imported.

## Secure installation — completed Google setup stays intact

Use the Cloudflare dashboard, account `b6b22a9a87b5758725e5c499782160af`, Workers &
Pages → `wybp-prod-ops-r001` → Settings → Variables and Secrets. Add encrypted
secrets directly there; do not send values to chat, terminal recordings or builds:

- `WYBP_DRIVE_CLIENT_ID`, `WYBP_DRIVE_CLIENT_SECRET`, `WYBP_DRIVE_REFRESH_TOKEN`:
  use the dedicated WYBP Recovery Operator credentials already saved securely.
- `WYBP_AUTHORITY_KEY_BASE64`: the separately preserved 32-byte encryption key in
  base64. Confirm secure retrieval of its recovery copy before use. Do not replace
  a key already associated with an archive.
- `WYBP_SMTP_USERNAME`: `noreply@classesforculture.com`.
- `WYBP_SMTP_PASSWORD`: that mailbox's supported SMTP credential, entered directly.

Do not change OAuth publishing status, repeat consent or broaden `drive.file`.
Folder access still requires verification: an arbitrary manually created folder is
not automatically accessible under `drive.file`. Use an app-created private folder
or an explicit supported grant, then configure its verified `WYBP_DRIVE_FOLDER_ID`.
No folder ID is guessed. Sender and monitored recipient are both noreply@ here;
they are separate roles. Transport uses Namecheap implicit TLS on port 465.

The private `verifyCredentials` RPC performs only a synthetic encryption round trip
and Google token refresh; it returns booleans or controlled diagnostic codes, never
tokens or provider text. An authenticated remote service binding from a loopback-only
local caller was verified. It creates no public endpoint or hosted caller resource.
Initial checks returned `invalid_grant` using the old active version. Dashboard
secret edits had created undeployed versions; activating the owner's saved version
resolved the check. OAuth refresh and synthetic encryption round trip now pass.
For future secret edits, verify deployment/version state before asking for new consent.

Before database/backup/alert RPC tests, inventory/create only the already approved isolated production
D1 within free allowances, verify unchanged migrations 0000–0013, establish the
approved initial recovery boundary/receipt, and bind that exact database. Pin
`WYBP_RESTORE_RECEIPT_SHA256` to the verified receipt. Never use the existing test
database or fabricate a receipt to bypass the gate. A trusted private service-binding
caller is required; the compiled local caller is a test fixture, not a hosted caller.

## Observed live commissioning — 13 October

Only private RPC via authenticated remote service binding and a loopback-only caller
was used. No hosted caller/public route was created. The app-created private folder
`1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr` has one owner-user permission, no sharing.
Encrypted synthetic file `1eSo8Jjx2-mYuvwolc7GwVA1iS7uV1Z44` was uploaded, downloaded,
decrypted and checked. Ciphertext SHA-256:
`17f78fd019fc39a6d5a27884515dc2d5774948b981659bd4239c402e542e6638`.
Repeat calls and two concurrent RPC calls preserved the same file ID/hash. A fresh
custody instance validated the pinned inventory and idempotently recovered mappings;
this was not a destructive loss-of-index rehearsal.

Operator-only empty-baseline commissioning refuses any application or outbox rows,
verifies an encrypted snapshot and then records its receipt. It cannot overwrite a
conflicting receipt. Pinned empty-baseline receipt:
`2860bffa5489697ce3828b40549ee10ef6972bebd3bf4f6092513571550834f0`.
Fresh-instance boundary verification and read fence pass; a wrong receipt is denied.
This proves an empty source boundary, not restoration of customer data or wallets.

SMTP accepted the single labelled test alert to noreply@classesforculture.com;
owner confirmed mailbox receipt on 13 October 2026. The durable test claim is complete and
the approval flag is false again. Never repeat it merely because receipt is pending.
No jobs, live payments, public game or existing-site changes were activated.

## Verification and limitations

### Hosted populated restore and full-inventory recovery — 13 October

Completed in existing isolated D1 `a5b2b409-ed08-48c9-ac1d-36699fc6c4b9`, never
bound to public application routes. Existing private-game D1, websites, payments,
keys and alert were untouched. No resource, migration, paid plan or schedule added.

`scripts/prepare-hosted-recovery.mjs` prepares synthetic data only. The exact bundle
is pinned at `7124b17522a6d2028b3a615a30ab3646807f61161a2aadb1d8fc144cdfe383c6`.
It contains 39 import pages, complete expected rows/triggers and original cleanup
definitions; runtime credentials/key never enter preparation. The private Worker
encrypted it in Drive, downloaded/decrypted that archive for each bounded import,
and checked the pinned content. Ciphertext file `1tjVwt99nxDCzvkjynt_GRtiyD8OoQ6BL`,
SHA-256 `6d35f40a8574f8cbfd5644567e20b6dfcb46a523ad89bb732dfed3c8e30517b2`.
Its original reservation expires 12 November2026,12:12:37.563UTC. Preserve that clock;
existing bounded cleanup is required by then while scheduled operations remain off.

Forced two-file Drive pagination captured all five files, including clocks and hashes.
Full inventory receipt:
`7f6cc6ffd12fc7b5bb17ba94a7d799b0ff151d3921c0a1cc5dcc60e5974c2ecc`.
All five file mappings were removed under the recovery fence. Reconstruction stopped
after two mappings; actual read-fence access remained denied. A fresh RPC resumed all
five, then a separate phase verified complete inventory and baseline bytes before
unfencing. No file duplication or retention-clock renewal occurred. The root folder
configuration and non-file operational authority were deliberately preserved.

First attempts rolled back without removing mappings: D1 rejected the long LIKE
pattern. Its documented limit is [50 bytes](https://developers.cloudflare.com/d1/platform/limits/).
Exact substring-prefix equality now scopes both loss and expiry queries. Focused
tests enforce this provider constraint and reject cross-folder cleanup. Temporary
redacted metadata diagnostics were removed; only controlled error codes remain.
A local minimal D1-binding diagnostic stalled and was stopped; no hosted mutation
occurred from that diagnostic. The actual hosted execution supplies the result.

Hosted import deliberately stopped after its first committed page, denied premature
completion/access, then resumed all39pages. Eight-table reconciliation batches compare
all quoted values, triggers and foreign keys, including more than100support records.
Verified: one refunded order and its ledger/allocation relationships,123closed support
cases, one legal hold, permanent wallet closure, deleted attempt/result, duplicate
execution without extra orders, and rejection of wallet reopening/balance corruption.
No access receipt was restored while populated synthetic data existed.

Nine bounded cleanup pages removed only this pinned fixture and restored the original
triggers. All business tables/foreign keys/schema were reconciled;14migration receipts
remain. The original empty baseline was read back before restoring its operational
receipt. This is active-table cleanup, not a claim of physical erasure from provider
history. Evidence remains encrypted under the approved backup window.

Final private version `7de3483b-f7ac-4440-a7db-72c3151cb9c4`:
`WYBP_HOSTED_REHEARSAL_ENABLED=false`, alert gate false, no public URLs/cron.
Actual final read fence passes and rehearsal calls are denied. Future rehearsal needs
explicit scoped re-enablement; never target real data with these synthetic operators.

Evidence under ignored `outputs/authority-preparation/`: full-inventory-receipt.json,
full-inventory-recovery-live.json, hosted-populated-restore-live.json,
hosted-recovery-cleanup-live.json, hosted-final-empty-counts.json, hosted-final-gates.json,
hosted-focused-final.log(30/30),hosted-package-final.log(10/10).
No full application/key/alert checks repeated. Local plaintext material is synthetic only.
Full inventory receipt material currently has a local evidence copy and a Git/runtime
hash anchor; independent durable private receipt custody remains a production gate.
This correctness fixture does not benchmark5,000games/day, outage catch-up, purge
deadlines or production recovery time. No new operational or legal guarantee is implied.

### Populated recovery continuation — 13 October

The new offline `scripts/worker-snapshot-restore.mjs` materialises the actual
`wybp-d1-pages-v1` encrypted Worker format, validates every page/hash/count, restores
indexes before foreign-key checks, and installs accounting triggers after historical
rows so they cannot create duplicate ledger effects. It never opens runtime access.
Existing `providerRestorePlan`, `restorePages`, reconciliation and suppression tools
then restore into an isolated local target. The new end-to-end synthetic test proves
accounting relationships, closed-wallet permanence, legal holds, deleted attempts and
results, interrupted/resumed import, no duplicate orders, wrong-key/missing-page
denial and a fresh receipt gate. This is local evidence; the populated Worker-format
restore has not yet been repeated against hosted D1.

Lost-index recovery exposed a retention gap: old inventories omitted reservation
clocks. New D1 inventories pin original `createdAt`/`expiresAt`; recovery refuses
missing, conflicting or expired clocks rather than restarting the approved 30 days.
Old receipts remain historical evidence, but cannot reconstruct a lost production
D1 mapping without independently verified original clocks. No migration is needed.

The new pinned synthetic inventory receipt is
`705351dcb06bd11cc42ac784173c7c33468707a0255d4c1342e5b6cd6ee5363a`.
Private operator RPC removed only the mapping for `synthetic-commissioning-v1.enc`,
reconstructed it from this pre-pinned receipt and verified encrypted Drive bytes.
Live execution and repeat both preserved the exact file ID and original expiry.
No archive was replaced, no new Drive file was uploaded, no application data changed,
and no alert was repeated. Latest private Worker:
`2b2f27c3-d26e-4969-b55e-265757238ffb`; public endpoints/schedules remain absent.

Focused evidence: `outputs/authority-preparation/populated-recovery-final.log` (12/12),
`recovery-operations-final.log` (10/10 actual compiled/safety checks),
`synthetic-index-recovery-receipt.json` and `lost-index-live.json`.

Owner-supplied saved key copy verified on13October2026. Their temporary encrypted
Secret version `cc3f7e3e-131f-44c7-bc0b-21b6e94b8159` was explicitly deployed;
private `verifyIndependentKeyCopy` returned syntheticArchiveDecryptionVerified=true.
It decrypted the existing encrypted synthetic Drive file without displaying or replacing
the primary key. Temporary Secret deletion and absence were verified; resulting deployed
version `97ecac41-8a50-4e02-bb6e-8126fea472dd`. The first removal command used an
unsupported --force option and made no change; the supported confirmation flow succeeded.
Evidence:ignored key-copy-live.json,key-copy-removal.log,key-copy-final-deployments.log.
No alert repeated. This is cryptographic verification of the supplied copy; physical
storage independence/emergency access remain owner-reported and not independently audited.
No independent custodian is confirmed. Never request key values in chat or rotate the
primary key merely to repeat this check.

Run `npm run test:operations` for an actual Wrangler package and private RPC tests.
The compiled success regression reproduced an unsupported `redirect:error` failure;
OAuth and Drive now use manual redirects and reject unsuccessful responses. Explicit
redirect-denial tests preserve the no-credential-forwarding protection. Default fetch
wrappers also preserve the native receiver when passed through custody objects.
Snapshot pages are encrypted, read back, decrypted and compared; immutable names
reuse ciphertext on retries. Schema, counts, pagination bounds and authority fences
fail closed on mismatch. SMTP failures are sanitised; a lost final acknowledgement
is uncertain delivery, never evidence of mailbox receipt. The single test-alert
claim prevents automatic resend after uncertainty. Investigate rather than reset it.

Hosted encrypted SQL-page restore, suppression/accounting and full folder-inventory
recovery are now verified above. Remaining gates include automated production capture
and snapshot-materialisation integration, durable independent receipt custody/emergency
access, and continuous delivery/monitoring. The alert receipt is owner-confirmed.
Do not activate production schedules. Snapshot capture is bounded
to 1,000 pages per invocation by default; production capacity and the fully automated
hosted snapshot-to-materialisation pipeline remain unverified. Local Worker-format
tests and the hosted encrypted SQL-page rehearsal are complementary evidence, not a
single production-scale end-to-end pipeline or an independent custodian.

Evidence is ignored under `outputs/authority-preparation/`: operations-final.log,
operations-recovery.log, operations-lint.log, ops-deployment.log and d1-inventory.json.
New receipts: credential-live-status.json, synthetic-custody-live.json,
empty-baseline-live.json, commissioning-final-live.json, alert-live-status.json,
production-migration-checksums.json and commissioning-final-tests.log (10/10).
These local logs are not durable independent backup custody. Existing application
deployment, database, wallets, website, DNS and payment settings were not changed.

## 15 October isolated monitoring verification

The owner created the existing free Healthchecks account/check, selected the daily
monitored noreply@classesforculture.com recipient and securely installed Secret
WYBP_HEARTBEAT_URL plus exact-host variable WYBP_HEARTBEAT_HOST=hc-ping.com.
Do not request Google credentials or repeat the previously received SMTP alert.

Private ops version09b6acb0-f2af-45bb-a3ca-04591c5453e0 adds RecoveryOperator.verifyHeartbeat:
private RPC only, fixed synthetic status, no database/retention work, no URL returned.
Both HTTP surfaces remain404; operations activation is absent/false, rehearsal false,
no cron/public routes. The existing supported Wrangler remote service binding returned
{accepted:true,synthetic:true}; this verifies installed-secret delivery, not outage alert
receipt or a running production schedule. Installed hostname was read back without secrets.
Owner temporarily resumed the same check at1-minute period+1-minute grace for a
controlled missing-ping test. One ping accepted, then intentionally no further pings.
Owner confirmed Down state, receipt of the down-alert email, then paused/restored the check. This is owner-observed provider/receipt evidence, not dashboard readback. Final agreed state is PAUSED,1day/1hour temporary defaults;
production cadence remains unapproved. Logs/receipts under
outputs/authority-preparation/20261015-final-gates/heartbeat-*.json; no credentials in Git.
Focused source/compiled RPC checks preserve missing-config denial and HTTP isolation.
