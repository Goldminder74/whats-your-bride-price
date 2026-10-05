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
