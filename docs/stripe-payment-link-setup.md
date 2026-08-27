# Stripe Payment Link activation guide

Nothing in Prompt 17 creates, activates or calls a Stripe Payment Link. Complete these gates manually in order, with owner and appropriate professional approval, before live commerce:

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
