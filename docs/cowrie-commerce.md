# Cowrie commerce — disabled local implementation

Commerce, Cowrie economy and random Quick Play remain off by default. This source does not create Stripe products or links, contact Stripe, bind storage, apply hosted migrations or approve research questions. Legal wording remains draft. All five canonical banks have twelve published questions; all 352 research candidates remain drafts. Purchasing needs thirty currently eligible approved/published questions in **every** bank.

| Product | Purchased Cowries | GBP minor units | Display | Approximate unit cost |
| --- | ---: | ---: | --- | --- |
| cowrie_5_v1 | 5 | 199 | £1.99 | 40p |
| cowrie_15_v1 | 15 | 499 | £4.99 | 33p |
| cowrie_40_v1 | 40 | 999 | £9.99 | 25p |

Royal Reveal remains the independent `royal_reveal_v1` direct £1.99/199 GBP result-specific purchase. It cannot be bought with Cowries. Products are one-off, with no subscription, transfer, cash withdrawal or variable pricing.

## Authoritative targets and purchase gates

Royal orders require a result and prohibit a wallet. Cowrie orders require a wallet and prohibit a result. Insert guards verify ownership, product, amount and target. Immutable guards prevent rebinding orders and allocations. A unique payment hash prevents one Payment Intent from crediting multiple orders. Allocations and purchase credits must refer to the exact fulfilled order, product and wallet; each order gets at most one of each. Legacy `cowrie_pack_v1` allocations are copied unchanged for historical compatibility and cannot be inserted as new purchases.

The existing `/commerce/orders` POST handles both targets. The protected `/commerce/status` POST handles offers and payment status. Strict JSON field allowlists reject browser prices, amounts, balances, quantities, Stripe identifiers, hashes and states. Ownership uses the existing raw anonymous credential and server-derived constant-time comparisons. HTTPS, configured application origin, same-origin Origin/Fetch Metadata, streaming body bounds, storage and rate-limit checks remain mandatory. Loopback HTTP is restricted to the existing local commerce review mechanism.

Cowrie offers require all three flags, an active owned wallet, all five ready banks, complete bundle configuration and approved D1/distributed limiting. The production limiter deliberately remains unavailable and the build readiness checks remain unapproved; this is not activation-ready. Royal commerce retains its independent existing gates. Query parameters, storage, cookies and browser input cannot enable any feature.

## Signature-first reconciliation

The existing webhook route reads the exact UTF-8 body within 65,536 bytes before parsing. It verifies HMAC-SHA256, five-minute tolerance and multiple v1 signatures with constant-time comparisons. Livemode, controlled type and shape/price/link/currency/payment facts are checked before deriving a domain-separated SHA-256 Payment Intent hash. A private verification brand prevents plausible JSON from reaching persistence. New events never persist raw Payment Intent/Charge IDs, bodies or customer/card information. Existing historical order identifiers are retained unchanged as expressly required; a signature-first read-only legacy lookup associates their opaque order reference.

Only the existing five event types are handled. The webhook audit gains exactly three nullable verified facts: `payment_intent_hash`, `amount_minor`, `amount_refunded_minor`. The hash is 64 lowercase hexadecimal characters and is never a credential. Amounts are non-negative safe integers; refunded amount cannot exceed total. The single added webhook lookup index is `stripe_webhook_events_payment_intent_received_idx(payment_intent_hash,received_at) WHERE payment_intent_hash IS NOT NULL`.

Early adverse events remain `received` with no order until a verified checkout establishes the indexed relationship. Every fulfilment batch searches current matching adverse rows before creating any allocation or credit. State decisions occur inside the transaction, covering both arrival orders and preflight/storage races. Verified paid final facts win asynchronous failure, while refund, dispute and review state prevent later success from granting value. Unpaid completion remains processing. No return-page query or redirect can fulfil an order.

Pending fulfilment authority is bounded by the earlier of the stored pending deadline and thirty minutes from order creation. Existing webhook retention stays 400 days. Thus adverse evidence outlives every valid pending/async fulfilment window. Expired orders require support handling; delayed events do not revive them. The bounded, explicitly authorised retention operation cannot be invoked by ordinary play or browser input. Financial wallet/ledger deletion remains subject to separate legal and operational review; purchased Cowries do not expire.

## Atomic fulfilment and allocation-specific settlement

One atomic batch associates the event, reconciles adverse facts, checks active wallet/owner authority, marks paid/fulfilled, creates one exact allocation, appends one purchased credit and updates the cached balance through existing append-only ledger triggers. Failure rolls back every step. Idempotent keys and uniqueness prevent duplicate grants under concurrent delivery. Royal entitlements and Cowrie credits remain mutually exclusive.

