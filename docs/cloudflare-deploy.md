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
3. Turn on [Stripe Tax](https://docs.stripe.com/tax) and set the business
   address and the UK/EU VAT behaviour you want. The Worker sends
   `automatic_tax[enabled]=true` and a GBP base price. Tax and local currency
   are added by Stripe, so charged totals will not always equal £1.99, £4.99,
   or £9.99.
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

`STRIPE_SECRET_KEY` must be `sk_test_...` until you deliberately switch to live.
The Worker rejects `sk_live_` and events with `livemode: true`.

Non-secret vars already in `wrangler.jsonc`:

- `STRIPE_API_MODE=test`
- `PUBLIC_APP_ORIGIN=https://brideprice.classesforculture.com`
- `EMAIL_FROM=receipts@mail.classesforculture.com`
- `EMAIL_PROVIDER=resend` (change to `postmark` if you choose Postmark)

Run one test purchase with card `4242 4242 4242 4242`. Confirm the order
becomes fulfilled, the entitlement appears, a second delivery of the same
webhook does not add a second entitlement, and a test refund removes it.
Then repeat a partial refund and a dispute in the Stripe test dashboard and
confirm partial refunds stay in `review_required`.

Do not create a live webhook or put an `sk_live_` key in the Worker. The
current code rejects live keys and live events. A later change can allow
`STRIPE_API_MODE=live` after this test purchase and the legal pages are
approved.

## 3. Email

Pick one:

- Resend: verify the subdomain `mail.classesforculture.com` and set
  `EMAIL_PROVIDER=resend`. Secret: `EMAIL_API_KEY` (Resend API key).
- Postmark: verify the same kind of subdomain and set
  `EMAIL_PROVIDER=postmark`. Secret: `EMAIL_API_KEY` (server token).

`EMAIL_FROM` must be an address on a subdomain, for example
`receipts@mail.classesforculture.com`. The apex is rejected.

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

## 5. Legal approval

These pages are drafts:

- `/privacy`
- `/terms`
- `/refunds`

They name Ayodele Ayeni trading as Classes for Culture and
`team@classesforculture.com`. They do not claim a company number, VAT number,
or ICO registration. The checkout waiver for UK, EU, and EEA buyers is
placeholder text in `paid/catalog.ts` (`WAIVER_TEXT`). Approve or replace it
before live charges. A voluntary refund policy is described as not yet
activated.

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
  Cowrie and Royal Reveal balances are summed from D1 entitlement rows. KV only
  caches that sum and is rewritten after each paid, refunded, or duplicate webhook.
  A failed cache write is repaired when Stripe delivers the event again.
- Adaptive Pricing means the captured currency may not be GBP. The Worker
  accepts a non-GBP total that Stripe signed, and rejects a GBP total below
  the base price. Tax can make a GBP total higher than the shelf price.
- Stripe Tax does nothing until it is enabled and the origin address is set
  in Stripe. Checkout creation will fail from Stripe’s side until then if
  `automatic_tax` is rejected. Fix that in the dashboard, not by removing the
  flag, unless you explicitly decide to launch without tax.
- The older Google Drive, SMTP, and benchmark code is still in the repository
  for the previous test suite. Do not deploy `worker/operations.mjs`,
  `wrangler.operations.jsonc`, or the retained benchmark.
- Live keys are refused on purpose. A live launch is a separate change after
  the test purchase.
- Placeholder legal copy must not be treated as advice or as an approved
  consumer contract.
