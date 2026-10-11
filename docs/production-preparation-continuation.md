# Production preparation continuation — 11 October 2026

## Current local boundary

`worker/authorityService.mjs` supplies a private, dependency-injected authority
service and bounded delivery tick. It deliberately exposes no HTTP or cron handler.
`authority-runtime.mjs` no longer imports SQLite or filesystem code. The existing
operator imports/re-exports the same implementation, preserving recovery semantics.
D1 batch and query response failures, interrupted delivery, replay, sanitised alerts,
readback and monitor failure are covered by synthetic checks.

This is NOT complete production wiring. Application financial/closure/deletion
writers still need routing through the private authority service. Cross-instance
fencing and the durable Drive adapter now have synthetic validation; real credentials,
snapshot capture, independent custody and live heartbeat delivery remain unverified. D1 fencing remains authoritative; an
unresolved intent prevents a verified recovery boundary. No cross-provider atomicity
is claimed. Do not deploy or activate this service as production-ready.

## One consolidated monthly estimate

Owner confirms no other hosting or backup subscriptions. Recorded Netlify Personal
is USD9/month; proposed Workers Paid is USD5/month plus usage. At an illustrative
USD1 = GBP0.80 and a conservative 20% tax allowance, base estimate is GBP13.44/month.
This is an exchange-rate assumption, not a quote. Other subscriptions: GBP0.
Private Drive backup storage: GBP0 only while existing free capacity suffices.
Alerts: GBP0 proposed existing/free channel; delivery method remains unconfigured.
Cloudflare/D1 usage: provisionally GBP0–5 above base within paid allowances; journal
write amplification, Images and exported bytes must be measured. Netlify extra usage:
GBP0 only with recharge disabled and usage within included credits. Therefore a
provisional planning envelope is GBP14–25/month, NOT verified capacity at 5000 games/day.
Do not buy anything based on this estimate.

Netlify 1000-credit allowance is shared with existing sites; exhaustion can pause
all projects. Example assumptions: 150000 games/month, 40GB transfer (800 credits),
2 million web requests (400 credits), four production uploads (60 credits) total
1260 credits BEFORE existing-site usage: not sustainable on the included allowance.
The measured entry JavaScript alone is not whole-game bandwidth.
Workers Paid usage is metered, not a GBP50 hard cap. CPU limits and billing alerts
are not enforceable account spending caps. No provider upgrade is authorised until
actual charges/tax and workload headroom are reviewed against GBP50. Recharge stays off.

Official pricing:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/

## Smallest proposed hosted benchmark — NOT executed or scheduled

Reuse/create only the previously approved, unbound synthetic rehearsal database
`wybp-restore-rehearsal-r001`, after inventory and free-allowance headroom checks.
Apply unchanged0000–0013 with checksums; no application/service binding. Load 1000
synthetic games/12000 answers and representative synthetic holds/closed wallets and
protected financial dependencies. Preflight actual indexed rows-written estimate;
stop before the remaining account daily free allowance or any new charge.
Run 60 bounded passes at limit100, recording actual rows read/written, wall/CPU time,
removals and protected-row counts. Inject upload outage and interrupted delivery;
verify repeat/resume, independent readback and fail-closed recovery. No source data.
Download/check the encrypted archive in approved private Drive. Delete the unbound
rehearsal DB after receipts; expire archive under approved30-day backup rule.
No alteration of existing test DB, wallets, catalogue or live subscriptions.

This small sample measures per-pass cost, not a proven full48-hour backlog drain.
Extrapolate with measured worst-case throughput plus contention/outage allowance;
approve neither100/min nor any cron until verified capacity, financial dependency
mix and independent delivery throughput satisfy the seven-day deadline. A larger
paid-volume benchmark requires separate exact-cost approval.

## Converted-currency sandbox observations - 11 October 2026

Current explicit sandbox authority permitted dashboard access; no rejection occurred.
Verified Classes for Culture sandbox `acct_1UOOZKEsGCyaV3rl` (livemode=false).
Reused the existing five-Cowrie GBP1.99 Payment Link without changing its settings.
Two provider-only French test checkouts displayed EUR2.45. No application order or
client reference was supplied; commerce/webhook remained off and no wallet was credited.

