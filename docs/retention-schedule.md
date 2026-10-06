# Data retention schedule

Date: 31 August 2026

Status: generated technical summary; final owner and professional approval is required before production activation.

The canonical row data is `app/retentionSchedule.ts` and `/privacy/retention` renders it. Each row states purpose, location, retention trigger, maximum period, expiry behavior, deletion or anonymisation behavior, user control and activation state.

The implemented result rule is authoritative: completed attempts, answers and results expire exactly 90 days after authoritative quiz completion. Publication has no effect on `expires_at`; it does not extend, restart or remove expiry. Unpublication, deletion or another valid lifecycle action can make a result unavailable sooner, and copies or caches outside the service are not controlled by the application.

Challenges remain capped at 30 days or the source result’s remaining life, whichever is earlier. Accepted challenge play is also bounded by its own 24-hour authority. Raw version-1 referral, share and analytics events cannot exceed 30 days. Analytics choices persist for 180 days and analytics sessions for at most 24 hours. Pending Royal Reveal authority lasts 30 minutes; configured commerce record retention remains 400 days pending legal/statutory review. Ordinary Royal Reveal regeneration requires an active result, at most 90 days from completion; a protected return may finish a verified payment already in progress. Downloaded files remain device-controlled.

Daily challenges and streaks remain off by default. The approved product rule creates a streak only after an authoritative official daily completion and sets `expires_at` to exactly 180 days later. Each later valid official completion resets that deadline; practice, page visits, failures, retries, analytics, sharing and ordinary quiz play do not. A missed UTC day resets the current count while retaining the best count until the record expires. At expiry the streak is unavailable immediately, the bounded operation must remove it within seven days, and a returning player begins a new streak without reconnecting the former record. Clear my streak data makes the record unavailable immediately and permanently removes it within seven days; the current repository removes it in the same atomic request. Ownership hashes are functional only and must never be reused for analytics, marketing or cross-site tracking. Identifiable deletion logs are prohibited except where strictly required for security and operational integrity.

Daily recovery lasts only until the next UTC boundary, successful completion or a relevant clear control. Party features remain inactive and have no approved production retention. The Prompt 22 rules, migration and routes are local source only: production activation still requires documented privacy and legal review, an approved D1 binding, an approved server secret and separate deployment and migration approval.

Cowrie bonuses expire exactly 180 days after their authoritative award. Purchased Cowries do not expire while an active wallet remains available. Expiry appends a bounded, idempotent ledger adjustment and never rewrites history; an old spent bonus cannot consume a newer valid credit. Clear freezes wallet access immediately and preserves its balance, ledger and free-play counter for protected support handling. The owner approved the financial/support policy below on 5 October 2026; the seven-day non-financial purge rule does not apply to financial records. Safe implementation and professional review remain required before production activation.

## Disabled Cowrie payment continuity

Cowrie pending/async fulfilment authority is at most thirty minutes from creation. Existing webhook evidence retention remains 400 days and outlives all valid fulfilment windows, including unresolved verified adverse events. Only the explicit bounded retention operation removes expired evidence. No ordinary request extends payment/bonus retention. Financial wallet/ledger deletion remains subject to separate legal/support approval; frozen access does not make purchased value expire. See [Cowrie commerce](cowrie-commerce.md).

## Financial/support and physical-purge implementation requirements

