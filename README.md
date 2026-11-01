# What’s Your Bride Price?

Paid party quiz for Classes for Culture. The free game already runs at
[brideprice.classesforculture.com](https://brideprice.classesforculture.com).
This branch is the paid Cloudflare Workers version: Stripe Checkout in test
mode, entitlements, refunds, and receipt email. Nothing here is deployed.

Canonical and social metadata use `https://brideprice.classesforculture.com`.

## Run the paid Worker locally

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev:worker
```

Open the printed local URL. Finish a round, then buy Cowries or Royal Reveal.
Mock mode does not call Stripe and does not create a charge. The test card
button signs a webhook and unlocks the purchase.

With a real Stripe test secret (`sk_test_...`), set `STRIPE_API_MODE=test` in
`.dev.vars` and put the secret and webhook signing secret there. Never commit
that file.

## Checks

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:paid
npm test
npm run build:worker
```

`npm test` builds the existing quiz UI. `npm run test:paid` covers Checkout,
webhooks, refunds, and a local Worker. `build:worker` is a dry run. It does
not create Cloudflare resources.

Load shape for a staging URL only:

```bash
k6 run -e STAGING_URL=https://your-staging-host load/k6-games.js
```

100,000 completed games a day is about 2 requests a second in that script.
The peak scenario then holds 100 completions a second for 30 seconds.

## What is deployed later

The paid entry point is `worker/paid.ts` with `wrangler.jsonc`. Static files
in `public/` are served from the edge asset binding. Completed games write to
KV. Orders, webhook idempotency, and entitlements write to D1. Play does not
touch D1.

Google Workspace, SMTP, and Drive are not on this path. ChatGPT Sites config
has been removed. Older recovery code remains in the tree so existing quiz
tests still run. It is not the paid deploy.

Go-live steps, secrets, and the owner checklist are in
[docs/cloudflare-deploy.md](docs/cloudflare-deploy.md).

## Legal pages

`/privacy`, `/terms`, and `/refunds` are routed in the Worker and in the quiz
app. The copy is marked placeholder and needs Ayodele Ayeni’s approval before
publication. UK, EU, and EEA checkout asks for an express acknowledgement that
immediate digital supply ends the 14-day withdrawal right.