First checkout `cs_test_a1yEfJ0YYXxWx96xc9lojudT4K7WbGme8cBTn6T3L73Cqt3HZaATiztdwH`
completed event `evt_1UPNx4EsGCyaV3rl4JoaMQiI` visibly reported amount_total199,
currencyGBP and presentment_details amount245/currencyEUR. Payment
`pi_3UPNx3EsGCyaV3rl1bGi5Efb` received a full GBP1.99 sandbox refund; dashboard
confirmed Refunded and GBP1.99 reversal. The checkout/refund provider observations
support retaining original-GBP purchase validation, not accepting arbitrary currencies.

Second payment `pi_3UPO3BEsGCyaV3rl1MVpI2of`, using Stripe's documented synthetic
fraudulent-dispute card, automatically produced dispute `du_1UPO3CEsGCyaV3rlzU5SiF4K`.
Observed `charge.dispute.created` event `evt_1UPO3CEsGCyaV3rlocQohvft` reported
amount191/currencyGBP against the GBP199-minor-unit payment. This is NOT proof of
an exact full-value dispute settlement. Preserve review-required handling; do not
round, overwrite historical values or remove purchased value from this observation.
Authoritative FX/dispute reconciliation and an application-linked converted settlement
remain launch gates. No dispute response was submitted. All fees were sandbox values.
No live charges, settings, accounts, application data or feature flags changed.

Official test-card guidance: https://docs.stripe.com/testing
Adaptive Pricing: https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing

## Delivery adapter and secure setup dependency

`DriveCustody` uses pre-generated Drive IDs, a durable atomic ID reservation,
immutable-content checks, complete paginated inventory and download/SHA readback.
A lost upload response resumes with the same ID; corrupt/duplicate/missing inventory
fails closed. Each encrypted chunk is capped at4MiB; larger archives must use existing
paged chunks, never silently truncate. Google documents retry safety for pre-generated
IDs: https://developers.google.com/workspace/drive/api/guides/manage-uploads#use_a_pre-generated_id_to_upload_files

Durable reservations now use existing0013 custody checkpoints, with folder/name and
reservation hashes. Provider deletion must be acknowledged before expired mappings
are forgotten. Pinned independent inventory receipts support index reconstruction;
this does not open the recovery gate. Runtime OAuth refresh is implemented, while
real credentials, private folder access, snapshot capture and alert transport remain
outstanding. No new migration or resource was introduced. Secure keys stay outside
builds and chat. Complete production writer coverage remains a separate integration gate.

Validation:44 affected synthetic recovery/archive/runtime/custody/OAuth checks passed.
Scoped lint, portable packaging and diff gates are recorded with this continuation.
No application entry point imports the inactive service; no unchanged application
suite was repeated. Provider compatibility and live failover are not locally proved.

## Durable runtime continuation — 11 October 2026

The private service now uses a cross-instance D1 writer checkpoint with a generation
fence on every authority batch. Lost acknowledgements keep access blocked; the same
stable operation can resume without another financial write. A replacement generation
invalidates an earlier still-running instance. No timeout silently steals an uncertain
operation. The 97-statement service limit leaves room for both journal statements and
the D1 fence within a 100-statement batch. Direct legacy operator calls remain exclusive
operator tooling; every future production application writer must use this service.

Drive ID reservations now persist as `custody` records in the existing0013 checkpoint
table. Opaque IDs contain the folder/name digest and provider file ID; hashes pin the
mapping. Atomic conditional insertion chooses one winner across instances. Reads/retries
do not renew the approved30-day window. Expired mappings are retained until provider
file deletion is acknowledged, rather than being forgotten before ciphertext cleanup.
Generic recovery cleanup excludes those mappings; Drive cleanup is bounded at50.
No migration, new table, new paid resource or hosted binding was introduced.