Reviewed against official UK guidance on 5 October 2026. Owner-confirmed seller: Ayodele Ayeni, UK sole trader trading as Classes for Culture, not VAT registered. Support: team@classesforculture.com. The limited-company/VAT examples below are conditional reference only and do not describe this seller. For a UK limited company,
required accounting/tax records generally run six years from the end of the
relevant financial year ([GOV.UK](https://www.gov.uk/running-a-limited-company/company-and-accounting-records));
for UK self-employment, at least five years after the relevant 31 January filing
deadline ([GOV.UK](https://www.gov.uk/self-employed-records/how-long-to-keep-your-records));
UK VAT records generally require at least six years (ten for OSS/MOSS cases)
([GOV.UK](https://www.gov.uk/charge-reclaim-record-vat/keeping-vat-records)).
These are conditional statutory requirements for necessary records, not a reason
to retain every quiz answer or identifier. Confirm applicability and accounting
storage with the seller/accountant. No statutory period has been configured.

UK GDPR does not prescribe one retention period for each data type: necessity,
justification and deletion/anonymisation are required
([ICO storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)).
Erasure can be restricted for legal obligations or legal claims, and backup
handling must be addressed
([ICO erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/)).
The existing 400-day commerce setting is a technical proposal, not a verified
statutory accounting schedule. No period, hold or purge is activated here.

| Implementation requirement | Records affected | Operational consequence / nature |
|---|---|---|
| 1. Seller status confirmed; approve necessary accounting evidence and its schedule/location; decide how long operational wallet/order identity links are needed after closure or settlement. | Wallets, immutable ledger, purchase allocations, orders, entitlements, minimal Stripe references and any separate accounting export. | Statutory minimums depend on the business. Operational links are a purpose-based choice. Deleting links prematurely can prevent proving paid value, refunds or ownership; keeping every link for the tax period is not automatically justified. Existing purchased-value rules stay unchanged. |
| 2. Specify support/refund/dispute case retention and its start/end trigger, authorised handler/contact, minimal case fields and unresolved-case hold/release rules. | Frozen wallet references, settlement/order evidence, privacy requests and future support correspondence/case records; no support-ticket store currently exists. | Mainly a product/support choice with legal obligations/claims where applicable. Clearing freezes access; the approved policy below requires a safe case closure/deletion implementation. Expired webhook evidence must not be assumed to substitute for accounting/support proof. No identifiable deletion logs are added. |
| 3. Set physical deletion or irreversible anonymisation deadlines after expiry or an accepted deletion request, and a safe dependency order. | Expired incomplete attempts, completed attempts, answers, results and related daily/challenge ownership/completion rows; payment-linked result/entitlement references may need a minimised retained proof first. | Product/privacy implementation choice, not a new access period. Access expiry already works; rows can remain stored until the approved purge deadlines are implemented safely. Immutable scoring/financial triggers and foreign keys must be respected; any later necessary schema change needs separate review, not blind cascading deletion. |
| 4. Set the matching backup/export expiry and deletion propagation rules, and responsibility for reapplying deletions after restore. | Future D1 recovery copies, accounting/support exports and any replicated owner links. | Live deletion alone does not remove backup copies. Legal holds may preserve necessary evidence; otherwise define when copies cease use and are overwritten. Restoring must not resurrect expired/deleted ownership. Non-personal question-evidence backups are separate from player/financial data. |

Already approved access/bonus/streak periods are not open decisions in this list.

## Owner-approved rules — not activated

The owner approved all six rules on 5 October 2026. This records policy approval only: it does not authorise deployment, hosted changes, cron, payments or feature activation. Safe purge implementation, professional review and provider-capability verification remain outstanding. The existing 400-day technical commerce setting is not an accounting compliance solution.

| Category | Approved policy | Nature and operational consequence |
|---|---|---|
| Accounting | Keep necessary income/expense, payment/refund/settlement and payout records at least five years after the relevant tax year's 31 January filing deadline; retain longer where HMRC enquiries or applicable legal holds require it. Export a minimised accounting record, not all quiz answers or raw webhooks. | Sole-trader statutory minimum under [GOV.UK](https://www.gov.uk/self-employed-records/how-long-to-keep-your-records). Seller/accountant must confirm the tax-year mapping, required fields and export custodian. Not VAT registered is not a promise about future registration or overseas digital-tax obligations. |
| Wallet ownership/value | Retain operational wallet/allocation/ledger links while purchased value or a case remains unresolved. After final closure and settlement, minimise owner links within 30 days while preserving required accounting proof. | Product recommendation; does not extinguish purchased Cowries, change refunds or bypass immutable-ledger protections. Closure must be defined before implementation. |
| Routine support | Keep for 12 months after case closure for minimal ordinary support correspondence. Privacy requests: keep for 12 months after completion for minimal compliance evidence, without identifiable deletion-event logs. | Product choice, not a statutory blanket period. Ayodele Ayeni via team@classesforculture.com is proposed handler; confirm restricted mailbox access and deletion responsibility. |
| Disputes/refunds | Keep for six years after final case settlement for necessary claim evidence, with annual necessity review and documented litigation/authority holds. Keep controlled verified_refund/verified_dispute reasons distinct. | Conservative claims-handling choice, not a universal six-year legal retention duty. Professional review should confirm jurisdiction/claim applicability and shorten unnecessary records; unresolved cases remain held. |
| Non-financial physical purge | Require removal/irreversible anonymisation within seven days after existing access expiry or an accepted erasure request, excluding only documented necessary legal evidence. Existing streak seven-day rule stays approved. | Owner-approved product policy for other rows; no access period extension. Purge dependency order, foreign keys and immutable triggers need scoped implementation review before scheduling. No new migration authorised here. |
| Backups/exports | Use a rolling maximum 30-day operational backup window, inaccessible for ordinary use after erasure, with deleted/expired records suppressed on every restore. Accounting/held-case exports follow their own approved schedule, then purge within 30 days. | Product recommendation subject to actual provider recovery capability; verify D1 retention controls before promising it. Minimise restore/deletion tracking and restrict access. Non-personal research archives are separate. |

[ICO storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/) requires purpose-based justification rather than a universal period. [ICO erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/) covers legal-claim/obligation exceptions and putting backup data beyond use. No proposal changes runtime flags, storage, cron or published privacy notices.

## Implementation safety checkpoint — 6 October 2026

Owner policy approval is recorded; complete enforcement is not implemented. The current maintenance operation marks expiry, removes streaks/rate-limit rows and expires bonus value. It also deletes webhook rows after their technical expiry, without a durable legal-hold check. Do not activate it for payment data under the new policy until that gap is corrected.

A new migration is necessary before safe enforcement: persist scoped legal holds, final closure/settlement authority, purge eligibility and dependency-preserving accounting proof. Existing migrations remain unchanged. Migration 0009 prohibits ledger deletion, financial references restrict result/attempt deletion, and wallet ownership/recovery fields require non-null hashes. A generic cascade or replacing ownership hashes would violate the approved policy or risk reconciliation. The new migration must retain immutable accounting amounts and exact allocation/order references, permit only authorised irreversible minimisation, and preserve immediate access denial. This is a purpose statement, not an implemented or approved hosted migration.

One policy detail remains undefined: what authoritative action constitutes final wallet closure. Clearing currently freezes a wallet while preserving purchased value; it cannot be treated as final closure or start the 30-day minimisation clock. No closure rule or value forfeiture is inferred. Support/case storage and accounting export custody also require operational arrangements; professional sign-off cannot be supplied by repository tests.

Official compatibility checks: [HMRC](https://www.gov.uk/self-employed-records/how-long-to-keep-your-records) supports the five-year filing-deadline minimum. [ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/) permits necessary legal obligation/claim exceptions and requires backup data beyond ordinary use. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) documents seven-day Free / 30-day Paid recovery windows, both within the approved operational maximum. Neither plan guarantees deletion suppression on restore: restoration must remain inaccessible until deletion/expiry suppression is reapplied and verified. No provider account change or professional legal approval was obtained.