Existing Quick Play spends valid bonuses first, then the oldest active purchased allocation. The exact debit and allocation decrement share a transaction. A pre-issuance technical failure restores that allocation once; an issued game cannot be restored after a network failure. Adverse settlement retires eligible unissued funded attempts on **active** wallets through the same conditional reversal statements. A transaction guard aborts if a new unissued debit races that bounded read.

Full refunds remove only the exact unused allocation remainder. Partial refunds set `review_required` and preserve all wallet value pending owner decision. Consumed value is derived from existing unreversed, allocation-linked Quick Play debits; it produces protected review rather than debt. Disputes remove only the exact unused allocation and retain dispute provenance. Other purchases, bonus balance/expiry and free allowance are unaffected.

Both settlements use strictly negative `refund_reversal` entries. `reason_code=verified_refund` and `reason_code=verified_dispute` distinguish the financial cause. `dispute_freeze` stays zero-only under migration 0009's unchanged CHECK and is forbidden on frozen wallets. A dispute is never projected as a customer refund. Review-required disputed orders carry controlled `settlementCause=dispute` in the protected projection and distinct return wording. Cowrie-specific analytics remain unsupported; no event name/schema or redirect purchase event was added.

Migration 0010 replaces only the two directly related active-wallet/reconciliation triggers and adds the settlement-authority guard. A frozen wallet admits only a negative purchased `refund_reversal` with exact order/allocation/wallet/current owner/product, matching original credit, applicable verified adverse state and still-unprocessed signature-first audit evidence. It cannot exceed either allocation remainder or purchased balance. State and credentials stay frozen and unchanged. No credit, play debit, bonus operation, correction, technical reversal or zero dispute entry can use the exception. Frozen unissued or consumed funded value cannot be technically restored; existing unreversed debit facts preserve review while unused value is removed. No replacement value is fabricated.

## Return, consent and privacy

The selector is absent when unavailable. No bundle or immediate-delivery consent is preselected. The visibly draft notice separately requests immediate digital delivery and explains that cancellation rights may be affected. Orders store the exact notice version, controlled product, wallet and server timestamp. Draft terms/privacy links, free play options, expiry/refund wording and the human-worth safeguard remain visible.

Navigation uses the configured exact HTTPS `buy.stripe.com` URL and appends only opaque `client_reference_id`. The client stores only the opaque pending reference in validated tab-local storage. It creates no recovery credential. `/cowries/return` removes query values, reads existing ownership, uses the protected status endpoint and polls at most twelve times with an eighteen-second total budget. Terminal status removes the reference; local privacy clearing is explicitly allowlisted. The redirect never credits balances. Wallet identifiers/ownership are not reused for analytics. No signing or reconciliation configuration enters the client bundle.

## Migration and later manual configuration

`0010_hard_aqueduct.sql` transactionally creates, copies and verifies replacement orders/allocations before swapping them. It verifies exact row counts/old values, restores webhook order references affected by parent replacement, recreates existing indexes, checks foreign keys and then adds the three nullable audit columns using ALTER TABLE. Historical new fields are null. Deferred FK checks are explicitly resolved after the integrity guard; a failing step rolls the entire migration back. No 0011 or new persistent table exists.

Later manual Stripe/account work requires separate approval: create the exact three one-off GBP products and Payment Links, configure the return destination on staging/production as appropriate, and configure only the reviewed webhook events. For each uppercase prefix `COWRIE_5_V1`, `COWRIE_15_V1`, `COWRIE_40_V1`, runtime configuration requires `_PAYMENT_LINK_URL`, `_PAYMENT_LINK_ID`, `_PRODUCT_KEY`, `_QUANTITY`, `_AMOUNT_MINOR`, `_CURRENCY` and `_LIVEMODE`. The existing Royal configuration and shared server-only signing configuration remain required. No real secret is supplied by this task. Final controller, consumer-rights, cancellation/refund, support, tax/VAT, retention, processor, privacy/legal and distributed-limiter review must precede any activation.

Local synthetic review uses the existing explicit review build, commerce, Cowrie and random fixture controls. They create no production content or hosted data. The test runner routes all browser external requests away from the network, stores screenshots/traces/reports under the OS temporary directory, and exercises exact prices, unchecked consent, all payment states, updated balances, 320px/mobile/zoom/focus/reduced-motion layouts.
