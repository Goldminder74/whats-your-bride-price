# Royal Reveal commerce and entitlement contract

Date: 26 August 2026
Status: implemented locally, disabled, unbound and not approved for live use

`royal_reveal_v1` is a one-off digital product priced at exactly GBP 199 (£1.99). It is never a subscription. The existing `commerce` build flag remains false by default, cannot be enabled by a query parameter and must fail closed unless D1, the complete server configuration and an approved production rate limiter are present. Local fixtures additionally require the established review-build gate. No secret is injected into a client bundle.

## Purchase boundary

Before checkout is offered, a same-origin completion POST accepts only the raw tab credential, approved avatar ID, an idempotency value and stable question/option identifiers. It does not accept an edition, score, total, tier, title, result slug, order reference, Checkout Session ID or payment claim. The server derives the anonymous owner hash, derives the single active edition from the twelve published, approved D1 question records, validates every option against those records and recomputes the score. One D1 batch writes the owner-bound completed attempt, twelve answer rows and one immutable private result. The response exposes only the result's 192-bit opaque slug; the raw credential and stored hash are never returned.

The same-origin order POST accepts only a completed active result, the existing raw anonymous-session credential, the exact product key, an idempotency key and an affirmative immediate-delivery-consent record. It enforces body limits, Origin and Fetch Metadata, rate limiting and D1 availability. The server derives the domain-separated owner hash and compares it in constant time; a stored hash cannot act as a credential. Amount, currency, owner, product, result and status are server-authoritative.

The response contains only an opaque public order reference, `royal_reveal_v1`, the £1.99 display price, expiry and a validated Stripe-hosted URL. The URL is configured as HTTPS on `buy.stripe.com`, has no credentials, fragment or pre-existing parameters, and receives exactly one opaque `client_reference_id`. Names, email, result slugs, challenge codes, credentials, hashes, answers and secrets never enter it. Normal same-window navigation is used. Tab-local storage holds only the opaque pending-order reference.

## Authoritative state

`commerce_orders` records the controlled order state and verified Stripe identifiers. `commerce_entitlements` binds one successful order to the exact active result, owner hash and product. `stripe_webhook_events` stores replay/audit metadata and a payload digest, never the payload. The D1 repository applies event recording, order transition and entitlement grant/revocation in one batch. Unique event/session/payment-intent constraints and deterministic idempotency hashes make retries inert.

The pending order stores the result's internal foreign key and the same server-derived owner hash used by its completed attempt. Webhook processing resolves the order only from the verified opaque client reference (or a previously verified Payment Intent relationship), then copies the order's result/owner/product tuple into the entitlement. Browser query values, the Stripe return redirect and a browser-supplied Checkout Session ID never select or replace that tuple.

The return page is not evidence of payment. It removes query values from browser history, shows a neutral confirmation state, and polls the protected order-status endpoint for a bounded period using the owner credential. Values such as `success`, `paid`, `session_id` and `product` are ignored. Only a verified active entitlement projection can unlock local premium generators, and it applies only to the purchased result.

## Webhook boundary

The POST-only webhook reads at most 65,536 raw bytes before JSON parsing. It verifies `Stripe-Signature` with HMAC SHA-256, accepts multiple `v1` candidates, applies a five-minute tolerance, compares digests in constant time, and validates expected livemode, Payment Link, product relationship, GBP 199 amount, currency and opaque client reference. It accepts only:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `charge.refunded`
- `charge.dispute.created`

A paid completion or asynchronous success grants the same entitlement idempotently. An unpaid completion remains processing. Asynchronous failure marks the order failed. A full refund revokes; a partial refund records `review_required` without automatic revocation. A dispute conservatively revokes access. Processing does not depend on browser cookies, analytics consent, redirect order or webhook delivery order.

## Retention and deletion

Pending orders expire; commerce rows have explicit retention-expiry and soft-deletion fields. Version-1 retention is capped at 500 days in application contracts. Webhook rows contain no customer profile, card, bank, billing address, receipt, name, email, phone or free-text description. Production needs an approved scheduled retention/deletion operation before activation.

## Free and entitled surfaces

The quiz, basic result, nominations, challenges, copy-link sharing, free static portrait and free static Story image remain available without payment. The entitled pack contains the five-second 1080 × 1920 Story/Reel video, three 1080 × 1350 PNG portraits (Royal Gold, Cowrie Crown and Indigo Celebration), and a 2480 × 3508 PNG Royal Culture Score Certificate. Every generator validates a private, result-specific verified entitlement projection; hiding UI is not the security boundary. Private photographs are excluded and no premium media is uploaded.

All premium media uses approved edition, authoritative score and maximum, approved title, approved avatar, regional identity, product branding and: “A playful culture score, never a measure of human worth.”
