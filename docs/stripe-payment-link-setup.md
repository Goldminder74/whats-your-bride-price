# Stripe Payment Link activation guide

The original Prompt 17 baseline below is historical; the current four-product isolated plan is in the October update and hosting runbook. Nothing here creates, activates or calls a Stripe Payment Link. Complete these gates manually in order, with owner and appropriate professional approval, before live commerce:

1. Approve the Stripe account.
2. Create `royal_reveal_v1` with a one-time £1.99 GBP Price; never recurring.
3. Record the tax-inclusive/tax-exclusive decision.
4. Create the Stripe-hosted Payment Link.
5. Approve and configure the terms URL.
6. Approve and configure the privacy URL.
7. Approve and configure the refund-policy URL.
8. Approve the business identity and support contact shown to purchasers.
9. Approve the exact immediate-delivery-consent wording.
10. Approve the durable receipt/contract-confirmation process.
11. Register the canonical HTTPS webhook endpoint for only the five documented event types.
12. Install the webhook signing secret in server-only secret storage; never source control or client configuration.
13. Set and verify the expected Stripe livemode value.
14. Bind the separately approved production D1 database.
15. Apply and verify migration `0006_regular_paibok.sql` under separate approval.
16. Install and prove the independent fail-closed production rate limiter.
17. Enable the commerce build/runtime feature only after all readiness checks pass.
18. Complete an end-to-end Stripe test-mode payment and verify redirect-independent fulfilment.
19. Test a full refund, partial-refund review and dispute revocation.
20. Obtain separate explicit approval before live-mode activation.

The link must collect only information Stripe genuinely requires, include `client_reference_id` in the Checkout Session and redirect to the canonical Royal Reveal return page. Runtime configuration must provide the exact public HTTPS `buy.stripe.com` link plus server-only expected Payment Link ID, webhook secret, product key, amount 199, currency GBP and livemode. The app rejects credentials, fragments, arbitrary hosts and unexpected parameters, then appends only its opaque client reference.

Do not paste a real secret, customer record or live link into Git, test fixtures, screenshots, reports or browser storage. Test and visual review use synthetic signed payloads and never contact Stripe.

## Owner-confirmed seller and separate account — 5 October 2026

DRAFT payment disclosure: **Ayodele Ayeni trading as Classes for Culture**, UK sole trader, not VAT registered. Support: **team@classesforculture.com**. Geographic business/contact address and any required support phone remain owner-supplied directly to the secure business/Stripe process, not invented or committed. The legal pages remain draft; no consumer-policy or professional approval is inferred. Do not display a VAT number or claim VAT collected. Review overseas digital-sales tax obligations before public sales.

Sherwood Consulting Services Ltd and its Wigsmi.com Stripe account are explicitly excluded: no settings, keys, bank details, products, data, branding or sandbox may be reused or modified.

### Future owner setup (not executed or authorised by this document)

