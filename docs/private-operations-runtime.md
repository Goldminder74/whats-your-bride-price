# Private operational runtime

`wrangler.operations.jsonc` packages `wybp-prod-ops-r001`. Both HTTP entrypoints
return 404; workers.dev, preview URLs, logs and scheduled handlers are disabled.
`ApplicationAuthority` exposes fenced transactional recording through a private
service binding. `RecoveryOperator` additionally exposes delivery, boundary
verification and the separately gated, single-claim labelled test alert. Never bind
the operator entrypoint to the public application or expose it through an HTTP bridge.

The deployed private version is `c06ce865-3656-4694-9873-75758b2c046a`.
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
suppression/holds/accounting, independent key-copy retrieval, lost-index recovery,
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
