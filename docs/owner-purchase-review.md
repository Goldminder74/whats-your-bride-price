# Owner review: purchases, refunds and seller details

15 October 2026. DRAFT — no public terms, Stripe setting or website changed.
Owner approval is a product/business decision, not professional legal sign-off.
Previously approved retention rules and completed Stripe setup are not being reopened.

## Decisions requested

| Decision | Proposal | Owner response needed |
|---|---|---|
| Paid territories | UK consumers initially. Enforce eligibility before checkout; language, currency and IP alone are not evidence of residence. | UK-only, or list specific additional countries for tax/consumer review. Worldwide is not assumed. |
| Products/refunds | Approve or revise the draft below, with consumer-law review of Cowrie credits versus future services. | Accept/revise; record any professional advice separately. |
| Support | team@classesforculture.com; acknowledge within two working days as a proposed service target. Escalate payment, privacy and complaint cases to Ayodele Ayeni. | Approve a target you can actually meet and the complaint route. This is not an existing promise. |
| Seller details | Actual geographical establishment/contact address, complaints address if different, and available/required telephone contact. | Install securely as described below; never paste them into chat. |

Free-game territories remain a separate decision. Confirm any genuinely unresolved
audience/children, ICO fee, lawful-basis and processor/transfer assessments against the
existing legal checklist; do not treat earlier owner policy approval as those assessments.
UK-only sales still require turnover/VAT monitoring; current non-VAT registration
does not establish the future tax position at the planned sales volume.

## Proposed purchase and refund wording

“Pick your next adventure: 5 Cowries £1.99, 15 Cowries £4.99 or 40 Cowries £9.99.
After your two free games, one Cowrie buys one eligible random Quick Play.
These are one-off purchases, with no subscription. Purchased Cowries do not expire;
bonus Cowries expire after 180 days. Cowries cannot be transferred, resold or withdrawn
as cash. We never forfeit purchased value to close a wallet.”

“Royal Reveal costs £1.99 and unlocks the premium pack for this result only:
portraits, certificate and animated Story media. Regenerate downloads while the
result is active, up to 90 days. Files you download stay on your device.”

“Delivery follows verified payment. If payment is pending or needs review, we will
not grant a second purchase simply because you refresh or return from checkout.”

“Contact team@classesforculture.com about cancellations, faults or refunds. Your
statutory rights remain. Verified unused full refunds reverse the relevant purchase.
Used credits, partial refunds, disputes and mismatched amounts require review;
we do not invent a debt, exchange rate or proportional reversal. Approved refunds
use the original payment method. Wallet freezing preserves your balance and does
not itself cancel a purchase or complete wallet closure.”

Separate, unchecked immediate-delivery consent must remain beside the purchase.
For Royal Reveal digital content, proposed acknowledgement: “I request immediate
delivery and understand that once delivery begins I lose my 14-day cancellation
right for this digital content. My rights if it is faulty or not as described remain.”
Do not automatically apply that waiver to Cowrie credits: classification and the
appropriate service/credit cancellation wording remain a review decision.
Keep exact original GBP product/price validation alongside permitted converted
presentment. Unreconciled adverse amounts stay review-required.

## Durable confirmation: procedure to implement before live sales

1. Before checkout, show seller details, product, total price, delivery scope,
   cancellation/refund terms, complaint route and the version of the terms.
2. Record the order-specific terms version and explicit consent/acknowledgement
   with the authoritative order, without analytics consent being required.
3. After signature-verified successful settlement, provide a saveable order-specific
   confirmation and deliver it by an approved durable route. It must contain seller
   details, order/product/price, the actual terms and applicable cancellation consent.
   Do not put wallet recovery credentials or private operational identifiers in it.
4. Confirm the chosen route works on mobile and without analytics; retry the same
   confirmation idempotently. An uncertain email delivery must not duplicate fulfilment.
5. Test refunds/revocation against that order. A Stripe receipt alone is sufficient
   only if it actually contains the required contract and consent information.

This procedure is proposed, not installed or verified. Existing sandbox purchases
did not demonstrate durable contract emails. Selecting email would require secure
customer-email handling and a compatible transactional sender, separately assessed
against budget and retention; the operational alert mailbox is not assumed to be
a customer receipt service. No new migration is authorised by this document.

## Secure seller-address steps

1. Save the exact public seller details in your password manager under
   “Classes for Culture — public seller details”. No identity documents or bank data.
2. Do not change Stripe again merely for this task: its setup is owner-confirmed complete.
3. Website installation is still pending. `app/legalConfig.ts` currently contains null
   placeholders; there is no verified working address Secret/form that populates it.
   The earlier shorthand “secure runtime mechanism” was a proposal, not a completed route.
4. Before installation, Codex must prepare a private runtime-only configuration route
   and name the exact fields. Enter details directly in that provider's protected UI,
   not chat, Git, logs or build variables. A Secret prevents accidental build/Git exposure;
   the intended seller address will be visible on the eventual legal pages.
5. Review those pages behind private access. Approve publication separately with launch.

UK requirements checked 15 October:
[online selling and durable confirmation](https://www.gov.uk/online-and-distance-selling-for-businesses/online-selling),
[distance-selling information](https://www.gov.uk/online-and-distance-selling-for-businesses/distance-selling),
[Consumer Contracts Regulations](https://www.legislation.gov.uk/uksi/2013/3134),
[overseas digital-service VAT](https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers).