`inventoryReceipt` supplies names/provider IDs/ciphertext hashes. Keep that receipt
independently with the encrypted archive and key-custody record. After loss of D1,
`recoverIndex` requires the separately pinned receipt and verifies each file's folder,
name and downloaded hash before rebuilding mappings. Partial rebuilding does not authorise
reopening the application; the existing complete authority/restore checks are still required.
Current inventory recovery bounds:10000files,4MiB/chunk; larger volumes need a paginated
receipt design and measurement before production approval. No silent truncation occurs.

## Minimum secure Drive OAuth setup

Read-only runtime inspection on 11 October confirmed Cloudflare account
b6b22a9a87b5758725e5c499782160af. Intended Worker wybp-prod-ops-r001 was NOT FOUND.
There is no intended runtime to inspect/install secrets in yet. No matching OAuth
environment names or local environment-file paths were found. The previous test
Worker secret-name inspection found no Drive credentials. This does not establish
whether an unused client exists in Google Console or the owner's password manager.
A connected ChatGPT Drive account is not an unattended runtime credential.

Owner setup (ayo.m.ayeni@gmail.com only; no billing, purchases or broader scopes):

1. Open https://console.cloud.google.com/auth/overview and check the project selector
   for an existing dedicated recovery project/client. Reuse it if correct. Otherwise
   use https://console.cloud.google.com/projectcreate to create WYBP Recovery.
   At https://console.cloud.google.com/apis/library/drive.googleapis.com select that
   project and Enable the Google Drive API; do not attach a billing account.
2. In Google Auth Platform, Branding: app name WYBP Recovery; support/developer email
   ayo.m.ayeni@gmail.com. Audience: External (personal Gmail account), initially add
   only that account as a test user. Data Access: Add or remove scopes, enter ONLY
   https://www.googleapis.com/auth/drive.file. It permits app-created/app-selected
   files, including read/write/delete; full-Drive, Gmail, sharing and domain-wide
   delegation are unnecessary. This is Google's non-sensitive per-file permission.
3. Clients: https://console.cloud.google.com/auth/clients -> Create client ->
   Web application -> WYBP Recovery Operator. Authorised redirect URI exactly
   https://developers.google.com/oauthplayground (no trailing slash). No JavaScript
   origins needed for this manual flow. Save client ID and secret in the secure
   password manager. Never paste either into chat, arguments, Git or recorded output.
4. At https://developers.google.com/oauthplayground/ open the settings cog; enable
   Use your own OAuth credentials. Enter this dedicated client ID/secret directly.
   Choose server-side flow and offline access; use consent prompting when needed
   to obtain a refresh token. Step1: enter exactly the drive.file URL above, Authorize
   APIs, select ayo.m.ayeni@gmail.com, inspect the permission and approve only that
   scope. Step2: Exchange authorization code for tokens. Store the refresh token
   directly in the password manager. Do not send tokens or screenshots to Codex.
5. Check https://drive.google.com/drive/my-drive for an existing private WYBP Production
   Recovery folder before creating anything. An existing folder must already be
   accessible to this dedicated app or be selected through its Google Picker flow;
   merely pasting a folder ID does NOT grant drive.file access. If it exists but is
   inaccessible, stop and report that fact without widening the scope or duplicating it.
   If absent, OAuth Playground Step3 can create the app-owned private folder:
   method POST; URI https://www.googleapis.com/drive/v3/files?fields=id,name,parents;
   Content-Type application/json; body
   {"name":"WYBP Production Recovery","mimeType":"application/vnd.google-apps.folder"}.
   Use the authenticated Send request control; never copy its Authorization header.
   Record only the returned non-secret folder ID. In Drive confirm General access is
   Restricted; do not create public links or extra sharing. Use only synthetic data
   until encrypted upload/readback and recovery custody are verified.
6. Testing consent status causes this Drive refresh token to expire after seven days.
   Before unattended operation, Audience -> Publish app / In production. This OAuth
   setting does NOT publish the game or open the private folder. Re-authorize using
   the dedicated client after publishing. Non-sensitive drive.file does not require
   sensitive/restricted-scope verification; any branding/policy requirements displayed
   by Google still apply. Never call the token permanent: revocation, inactivity,
   token limits and account policy can invalidate it. Monitoring must detect refresh
   failure. Do not use Playground's shared client for the runtime token.
