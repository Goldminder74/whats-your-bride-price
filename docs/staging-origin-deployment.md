# Authorised staging origin

The application supports one explicitly authorised staging origin:
`https://whats-your-bride-price-staging.ayo43077.chatgpt.site`.

`WYBP_STAGING_APP_ORIGIN` must equal that value exactly. `PUBLIC_APP_ORIGIN`, when supplied, must resolve to the same origin. Both values come from trusted build configuration. Request headers, query parameters, browser storage and user input cannot select the trusted origin. Without staging configuration, production continues to default to `https://brideprice.classesforculture.com`.

Run the ordinary complete suite with staging settings absent. Then create the authorised local staging artifact with process-local settings:

```powershell
$env:WYBP_STAGING_APP_ORIGIN = 'https://whats-your-bride-price-staging.ayo43077.chatgpt.site'
$env:PUBLIC_APP_ORIGIN = $env:WYBP_STAGING_APP_ORIGIN
$env:WYBP_FEATURE_FAST_ENTRY = 'true'
$env:WYBP_FEATURE_CHALLENGES = 'true'
$env:WYBP_FEATURE_DYNAMIC_RESULTS = 'true'
$env:WYBP_REVIEW_BUILD = 'true'
$env:WYBP_REVIEW_CHALLENGE_FIXTURES = 'true'
$env:WYBP_REVIEW_RESULT_FIXTURES = 'true'
$env:WYBP_FEATURE_COMMERCE = 'false'
$env:WYBP_FEATURE_FIRST_PARTY_ANALYTICS = 'false'
$env:WYBP_FEATURE_OWNER_DASHBOARD = 'false'
$env:WYBP_FEATURE_DAILY_CHALLENGE = 'false'
$env:WYBP_FEATURE_STREAKS = 'false'
npm run build
node --test tests/staging-origin-rendered-html.test.mjs
```

The staging test invokes the built Worker in-process and does not contact a hosted Site or database. Runtime secrets, hosting project identity, storage bindings and access policy remain environment-owned configuration and are intentionally absent from this source change.
