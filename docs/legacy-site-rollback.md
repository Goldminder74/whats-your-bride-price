# Existing website custody and rollback — 23 October 2026

This records read-only preparation. No existing site, function, email, domain,
integration, subscription or publishing setting was changed. Conditional launch
authority still depends on the essential readiness gates; this is not activation.

## Observed provider state and independent website copies

Connected Netlify sign-in is now verified. Existing project
`0a16fd01-b623-4fdb-aa1c-f711e2af98ab`,
`classes-4-culture-goldmindresourcery`, remains published at
`6844a06d30342e00087fbdf3`, source `main@cd92da0`.

Used the deployment's supported Options menu, not a rebuild or guessed download
endpoint. The deployed-files action first prepares an archive, then changes to
“Click to download files”; preparation alone is not a download receipt. The initial
download wait timed out before this second-stage control was inspected. The ready
control then downloaded successfully. Matching source download also succeeded.

Both archives were copied to ignored local custody under
`outputs/authority-preparation/legacy-site-backup/`. Every regular file was read
and independently SHA256-hashed without extraction, execution or content logging.
No archive, source content, template, credential or generated manifest is in Git.

| Archive | Readable regular files | Expanded bytes | Archive SHA256 |
|---|---:|---:|---|
| deployed website |91|4,330,556|`512288574eeb034dd240feb530356ec07766e87f76e84f201b65f343b10c3c10`|
| matching source |297|4,499,981|`baf808359b43d04e33743bae42979d47abb2c56e3df94f44bea03c83fc2f2536`|

The deployed archive's91 files match the deployment browser's total. ZIP entry
counts include directories (93 deployed /351 source); do not call these file counts.
These copies are independently readable locally, not an off-device custody claim.

## Email function: preserve provider origin, no invented binary backup

The pinned deployment still has one System function, `emails`, digest
`dab19ca75101cf149d8eb77f5a77bda6499056a8e562c77296f6c2ddbdd90b89`.
Neither archive contains its generated function binary or an `emails/` template
directory. The function detail page offers logs and deployment navigation, with
no function-download control. The documented Functions API exposes search and
upload, not a function-binary download operation; no guessed endpoint was tried.

Emails configuration currently displays no selected provider and provider API key
“Not set”, with directory `./emails`. These configuration observations do NOT
prove that the deployed function can send, nor that its deployed environment is
identical to the current configuration page. It was not invoked, rebuilt, disabled
or configured. No message was sent and no email credential was read.

Netlify documents immutable deployed function versions and continued availability
of the Email Integration for existing installations/older teams:
[functions](https://docs.netlify.com/build/functions/overview/),
[Email Integration](https://docs.netlify.com/extend/install-and-use/setup-guides/email-integration/),
[API](https://open-api.netlify.com/).

The safe cutover design retains this entire original Netlify project, published
deployment, function and configuration. Do not replace its deployment with the
game, reuse it for recovery information, delete it, or reconstruct email handlers
from the incomplete source copy. Final serving/domain routing must explicitly
preserve any existing email-function route and its original origin; verify this
before changing DNS. An independently downloadable function binary and a tested
function restore remain unverified. Provider-native preservation is not represented
as such a binary backup. Resolve the actual preservation/rollback requirement
before launch; do not turn a source ZIP into a false completion claim.

Rollback must restore the recorded previous website routing/deployment while
preserving financial data and settlement/webhook handling. It must not restore an
old game database, reopen closed wallets, drop deletion/hold authority or erase
purchase/confirmation records. Current public DNS observations are in the handover;
registrar/DKIM/DNSSEC verification is still required. No rollback was executed.

## Fresh account headroom

Observed directly in connected Netlify billing: Personal $9/month,1,000 credits,
473.7 credits remaining, auto recharge **Disabled**, credits expire30 October2026.
Account-wide consumption:526.3 credits, including34 publications/510 credits,
36,449 web requests/7.3 credits and9 bandwidth credits; compute/AI zero. Four
existing projects share this account. No upgrade, recharge or purchase occurred.
Consumption can lag provider activity; this is a dated observation, not a hard
spending cap or a forecast of production capacity. Separately funded Drive/email
remain excluded from the binding GBP50 operating ceiling. The expired benchmark
was not restarted and its cumulative allowances were not reset.
