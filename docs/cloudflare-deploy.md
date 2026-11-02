# Deploy the paid Worker

This is the checklist for Ayodele Ayeni (Ayo). The repository does not deploy,
create Cloudflare resources, change DNS, or take a live payment.

Do the steps in order. Stop if a dashboard value does not match what is written
here.

## 1. Cloudflare account

Create these resources in the Cloudflare account that should own the game.
Do not reuse `wybp-prod-app-r001`, `wybp-prod-ops-r001`, `wybp-test-r001`, or
any D1 database those Workers already created.

| Resource | Suggested name | Binding |
| --- | --- | --- |
| Worker | `wybp-paid` | the script in `wrangler.jsonc` |
| D1 | `wybp-paid` | `DB` |
| KV namespace | `wybp-paid-games` | `GAME_KV` |
| R2 bucket, optional | `wybp-paid-media` | `MEDIA`, only if result files move out of static assets |

Permissions for the person or token that deploys:

- Account / Workers Scripts: Edit
- Workers KV Storage: Edit
- D1: Edit
- Workers Routes or Workers Custom Domains, when the hostname is attached
- Account Settings: Read, so Wrangler can see the account

A Workers Paid plan is already on the account from earlier work. Do not buy
another plan for this checklist. Confirm the account can hold the expected
volume before the first public day: 100,000 completed games in a day, with
short peaks of 50 to 100 games a second. Completions are KV writes on 256
separate daily keys, plus one result object each. Purchases are the only D1
writes on the request path.

`compatibility_date` is `2026-05-22` because that is the newest date the pinned Wrangler in this repo can run locally. Raise it when Wrangler is upgraded.

Replace the placeholder ids in `wrangler.jsonc`:

- `d1_databases[0].database_id`
- `kv_namespaces[0].id`

Leave `workers_dev` and `preview_urls` as false until you choose a hostname.
Do not add a route until DNS is ready.

Apply the schema to the new D1 database, from this directory, against the
remote database only after the id in `wrangler.jsonc` is the real one:

```bash
npx wrangler d1 migrations apply wybp-paid --remote
```

`--local` is safe for a laptop. `--remote` writes the new database. It does
not touch the old databases if the config id is the new one.

## 2. Stripe, test mode first

In the Stripe dashboard for Classes for Culture:

1. Stay in **test mode**.
2. Turn on [Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing).
3. Leave Stripe Tax off. The seller is not VAT registered, and EU purchases
   are blocked. `STRIPE_AUTOMATIC_TAX` stays `off`, so Checkout is not asked
   to calculate tax. Prices shown are the final price. Adaptive Pricing may
   still present that price in the buyer's currency. Turn tax on only after
   VAT registration, by setting `STRIPE_AUTOMATIC_TAX=on` and enabling Stripe
   Tax in the dashboard.
4. Create a webhook endpoint for the test Worker URL
   `https://<host>/api/paid/webhook`.
5. Send these events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `charge.refunded`,
   `charge.dispute.created`.
6. Copy the test webhook signing secret.

Put secrets with Wrangler. Do not paste them into git, chat, or `wrangler.jsonc`.

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

`STRIPE_SECRET_KEY` stays a test key until the live Worker is switched on purpose.
The committed config sets `STRIPE_MODE=test`. Test mode rejects `sk_live_`,
`rk_live_`, `cs_live_` sessions, and events with `livemode: true`.

Live payments are a separate switch on the deployed Worker, not a change to
this file's default:

- Set the var `STRIPE_MODE=live`. Leave `STRIPE_API_MODE=test` so the Worker
  calls Stripe rather than the local mock. `STRIPE_MODE=live` with
  `STRIPE_API_MODE=mock` is rejected.
- Put a restricted live key in the `STRIPE_SECRET_KEY` secret. The key in use
  is `rk_live_...` with Stripe's "full access except sensitive operations"
  preset. `sk_live_...` is also accepted. Test keys are rejected in live mode.
- Create the live webhook endpoint at `https://<host>/api/paid/webhook` and
  store that endpoint's signing secret. A live key with a test-mode event, or
  a test key with a live event, is rejected even when the signature matches.
- `GET /api/paid/health` reports `stripeMode` as `live` or `test`. Local mock
  mode reports `mock`.

The restricted key is sent as `Authorization: Bearer`. The Worker calls only:

- `POST /v1/checkout/sessions` (create). The returned id must be `cs_live_` in
  live mode and `cs_test_` in test mode.
- `POST /v1/refunds` with `payment_intent`, for a blocked-country refund.

It does not retrieve charges, PaymentIntents, sessions, or events. Those reads
are covered by the same preset if Stripe later requires them. Webhook delivery
uses the signing secret, not the restricted key. The Worker does not call
sensitive resources such as raw card data, identity documents, or bank account
numbers. `payment_intent_data[metadata]` is part of the Checkout Session
create, which that preset allows.

Checkout has no session field for a support URL. The session sets the
supported terms agreement and a support link in custom text:

- `consent_collection[terms_of_service]=required`
- `custom_text[terms_of_service_acceptance][message]` linking to
  `https://brideprice.classesforculture.com/terms`
- `custom_text[after_submit][message]` linking to `team@classesforculture.com`

Before the first Checkout Session, set the same terms URL in Stripe public
details. Stripe refuses the terms checkbox when that URL is missing. Support
email, phone, and the footer policy links are the public-details settings, not
a session parameter.