7. Install only after the intended isolated ops Worker exists and its identity/cost
   gate passes. In an unrecorded local terminal, run each command and paste its value
   ONLY into Wrangler's hidden interactive prompt:
   npx wrangler secret put WYBP_DRIVE_CLIENT_ID --name wybp-prod-ops-r001
   npx wrangler secret put WYBP_DRIVE_CLIENT_SECRET --name wybp-prod-ops-r001
   npx wrangler secret put WYBP_DRIVE_REFRESH_TOKEN --name wybp-prod-ops-r001
   npx wrangler secret put WYBP_AUTHORITY_KEY_BASE64 --name wybp-prod-ops-r001
   Never append values to commands, pipe them from a logged process or store them in
   environment files. Decline any prompt to create a missing Worker; stop on identity
   mismatch. The recovery key is verified32-byte base64 with a separately secured copy.
   Configure non-secret WYBP_DRIVE_FOLDER_ID, role production-ops, and DB name
   wybp-prod-d1-r001. No secret belongs in Netlify, the game Worker or a build.
8. Operator then verifies token refresh, private folder identity, encrypted synthetic
   upload, deliberately lost acknowledgement/retry, unchanged persistent file ID,
   download/hash/decryption and independent-key recovery. Retain a pinned inventory
   receipt outside the database; do not claim live delivery from local mock tests.
   No production job starts before those checks and reviewed scheduling/cost gates.

Official references:
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/oauthplayground/

## Alert approval and provider dependency

Owner has approved operational alerts to team@classesforculture.com, including ONE
clearly labelled test after secure configuration. Recipient confirmation is complete.
No email has been sent. prepareAuthorityAlert({test:true,...}) builds a fixed-recipient
[TEST - synthetic data] subject and status/timestamp-only body; no SQL, identifiers,
archive contents, provider messages or credentials. Its sendApproved:false field means
this helper does not authorise dispatch or provide a transport, NOT that owner approval
is missing. Normal runtime messages retain their existing status-only format.

Public MX lookup returned mx1.privateemail.com and mx2.privateemail.com, consistent
with Namecheap Private Email. This verifies routing, not mailbox ownership, an active
sending account or unattended credentials. Official settings specify authenticated
mail.privateemail.com SMTP, port465 SSL or587 STARTTLS. If the owner confirms this
mailbox and existing entitlement, use a dedicated/revocable app password where the
account supports it; install only through a secure runtime prompt after a compatible
transport is prepared. Do not change the mailbox master password or buy a new service.
Provider setup references:
https://www.namecheap.com/support/knowledgebase/article.aspx/1179/2175/general-private-email-configuration-for-mail-clients-and-mobile-devices/
https://www.namecheap.com/support/knowledgebase/article.aspx/10816/2178/how-to-use-app-passwords-for-private-email/
Owner supplies setup status only, then installs any required credential directly via
the same runtime secret mechanism. Do not request Gmail scopes
for Drive or send from the connected personal Gmail account as a substitute. Cloudflare
Email Service documents free sends to verified destinations, but availability requires
account/domain/sender/recipient checks; do not change MX/DNS, plans or another website
just to enable it. If an existing free secure sender cannot be used, report the exact
provider prerequisite/cost before proceeding. No paid service is authorised.

After configuration: send one labelled synthetic test, retain only provider acknowledgement
and a non-sensitive receipt, and verify arrival in the recipient mailbox (or ask owner
for arrival confirmation). Provider acceptance alone is not proof of arrival. Do not
retry an uncertain send automatically and risk duplicating the one approved test.
Independent absence/heartbeat monitoring remains separate from email delivery.
https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/

## Additional local evidence

A combined synthetic test encrypts the payload, stores it through DriveCustody with a
D1DriveIndex backed by on-disk SQLite, loses the upload acknowledgement, closes/reopens
the database and reconstructs both adapters. Retry performs no second upload or ID
allocation. Download SHA-256 and authenticated decryption match; a wrong key and
corrupt provider bytes reject. This tests the real adapter code against a fake provider,
not a live Drive account or hosted D1. Nine affected checks and scoped lint/diff pass.
No unchanged full application suite repeated. No resource, secret or schedule installed.
