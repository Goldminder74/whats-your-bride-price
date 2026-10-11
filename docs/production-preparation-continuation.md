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

Inspection found no dedicated Drive OAuth environment configuration, no local gcloud
application credentials, and no Drive OAuth secret names on the existing test Worker.
This does not prove that an unused OAuth client is absent from your Google account or
password manager. The connected interactive Drive app is not an unattended Worker credential.

1. In Google Cloud Console, sign in as `ayo.m.ayeni@gmail.com`. Reuse a dedicated recovery
   project/client if one exists; otherwise prepare one and enable Google Drive API.
   Do not enable billing, buy storage or use another person's cloud project.
2. Configure the consent app for your account. Request ONLY
   `https://www.googleapis.com/auth/drive.file` (create/read/update/delete files explicitly
   used by this app), with offline access. No Gmail, whole-Drive or domain-wide delegation.
   Add only your account as a test user while setting it up. Testing refresh tokens expire
   after seven days: that state is not suitable for unattended production recovery.
   Resolve Google's applicable production-consent requirements before relying on it.
3. One supported manual token flow is Google's OAuth Playground using YOUR dedicated Web
   OAuth client, with authorised redirect URI `https://developers.google.com/oauthplayground`.
   In Playground settings choose “Use your own OAuth credentials”; enter them directly
   there. Authorise the exact scope above with offline access, then exchange the code.
   Save client ID/secret/refresh token directly in your secure password manager. Do not
   paste them into chat, shell arguments, repository files, screenshots or logs.
4. Grant the app only the approved private `WYBP Production Recovery` folder. An existing
   folder needs explicit Google Picker selection by this app; its ID alone is insufficient
   with drive.file. If none exists, the app can create the approved folder through Drive
   API, making it app-accessible. Check your Drive first; do not create a duplicate.
   Do not broaden scope merely because a folder is inaccessible. Picker selection or
   app-owned folder creation remains a secure setup step, not a completed operation.
5. Once the isolated ops Worker exists and its identity/cost gate has passed, install
   each value using Wrangler's interactive secret prompt on that Worker ONLY:
   `npx wrangler secret put WYBP_DRIVE_CLIENT_ID --name wybp-prod-ops-r001`
   `npx wrangler secret put WYBP_DRIVE_CLIENT_SECRET --name wybp-prod-ops-r001`
   `npx wrangler secret put WYBP_DRIVE_REFRESH_TOKEN --name wybp-prod-ops-r001`
   `npx wrangler secret put WYBP_AUTHORITY_KEY_BASE64 --name wybp-prod-ops-r001`
   Paste values only into the secret prompts; never append them to commands. The key is
   the verified32-byte recovery key encoded as base64, with its independent secure copy.
   Configure non-secret folder ID as `WYBP_DRIVE_FOLDER_ID`; role `production-ops` and DB
   name `wybp-prod-d1-r001`. Do not run secret-put against a nonexistent Worker or accept
   resource-creation prompts. No secret belongs in Netlify, the app Worker or a build.
6. Verify token refresh, private folder read/write/readback, revocation failure and recovery
   from the independent key copy before enabling delivery. The local factory refuses
   absent credentials, wrong role, missing snapshot capture or missing alert transport.
   No production job is active yet.

Google references:
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/oauthplayground/

Alerts are prepared for `team@classesforculture.com`. The prepared envelope has
`sendApproved:false`; no sender, message or test has been activated. Owner confirmation
of this destination is still required, followed by secure sender configuration and a
verified heartbeat/absence alarm. A prepared message is not a working alert service.