1. Open Stripe directly over HTTPS. Register a separate account or use account picker **New account**; ensure it is a new account, never edit Wigsmi. Choose United Kingdom and the individual/sole-trader business type matching Ayodele Ayeni; trading brand Classes for Culture. Record the new non-secret account ID privately to avoid account confusion. [Separate accounts](https://docs.stripe.com/get-started/account/multiple-accounts).
2. Enable passkey/security-key two-factor authentication. Submit legal identity, actual business/individual address, date of birth, requested tax/identity verification documents and payout-bank details **directly in Stripe**. Do not paste these into chat, Git, logs or test fixtures. Stripe determines which additional verification is required; none is claimed complete. Account country cannot be changed after activation. [Account setup](https://docs.stripe.com/get-started/account/set-up), [verification](https://support.stripe.com/questions/what-do-i-need-to-do-to-verify-my-stripe-account), [bank ownership](https://support.stripe.com/questions/verify-your-bank-account-ownership).
3. Add recognised public business information, support email, approved address/phone where required, website, policies and a recognisable Classes for Culture statement descriptor within Stripe limits. Supply an accessible accurate product website when requested; do not disable private test protection merely for onboarding or imply the existing production site sells the new application. [Stripe public information](https://docs.stripe.com/get-started/account/set-up#public-business-information).
4. Within this NEW account only: account picker **Switch to sandbox → Create sandbox**, name `WYBP Private Test`, **Create an account from scratch**. Verify the sandbox banner and new account identity before every action. Do not copy Wigsmi settings. [Sandbox setup](https://docs.stripe.com/sandboxes/dashboard/manage).
5. Payment Links → **+New → Add a new product**, one-off fixed GBP price, Checkout quantity exactly 1. Repeat the four rows below. No subscriptions, coupons, optional items, adjustable quantities, shipping or tax additions. Card initially; test Apple/Google Pay only if offered and compatible. Avoid delayed methods beyond the implemented 30-minute fulfilment authority. [Payment Links](https://docs.stripe.com/payment-links/create).

| Product key / description | Fixed GBP price | Delivered quantity | Sandbox completion redirect |
|---|---:|---:|---|
| `royal_reveal_v1` / Royal Reveal for the owned result | £1.99 (199 minor units) | One reveal entitlement | `https://wybp-protected-test.netlify.app/royal-reveal/return` |
| `cowrie_5_v1` / 5 purchased Cowries | £1.99 (199) | 5 | `https://wybp-protected-test.netlify.app/cowries/return` |
| `cowrie_15_v1` / 15 purchased Cowries | £4.99 (499) | 15 | `https://wybp-protected-test.netlify.app/cowries/return` |
| `cowrie_40_v1` / 40 purchased Cowries | £9.99 (999) | 40 | `https://wybp-protected-test.netlify.app/cowries/return` |

Record four sandbox product/price/Payment Link IDs and `buy.stripe.com` URLs outside Git. App appends only opaque `client_reference_id`; a redirect never proves payment. The runbook gives exact existing environment names, five snapshot webhook events, endpoint, API-version validation and separate secure secret installation. No Stripe API key is required by this Payment Link/webhook integration.

**Currency gate:** Stripe's current Payment Link documentation says Adaptive Pricing is always enabled. Do not assume a dashboard toggle or silently relax exact GBP/amount checks. Verify the actual sandbox Checkout Session and event amounts/currencies and the documented original-price relationship. If legitimate converted sessions cannot satisfy the existing validator, stop for a separately authorised compatibility decision rather than losing payment/fulfilment integrity. No live sales until resolved.

### Test-to-live checklist — separate approval required

- Approve geographic seller/contact address, any required phone, identity/bank verification, draft terms/privacy/refund/immediate-digital-delivery consent and durable receipt process. [UK distance selling](https://www.gov.uk/online-and-distance-selling-for-businesses) and [online selling](https://www.gov.uk/online-and-distance-selling-for-businesses/online-selling) apply; obtain legal review of digital content/cancellation wording.
- Approve isolated D1/catalogue/retention and test-mode hosted operations first. Exercise all four actual sandbox payments with signature verification, refresh/back/mobile, owner boundaries, duplicates/concurrency, cancellation/failure, refunds/disputes and purchased-allocation checks. Confirm currency gate and no fulfilment from returns alone.
- Complete new account verification and live capability review. Review Stripe fees/tax obligations and seller bank before separately approving charges. Recreate all four LIVE products/prices/links in the NEW seller account; sandbox IDs/secrets never become live ones automatically.
- Inventory approved production host/DB/limits, origin and exact live webhook/secret; keep private test separate. Confirm all 30 eligible questions per region and evidence preservation. Only separately reviewed production wiring may accept live events; the dedicated test webhook MUST continue rejecting live-mode events.
- Public launch must include random replay, Cowrie play/purchases and Royal Reveal payments together. Other optional features stay off. Require explicit public/live approval, matched release verification, real payment/fulfilment checks and rollback before activation. Never modify Wigsmi/Sherwood.


## Sandbox setup receipt — 9 October 2026 (historical)

Owner-authorised sandbox work uses committed source `a7f3ade1754a965a3c39061771dd9f75a826bd2f`; the pending copy/FAQ edits remain local and excluded. The signed-in parent account was verified as Classes for Culture `acct_1UOOZAIb8Lefpj36`. Its existing **Classes for Culture sandbox**, `acct_1UOOZKEsGCyaV3rl`, was selected. Both product and Payment Link inventories were empty before creation.

| Product / application key | Fixed GBP | Sandbox Payment Link ID |
|---|---:|---|
| Royal Reveal / `royal_reveal_v1` | £1.99 | `plink_1UOQGrEsGCyaV3rlgnErJlaW` |
| 5 Cowries / `cowrie_5_v1` | £1.99 | `plink_1UOQKLEsGCyaV3rlwZnTMcit` |
| 15 Cowries / `cowrie_15_v1` | £4.99 | `plink_1UOQLEEsGCyaV3rlSyQBT7kq` |
| 40 Cowries / `cowrie_40_v1` | £9.99 | `plink_1UOQLhEsGCyaV3rlYCOF7RYL` |

Each has fixed Checkout quantity 1, no promotion codes, optional customer names/phone/address, automatic tax, invoice PDF or saved-payment-details option. Return URLs are exactly `https://wybp-protected-test.netlify.app/royal-reveal/return` for Royal Reveal and `https://wybp-protected-test.netlify.app/cowries/return` for Cowries. The application appends its own opaque `client_reference_id`; no reference is hard-coded in Stripe. Sandbox default methods were narrowed to card/network and Apple Pay support; alternatives and delayed methods were disabled only in this sandbox. Stripe displays Adaptive Pricing as enabled; non-GBP payloads must continue to fail closed, and UK/GBP live sandbox payload checks remain required.

Webhook `we_1UOQOYEsGCyaV3rlnR8Gk5LJ`, **WYBP Private Test Payments**, uses own-account snapshot events at `2026-09-30.endive` (the stable version offered by this sandbox). Endpoint: `https://wybp-test-r001.ayo-m-ayeni.workers.dev/commerce/stripe-test-webhook`. Subscribed exactly: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`. This records configuration, not verified payload compatibility or successful fulfilment.

Signing-secret installation is pending owner entry directly into the isolated Worker's encrypted `STRIPE_WEBHOOK_SIGNING_SECRET` setting. No value is retained in documentation, source, chat, logs or artifacts. The Worker webhook remains disabled. Private production/preview URLs returned 401; Git builds are disconnected. Read-only D1 checks found 30 published/approved, non-retired questions per region and zero orders/ledger entries. No migrations, catalogue writes or scheduled jobs were performed.

Payments release `57fda08728a9a8df1d6d42b835f5bb513536114de1ef65e7340bd2e3230f302e` built from a temporary archive of the exact checkpoint, with all 140 server modules verified. Separate deployable verification reused the existing gateway secret in memory and proved it absent from artifacts. **Not deployed or activated.** Ignored non-secret receipts/screenshots/configuration are in `outputs/activation-preparation/stripe-sandbox-20261009/`; the release/source snapshot is in the local TEMP directory `wybp-payments-a7f3ade-20261009`.

Next: verify secret installation; install only these test runtime settings; deploy a matched private payments pair; verify actual signed session/refund/dispute payloads, idempotent fulfilment, two-free-game/Cowrie charging, result-bound Royal Reveal, owner/mobile returns and ingress denial. Reuse the existing D1 without migration/seed/publication. Roll back to the handover's current data-profile pair and retain D1 if a gate fails. Live payments/public launch remain prohibited. Live parent Account status showed no active tasks and Payments/Payouts active; this does not replace legal, seller-detail or public-launch approval.

### Live sandbox check and safe rollback

Owner installed the signing secret; only its name was verified. Matched payment
release `57fda08728a9a8df1d6d42b835f5bb513536114de1ef65e7340bd2e3230f302e`
was briefly deployed (Netlify `6ac825cc204428759b874d8d`, Worker
`393e3569-9db2-4ad5-a1b5-2ae35c700af0`). The five-Cowrie test purchase succeeded.
Real snapshot event `evt_1UOQg0EsGCyaV3rlmYaVTsfF` delivered successfully;
resending left exactly one fulfilled order and one purchase credit of five.
The actual API-version payload therefore passed for this completed checkout.

The fifteen-Cowrie order subsequently failed with the visible checkout-unavailable
message; no pending order was created. Its underlying cause is unconfirmed.
Remaining bundle, free-play/debit, Royal Reveal, failure, refund/dispute and mobile
payment journeys are not verified. Return-page refresh after fulfilment showed
status unavailable because the completed pending-order reference is removed;
the wallet retained its five-Cowrie balance.

Restored the previous random-only release `f1cbdeec` and Netlify deployment
`6ac815e3a823977864ab5e66`; new rollback Worker version
`82353ffb-c037-48cc-9387-b4cf58155025`. All 109 client checksums matched;
primary/preview anonymous requests returned 401 and disabled webhook POST 404.
D1, the verified sandbox credit, Stripe objects and installed secret are preserved.
Commerce, Cowrie enforcement, webhook, cron and logging are off. Earlier pending
secret/local-release notes above are superseded by this receipt. No live payment
or public activation occurred. Diagnose the second checkout before reactivation.

### Current verified outcome — 9 October 2026

The setup and first-checkout receipts above are historical. The signing secret is
installed; all four products subsequently passed sandbox fulfilment. Same-owner
and separate-owner fifteen-Cowrie purchases, declined-card retry on the same order,
redirect-independent delivery, Royal Reveal, two-free-game/paid play, mobile returns,
refunds, disputes and signed retries are recorded in the current handover. A frozen
synthetic wallet settled only its exact unused purchase allocations, remained frozen
at zero, and left the original active 54-Cowrie wallet unchanged. The original
fifteen-Cowrie failure has no recoverable root cause; do not describe it as fixed.
Commerce/webhook were disabled after verification; no live payment was activated.
See the [production activation checklist](isolated-test-approval-package.md#production-activation-checklist--9-october-2026)
for remaining code, custody, seller and approval gates. Do not recreate sandbox objects.
