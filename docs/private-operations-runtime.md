# Private operational runtime

`wrangler.operations.jsonc` packages `wybp-prod-ops-r001`. Both HTTP entrypoints
return 404; workers.dev, preview URLs, logs and scheduled handlers are disabled.
`ApplicationAuthority` exposes fenced transactional recording through a private
service binding. `RecoveryOperator` additionally exposes delivery, boundary
verification and the separately gated, single-claim labelled test alert. Never bind
the operator entrypoint to the public application or expose it through an HTTP bridge.

The deployed private version is `97ecac41-8a50-4e02-bb6e-8126fea472dd`.
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

Remaining gates include a complete restore of populated snapshot pages with authority
suppression/holds/accounting, independent custody/emergency access, full-inventory recovery,
continuous delivery/monitoring. The single labelled alert's receipt is owner-confirmed.
Do not activate production schedules. Snapshot capture is bounded
to 1,000 pages per invocation by default; production capacity and a complete restore
of this snapshot format remain unverified. Local recovery tests do not establish
hosted recovery, continuous delivery or an independent custodian.

Evidence is ignored under `outputs/authority-preparation/`: operations-final.log,
operations-recovery.log, operations-lint.log, ops-deployment.log and d1-inventory.json.
New receipts: credential-live-status.json, synthetic-custody-live.json,
empty-baseline-live.json, commissioning-final-live.json, alert-live-status.json,
production-migration-checksums.json and commissioning-final-tests.log (10/10).
These local logs are not durable independent backup custody. Existing application
deployment, database, wallets, website, DNS and payment settings were not changed.
