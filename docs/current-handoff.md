# Current handoff

## Source and deployment

Branch `feature/viral-build-sprint`; deployed source `0d2a94589136d4b41c8387671e1835544986e3cc`.
Resolve documentation checkpoint with `git rev-parse HEAD`; PR #1 stays draft/unmerged.
[Private game](https://wybp-protected-test.netlify.app/) now includes copy/FAQ,
Share Centre focus repair and subsequent completed runtime fixes. Matched release
`241c49f2a5cc56b463235cc0be528123845f09dee4e8bd42657f4c220df65f3d`;
Netlify `6ac98b120f83c2a037e6c32d`, Worker `2eab2542-2d29-400a-8c19-b4539f30b688`.
Commerce, Cowrie enforcement, webhook, cron and unrelated features remain off; R2 unbound.
Random replay alone is enabled. All five live 12-question games/result screens passed,
with mobile image progression and refresh after question seven; desktop recovery,
navigation, 320px information controls, FAQ and Share Centre Escape/focus passed.
Anonymous denial, signed ingress and 110 client checksums verified. Fresh affected
tests passed: entry 12/12, Share Centre 4/4, security/runtime 41/41; package includes
142 server modules. Prior complete integration passes reused for unchanged source,
including disabled-journey fixtures. See hosting runbook for audit and rollback pair.

Existing test D1 `wybp-test-d1-r001` (`1a268b28-e6d5-4431-8f84-a886df9369f1`)
remains only on `wybp-test-r001`, migrations 0000–0012. Canonical 60 + approved 90
provide 30 eligible/region; manifest
`4b6883d08e9efceb336ab333bab0e67e0219d107693ec85b99757170dff8c22d`.
Research drafts/reserves unpublished; machine evidence is not cultural approval.
Recovery remains independent of fast_entry. Migration 0013 is not required by the
application runtime and was not applied to test D1. Schema/financial counts unchanged.

Stripe parent `acct_1UOOZAIb8Lefpj36`, sandbox `acct_1UOOZKEsGCyaV3rl`;
reuse four links and webhook `we_1UOQOYEsGCyaV3rlnR8Gk5LJ`. No secret values in Git.
Recorded sandbox checks cover purchases, delivery, free/paid play, mobile returns,
failures/retries, refunds/disputes and frozen settlement. Preserve active 54-Cowrie
and frozen-zero synthetic wallets. Original fifteen-checkout failure remains
unroot-caused; seven historical audit timestamps remain unknown. Do not repeat tests
without a new risk. Seller: Ayodele Ayeni, UK sole trader, Classes for Culture,
not VAT registered; support team@classesforculture.com. Preserve Wigsmi/Sherwood.

## Completed rehearsal and remaining gates

Migration `0013_operational_recovery.sql` was authorised only for rehearsal;
checksum and recovery contracts remain recorded in the linked documentation.
Operator adapters are implemented, not activated for application D1. Independent
delivery is not atomic with D1; exclusive operator/unbound restore target required.
Approved retention, holds, closure, accounting and fresh suppression gates remain intact.

Hosted synthetic rehearsal completed on unbound `wybp-restore-rehearsal-r001`
(`ed22b01c-c791-4982-ba2e-5c8d2aa8c164`), then deleted; inventory verified cleanup.
All 14 migrations/rollback, snapshot, interrupted/resumed delivery/import,
fresh suppression, five closures/holds and accounting preservation passed. Purged
1,440 answers in 29 bounded passes: 14.758s total, p95 0.874s. At 15-minute cadence,
fixture takes 7h15; 33,600/week is theoretical capacity, not a production guarantee.
Private Drive archive `1rK5BZBmatLS2emdCBw4dQ3TiCYTAfedN` downloaded and verified,
including all 221 files. SHA-256 `31bc31cec42455709bf07ab4632989977f1b6f671666b33334f2bdcdd8fc9a91`.
Key remains separate/local; independent key custody and continuous production delivery
remain unverified. Complete integration gate and final operator tests 17/17 passed.
Next: production custody/key, workload/schedule, legal/runtime and activation decisions.
Private logs/fixtures remain ignored, subject to approved 30-day backup retention.
Production target https://classesforculture.com/. Launch requires replay, Cowrie
access/purchases and Royal Reveal together, production runtime/live payment setup,
verified backup/restore/purge operations and explicit activation. Owner retention
approval is not professional legal sign-off. Demand/backlog/outage tolerance and
operational custodian/key custody still need production confirmation.
No public website, DNS, Stripe, plan, live feature or hosted job was changed.

[Activation/cleanup](isolated-test-approval-package.md), [recovery contracts](retention-operations.md),
[custody](launch-evidence-backup.md), [hosting/rollback](netlify-cloudflare-hosting.md),
[payments](stripe-payment-link-setup.md).