Non-secret vars already in `wrangler.jsonc`:

- `STRIPE_API_MODE=test`
- `STRIPE_MODE=test`
- `STRIPE_AUTOMATIC_TAX=off`
- `PUBLIC_APP_ORIGIN=https://brideprice.classesforculture.com`
- `EMAIL_FROM=What's Your Bride Price? <noreply@mail.classesforculture.com>`
- `EMAIL_REPLY_TO=team@classesforculture.com`
- `PAID_BLOCKED_COUNTRIES` defaults to the EU27 plus Iceland, Liechtenstein and Norway. Free play is not affected. Set it to `none` only after EU VAT (non-Union OSS) registration. The UK is not in the default list.
- `EMAIL_PROVIDER=resend` (change to `postmark` if you choose Postmark)

Run one test purchase with card `4242 4242 4242 4242`. Confirm the order
becomes fulfilled, the entitlement appears, a second delivery of the same
webhook does not add a second entitlement, and a test refund removes it.
Then repeat a partial refund and a dispute in the Stripe test dashboard and
confirm partial refunds stay in `review_required`.

Do not point this branch's `wrangler.jsonc` at live. Set `STRIPE_MODE=live`,
the `rk_live_` secret, and the live webhook secret only on the Worker that
should take real charges, and only after the test purchase above.

## 3. Email

Pick one:

- Resend: verify the subdomain `mail.classesforculture.com` and set
  `EMAIL_PROVIDER=resend`. Secret: `EMAIL_API_KEY` (Resend API key).
- Postmark: verify the same kind of subdomain and set
  `EMAIL_PROVIDER=postmark`. Secret: `EMAIL_API_KEY` (server token).

`EMAIL_FROM` must use an address on a subdomain. A display name is allowed, for example
`What's Your Bride Price? <noreply@mail.classesforculture.com>`. The apex is rejected.
`EMAIL_REPLY_TO` is the human support address, `team@classesforculture.com`.

Human mail for `team@classesforculture.com` stays on PrivateMail. This app
does not configure it.

```bash
npx wrangler secret put EMAIL_API_KEY
```

## 4. DNS

Do this only when the test Worker behaves correctly.

1. Attach `brideprice.classesforculture.com` as a Worker custom domain, or add
   a route for that hostname.
2. If DNS for `classesforculture.com` is on Cloudflare, the custom domain
   flow writes the record. If DNS is still at the current registrar, add the
   CNAME Cloudflare shows. Remove the old ChatGPT Sites hostname mapping for
   this name only after the Worker answers on the new target.
3. Keep the previous free game available until the new host serves the quiz,
   privacy, terms, and refunds pages.
4. Do not change unrelated website DNS.

## 5. Legal pages

The seller postal address appears only on these pages:

- `/privacy`
- `/terms`
- `/refunds`

Seller: Ayo Ayeni, trading as Classes for Culture. Postal address: 35 Melrose
Avenue, Borehamwood, Hertfordshire, WD6 2BH, United Kingdom. Support:
`team@classesforculture.com`. Do not repeat that address in the site footer,
the game, or receipt and refund email. No company number, VAT number, or ICO
registration number is shown. The checkout waiver for UK, EU, and EEA buyers
is still the text in `paid/catalog.ts` (`WAIVER_TEXT`). A voluntary refund
policy is described as not yet activated.

## 6. Deploy command, when the above is done

```bash
npx wrangler deploy --config wrangler.jsonc
```

Confirm `wrangler whoami` is the intended account first. The dry run is
`npm run build:worker`.

## Scale notes

- Quiz questions and art are static assets, cached by the asset binding.
- `GET /api/paid/questions` is cacheable for a day and contains no answer keys.
- `POST /api/paid/games/complete` scores in the Worker and writes KV only.
- Stripe webhooks are signature-checked, limited to test mode, and stored by
  event id so retries do not grant twice.
- Paystack is a seam (`paid/paystack.ts`) for later Nigeria bank transfer,
  Ghana mobile money, and Kenya M-Pesa. It returns `paystack_not_enabled`.

## Risks

- KV game counters are sharded and approximate. They are not the financial ledger.
  Cowrie and Royal Reveal balances are summed from D1 entitlement rows. `/api/paid/access`
  and Cowrie spends read that D1 sum, so a stale KV cache cannot keep a refunded balance
  visible. KV is only rewritten as a hint. Game completion does not read or write D1.
- Adaptive Pricing means the captured currency may not be GBP. The Worker
  accepts a non-GBP total that Stripe signed, and rejects a GBP total below
  the base price. With tax off, Checkout is not asked to add tax on top.
- Setting `STRIPE_AUTOMATIC_TAX=on` before Stripe Tax is configured in the
  dashboard can make Checkout creation fail. Leave it `off` until VAT
  registration. Billing address country is still collected so a blocked EU
  or EEA billing country can be refunded.
- Deploy only `worker/paid.ts` through `wrangler.jsonc`. The vinext quiz in
  `app/` is not the paid host.
- Live charges stay off until `STRIPE_MODE=live` is set on that Worker together
  with an `rk_live_` or `sk_live_` key and the matching live webhook secret.
  The committed default is test, which still refuses live keys and live events.
- Placeholder legal copy must not be treated as advice or as an approved
  consumer contract.
