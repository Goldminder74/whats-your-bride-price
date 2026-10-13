# Private operational runtime

`wrangler.operations.jsonc` packages `wybp-prod-ops-r001`. Both HTTP entrypoints
return 404; workers.dev, preview URLs, logs and scheduled handlers are disabled.
`ApplicationAuthority` exposes fenced transactional recording through a private
service binding. `RecoveryOperator` additionally exposes delivery, boundary
verification and the separately gated, single-claim labelled test alert. Never bind
the operator entrypoint to the public application or expose it through an HTTP bridge.

The deployed inactive version is `f008404e-e5a5-4cca-8786-750e780b667e`.
Readback on 13 October confirmed that version and an empty secret list. Account
inventory contains the existing test D1 only; no production database is bound.
This is runtime preparation, not activated recovery or a verified live backup.

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

Before any RPC test, inventory/create only the already approved isolated production
D1 within free allowances, verify unchanged migrations 0000–0013, establish the
approved initial recovery boundary/receipt, and bind that exact database. Pin
`WYBP_RESTORE_RECEIPT_SHA256` to the verified receipt. Never use the existing test
database or fabricate a receipt to bypass the gate. A trusted private service-binding
caller is required; the compiled local caller is a test fixture, not a hosted caller.

## Verification and limitations

Run `npm run test:operations` for an actual Wrangler package and private RPC tests.
Snapshot pages are encrypted, read back, decrypted and compared; immutable names
reuse ciphertext on retries. Schema, counts, pagination bounds and authority fences
fail closed on mismatch. SMTP failures are sanitised; a lost final acknowledgement
is uncertain delivery, never evidence of mailbox receipt. The single test-alert
claim prevents automatic resend after uncertainty. Investigate rather than reset it.

Live verification remains required: synthetic encrypted Drive delivery, stable IDs
across instances, retries, downloaded/decrypted checksums, authority recovery and
the labelled alert's mailbox receipt. Enable its approval flag only during that
approved test. Do not activate production schedules. Snapshot capture is bounded
to 1,000 pages per invocation by default; production capacity and a complete restore
of this snapshot format remain unverified. Local recovery tests do not establish
hosted recovery, continuous delivery or an independent custodian.

Evidence is ignored under `outputs/authority-preparation/`: operations-final.log,
operations-recovery.log, operations-lint.log, ops-deployment.log and d1-inventory.json.
These local logs are not durable independent backup custody. Existing application
deployment, database, wallets, website, DNS and payment settings were not changed.
