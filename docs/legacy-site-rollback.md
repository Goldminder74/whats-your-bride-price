# Existing website custody and rollback — 23 October 2026

## 26 October mail authentication — no DNS/settings change

Actual Namecheap account ShowDKIM confirms `default._domainkey` and its public
key. Authoritative DNS has no such selector and no `_dmarc` record; a DMARC-like
string is misplaced at the root TXT alongside the valid SPF record. The already
approved external synthetic message in the correct owner Gmail now shows SPF PASS,
DKIM FAIL (no key for selector default), DMARC FAIL. No message was resent and no
raw headers, IP addresses or public key are recorded here.

Prepare the exact provider DKIM value and a correctly located initial `p=none`
DMARC record from verified account facts; preserve existing MX, valid SPF, unrelated
TXT/subdomains, current legacy deployment and every rollback record. Changing this
DNS and verifying it is still gated by the recorded conditional activation scope.
A new externally received hosted synthetic confirmation needs explicit further
send/capability approval; the old message is historical evidence. Do not rotate
credentials, migrate mail, start a new email subscription or claim DKIM passes.

## Latest read-only continuity check and local correction

Authoritative Netlify account API returned the complete existing zone:9 records,
including both MX records, root TXT records and the existing brideprice CNAME/
verification records. Sanitised IDs/types/TTLs and an ignored exact record export
are preserved; SHA256461203150a86c00b6c04f8db762594271ca1686061fc58cd6b9b901958dec0e2.
NS remains dns1–4.p02.nsone.net. Public DoH returned NXDOMAIN for both documented
Private Email selectors `privateemail._domainkey` and `default._domainkey`, and
for `_dmarc`. DS/CAA responses had no answers. These are observations, not authority
to add guessed keys/policies or a claim that every possible DKIM selector is known.
Read the actual Private Email configuration before any verified DNS addition.

The immutable provider homepage still returns200 with the pinned HTML hash, but
all five actual authentication deep paths return404 there. Literal routes were
independently read from the pinned deployed JavaScript without printing its
contents. A source-only,
OFF-by-default `WYBP_LEGACY_CONTINUITY_ENABLED` compatibility handler fixes these
canonical paths by fetching the unchanged provider ROOT shell. Browser path/query/
fragment remain for its existing router; callback tokens, cookies, credentials and
client headers are not sent to the provider. Fixed `/assets/<filename>` requests
use only that exact origin, with bounded bodies and no redirects. Other game/API
paths and non-GET/HEAD methods do not fall through to a speculative email proxy.
The verified legacy profile, verification/registration completion, class/tutor
and booking-dashboard return routes use the same shell. New game/legal handlers
are not replaced. This preserves existing legacy service journeys, not a new
payment integration, charge or change to legacy provider settings.
Private ingress protects this handler too. Nothing was deployed or enabled.

Local security tests and the compiled exact package pass. Five read-only requests
through this local handler each return the original2,658-byte HTML, SHA256
6f500428dd41b5017b56077acf71e4cf207276c89fb5d928a30647801045ae7f.
This verifies shell routing, not a sent legacy email or authenticated Supabase
session. Canonical-origin callback execution and assets must be checked during
the protected cutover rehearsal; no Supabase allowlist change is assumed necessary
or made. The game still uses its own SMTP and does not depend on legacy email.

Final domain plan: save exact registrar/zone state, translate Netlify pseudo-records
only for the intended new apex/www serving, preserve EVERY mail/subdomain/verification
record, establish the Cloudflare zone without changing nameservers, compare it,
then use the existing conditional cutover authority only after all gates pass.
Retain the original nameservers/provider deployment for rollback. Restore routing,
never an old financial database; leave settlement/webhook processing intact when
rolling back the front end. No DNS, existing deployment or email setting changed.

Ignored evidence:20261023-email-dns-readonly.json,
20261023-precutover-netlify-dns.json,20261023-precutover-public-dns.json,
20261023-legacy-compatibility-readonly.json and20261023-final-direct-smoke-new.log.
Existing archive/key/operational-alert checks were not repeated.

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
These copies were independently read locally, not an off-device custody claim.
The source ZIP was subsequently found to contain apparent SMTP credentials; see
the protected custody update below. Its original plaintext checksum remains pinned.

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
or configured. No message was sent; no legacy credential was used or displayed.

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
as such a binary backup. The caller audit below removes the generated function
binary as a dependency of the new game, without claiming independent restoration
of that binary or successful delivery by the legacy system.

## Verified callers and provider-address preservation

Read the matching source archive without executing it or printing file contents.
`BookClassForm.tsx` invokes Supabase `send-booking-confirmation`; Supabase also
handles legacy sign-up, verification and password-reset email. Its booking/test
functions use SMTP configuration. No source caller of `/.netlify/functions/emails`,
`@netlify/emails`, `NETLIFY_EMAILS_` or its plugin was found. This is a source audit,
not proof that no external caller exists or that any legacy mailbox currently sends.

The new game's authority alerts and purchase confirmations use its own private
SMTP transport; they do not depend on this Netlify System function or Supabase.
Do not rebuild the existing website or implement a speculative binary replacement.

The original deployment's UI supplied this verified immutable provider permalink:
[preserved legacy deployment](https://6844a06d30342e00087fbdf3--classes-4-culture-goldmindresourcery.netlify.app/).
One anonymous HTTPS HTML request returned200,2,658 bytes; body SHA256
`6f500428dd41b5017b56077acf71e4cf207276c89fb5d928a30647801045ae7f`.
No scripts, function or email send were invoked. Keep the entire project, deployment,
configuration, Supabase project and email DNS unchanged. A live provider-address
copy is verified; end-to-end legacy email and independent function restore are not.

Legacy authentication links include canonical-origin `/verify-email`, `/login`,
`/forgot-password`, `/reset-password` and `/signup`. Before final domain cutover,
inspect actual Supabase redirect allowlists and preserve these journeys at the
legacy origin or through an explicitly tested compatibility route, including
their assets and query strings. Do not assume changing an OAuth/SMTP redirect
setting is unnecessary merely because the HTML permalink returns200. This remains
an engineering verification task; no replacement deployment or DNS edit was made.

## Protected source custody

The source contains non-placeholder SMTP-password assignments in two legacy
Supabase configuration files. Values were neither used nor displayed. Anonymous
repository metadata returned404, which does not establish repository visibility
or public credential exposure. No credential-validity test or rotation occurred.

Both agent-downloaded plaintext source ZIP copies were encrypted with Windows
CurrentUser DPAPI, decrypted in memory to verify the original pinned ZIP checksum,
then only those two plaintext downloads were removed. The workspace custody copy
is `outputs/authority-preparation/legacy-site-backup/source-6844a06d30342e00087fbdf3.zip.dpapi`;
the separately downloaded copy is also now `.zip.dpapi`. These files and the
sanitised custody/caller observations remain ignored, never in Git. DPAPI is tied
to this Windows user; it is not an off-device or independent-user recovery promise.
The deployed public-files ZIP remains intact. Preserve the original deployment;
do not treat source-secret exposure as established or silently change its credentials.

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
