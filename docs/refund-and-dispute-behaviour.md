# Royal Reveal refunds and disputes

Royal Reveal access is derived from verified payment state, not a redirect. A verified full refund moves the order to `refunded` and revokes the matching entitlement idempotently. A partial refund moves the order to `review_required` and retains the entitlement pending an authorised human decision; the app does not invent a partial-refund policy. A verified dispute moves the order to `disputed` and conservatively revokes access. Repeated or reordered events cannot create a second entitlement or undo a revocation.

Only signed, allowlisted events matching the expected livemode, payment relationship, exact GBP 199 charge and currency can affect state. The webhook stores the event ID, controlled type, livemode, payload SHA-256, timestamps, processing result, optional internal order relationship and retention/deletion fields. It does not store the raw payload, payment instrument, customer details, address, receipt or free text.

Customer-facing refund wording, decision authority, response times, statutory-right treatment and reinstatement rules remain manual activation blockers. They require owner and appropriate professional approval, publication at the configured refund-policy URL, and test-mode evidence before any live-mode approval.
