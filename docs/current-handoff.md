# Current handoff

## Source and deployed state

Branch `feature/viral-build-sprint`; copy/FAQ source follows `6f38448add1c9d3095907e640c0040c1703be11e`.
Resolve its committed checkpoint with `git rev-parse HEAD`. PR #1 stays draft/unmerged.
Copy/FAQ changes are local source only, not deployed. Shared accessible information
controls and footer FAQ preserve full disclosures; prices, consent, visibility/expiry,
challenge-name disclosure and destructive consequences remain at decision points.

[Private game](https://wybp-protected-test.netlify.app/) remains random-only release
`f1cbdeec1c3df2340ed58efbaddc49d24061bb6e9e13cfd12437a0adf110dd70`;
Netlify `6ac815e3a823977864ab5e66`, Worker
`dec43f5c-6949-4438-9fb7-eb8be10afd6f`. 109 checksums verified; anonymous
primary/previews 401, unsigned Worker and disabled webhook POST 404. Commerce,
Cowrie enforcement, webhook, cron and unrelated features off; R2 unbound.

## Catalogue and sandbox evidence

Reuse `wybp-test-d1-r001` (`1a268b28-e6d5-4431-8f84-a886df9369f1`), only on
`wybp-test-r001`. Migrations 0000–0012 unchanged. No repeated seed/publication.
Canonical 60 plus approved 90 give 30 eligible/region; manifest
`4b6883d08e9efceb336ab333bab0e67e0219d107693ec85b99757170dff8c22d`.
Research drafts/reserves unpublished. Machine evidence is not human cultural approval.
Five-region desktop/mobile random recovery is verified independently of fast_entry.

Only Stripe parent `acct_1UOOZAIb8Lefpj36`, sandbox `acct_1UOOZKEsGCyaV3rl`;
reuse four links/webhook `we_1UOQOYEsGCyaV3rlnR8Gk5LJ`. Secrets remain unread.
Sandbox passes: bundles, Royal Reveal, free/paid play, mobile returns, retries,
failed-payment denial, redirect-independent fulfilment, refund/dispute distinction.
Separate synthetic owner bought 15 twice, including declined-card same-order retry.
Frozen at 30, exact allocated dispute/refund reversals removed 15 each; stayed frozen
at zero. Original wallet remains active at 54, bonus zero. Preserve both fixtures.
Local tests cover frozen ordinary-write/recovery denial. Audit timestamp correction
is `62df79596e16dfa176730c73837cc693a8b6000a`; seven historical nulls remain.
Original fifteen-checkout failure lacks original HTTP/exception evidence and remains
unroot-caused despite successful later same/separate-owner purchases. Do not claim fixed.

## Next action / production gates

Follow the [production activation checklist](isolated-test-approval-package.md#production-activation-checklist--9-october-2026):
local paginated operational export/restore and authority journaling are the smallest
next approval. Owner chooses custodian/destination and production domain. Current
Netlify future origin is classesforculture.com; existing Sites app canonical is
brideprice.classesforculture.com. No replacement/cutover is authorised.

Operational backup custody, hosted restore and complete scheduled-path capacity remain
unverified. Local retention rehearsal: 4/4; 12,000 answers/240 passes in 2,009 ms;
Miniflare 1,440/29 in 2,468 ms. Time Travel availability is verified, restoration is not.
Research Drive backup verified; OneDrive deferred; not an operational payment backup.
Existing export caps: 100/category, 64 KiB. No hosted restore/purge/cron performed.

Public launch requires replay, Cowrie purchases/access and Royal Reveal together,
production runtime/live webhook implementation, approved seller/legal/provider setup
and explicit activation. Owner retention approval is not professional legal sign-off.
Preserve Wigsmi/Sherwood, websites/DNS, staging/stash. Secret-free builds; no hosted
changes or live payment activation in the copy task. Copy validation: 29 unit,
31 rendered and 62 browser checks pass; affected lint, typecheck and builds pass.
Full-suite entry stopped on three ignored diagnostic-script lint errors, not source;
separate browser suites preserve their required server lifecycle. One nomination
run hit a 136-second dispatch pause; unchanged full rerun passed. Logs remain outside
Git in TEMP `wybp-copy-*`. No live payment tests were repeated.

[Hosting/rollback](netlify-cloudflare-hosting.md), [payments](stripe-payment-link-setup.md),
[retention](retention-operations.md), [custody](launch-evidence-backup.md).
