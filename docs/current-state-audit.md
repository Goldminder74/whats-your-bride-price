# Current state audit

Audit date: 22 August 2026
Repository: `What is Your Bride Price_ App`
Intended public origin: `https://brideprice.classesforculture.com`
Scope: repository and local verification only. Production, DNS and hosting access were not changed or tested.

## Executive summary

The repository contains a working, single-route, client-driven African culture quiz. It implements five regionally themed editions, 60 fixed questions, name entry, 12 avatar choices, on-device photo selection, a 12-question quiz, educational answer reveals, tiered results, downloadable portrait cards, native sharing, WhatsApp nomination links and device-local regional mastery tracking.

The main gaps are architectural rather than visual. Results and challenges are not durable, shared links are generic edition links, `nominated=1` is generated but ignored, metadata is static and points at the old ChatGPT Sites origin, and there is no analytics, D1/R2 data model or privacy-control surface. The approved regression foundation now provides passing lint, standalone TypeScript, unit, rendered-worker and end-to-end checks; typed feature flags that default off; a Sites commerce build guard; structured client error reporting; and a user-safe route error boundary.

## Repository and Git state

- Checkpoint branch: `feature/viral-build-sprint`, created from the approved foundation without altering the working tree. No configured Git remote was returned by `git remote -v`.
- Audited foundation HEAD: `684064501493145e62d3027679b559653f997386` (`test: establish regression and deployment safety foundation`).
- Pre-existing untracked user files, preserved unchanged:
  - `Whats_Your_Bride_Price_Codex_Build_Bible.md`
  - `Whats_Your_Bride_Price_Codex_Build_Bible.docx`
- Prompt 1 consists of these three audit documents plus the already committed `docs/test-and-deployment-runbook.md`.
- A separate six-file sound and score-reveal working-tree change is intentionally outside this documentation checkpoint and is assessed independently before any commit.
- Generated directories such as `dist/`, `.next/`, `.vinext/`, `.wrangler/`, `work/` and `node_modules/` are ignored.

## Exact stack

| Layer | Detected implementation |
| --- | --- |
| Package manager | npm with `package-lock.json` lockfile version 3 |
| Runtime | Node.js `>=22.13.0` |
| UI | React 19.2.6 and React DOM 19.2.6 |
| Framework | Vinext 1.0.0-beta.2, providing a Next App Router-compatible API on Vite rather than a conventional Next.js package |
| Build | Vite 8.0.13 with `vinext()`, `@openai/sites-vite-plugin` and `@cloudflare/vite-plugin` |
| Hosting runtime | Cloudflare Worker-compatible ESM; worker delegates application requests to Vinext and exposes the Vinext image optimiser route |
| Styling | One handwritten global stylesheet plus Tailwind CSS 4 imported through PostCSS; no Tailwind utility usage was found in the app component |
| Language | TypeScript/TSX in strict mode, no emit |
| Database tooling | Drizzle ORM 0.45.2 and Drizzle Kit 0.31.10 are installed, but the application schema is empty and D1 is not bound |
| Authentication scaffold | Optional ChatGPT/SIWC header helpers exist but are not imported or used by the quiz |
| Tests | Node's built-in unit and rendered-worker tests plus Playwright end-to-end smoke tests against a local built-worker preview |
| Analytics | None detected |

`npm ls --depth=0` reports a clean declared dependency tree; no extraneous package is currently reported.

## Commands and current status

| Purpose | Exact command | Current result |
| --- | --- | --- |
| Local development | `npm run dev` | Defined as `vinext dev`; not exercised for this checkpoint |
| Production build | `npm run build` | Passes |
| Production start | `npm run start` | Defined as `vinext start`; not exercised |
| Rendered-worker tests | `npm test` | Passes; this command runs a production build first |
| Unit tests | `npm run test:unit` | Passes; covers score matching/tier boundaries and feature-flag/commerce behaviour |
| Browser smoke tests | `npm run test:e2e` | Passes against the built worker; covers all requested existing journeys and a mobile viewport |
| Complete regression gate | `npm run test:all` | Passes lint, typecheck, unit, rendered-worker and end-to-end suites in sequence |
| Lint | `npm run lint` | Passes with zero errors and zero warnings |
| Standalone typecheck | `npm run typecheck` | Passes with no emit and incremental output disabled |
| Review preview | `npm run preview:review` | Builds and serves the exact output at `http://127.0.0.1:3100` until stopped |
| Migration generation | `npm run db:generate` | Defined but not run because the schema is intentionally empty |

The foundation added the explicit TypeScript and test scripts, the required Cloudflare worker types, focused lint configuration and deterministic preview adapter. The complete gate remains the authoritative check; a build alone does not run every regression test.

## Runtime routes

| Route | Type | Actual behaviour |
| --- | --- | --- |
| `/` | App Router page | The only application page. Server-renders the generic home state, then hydrates the client game |
| `/?edition=west` and the four other valid edition values | Query-driven state on `/` | After hydration, a client effect validates the edition and switches to setup for that region |
| `/?edition={region}&nominated=1` | Query-driven state on `/` | Edition is used. `nominated=1` is not read and has no effect |
| `/_vinext/image` | Worker infrastructure | Vinext image optimisation endpoint, not a product route |
| `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback` | Platform-reserved paths | Helpers know these paths, but the quiz does not initiate or require authentication |
| `examples/d1/app/api/notes/route.ts` | Example source only | Not under the runtime `app/` tree and therefore not an active route |

No `/result/[slug]`, `/challenge/[code]`, `/party/[code]`, privacy route, analytics dashboard or API route exists. `app/error.tsx` is the App Router error boundary for the existing route segment; it reports a sanitised local error record and presents retry/home actions without rendering a stack trace. Source inspection still shows only one product page route.

## Implemented user journeys

### Generic solo play

1. The home screen presents five regional worlds.
2. Selecting a region sets client state, replaces the URL with `?edition={region}` and opens setup.
3. The player may choose one of 12 avatars, upload an image and optionally enter a name of up to 30 JavaScript string units.
4. The quiz runs 12 fixed questions in a fixed order.
5. Single, complete-sentence and image questions submit immediately; multi-select questions require exactly three selections and a separate lock action.
6. Every answer reveals whether it was correct and displays an educational explanation.
7. Culture-gem overlays appear after questions 3, 6 and 9. The HUD derives up to four gems from answered-question count.
8. The result shows a score, tier, fictional cowrie result, aura score, regional artwork and player portrait.
9. The player may share, download, nominate a friend, use WhatsApp or return home.

### Direct regional entry

- A valid `edition` query value opens the relevant setup screen after hydration.
- Invalid values are ignored and leave the player on the generic home screen.
- Because query parsing occurs in `useEffect`, direct links server-render the generic home first. On slow social in-app browsers this can cause a flash of the wrong state and unnecessary home artwork downloads before the setup screen appears.

### Mastery passport

- The best score for each region is stored in `localStorage` under `wybp-region-scores`.
- A score above 8, meaning 9 to 12, earns that region's seal.
- Five qualifying regional scores unlock the All Africa celebration.
- Progress is tied to one browser profile, has no expiry and has no visible clear/reset control.

### About and sound

- An About modal explains educational intent, local photo handling and four broad source collections.
- Sound is generated with the Web Audio API after user interaction. Vibration is requested when supported.
- Sound preference is in memory only and resets on refresh.

## Data and logic locations

| Concern | Source of truth |
| --- | --- |
| Current educational regions and 60 questions | `app/gameData.ts` |
| Question format, correct answer indexes, explanations and topics | `app/gameData.ts` |
| Region palettes, symbols, introductions and culture drops | `app/gameData.ts`, duplicated as CSS custom properties and selectors in `app/globals.css` |
| Avatar catalogue | `app/gameData.ts`; image files in `public/avatars/` |
| Regional scene artwork | `public/regions/` |
| Question artwork | `public/quiz-art/` |
| Screen, selected region, name, photo, answers, sound and transient game state | React state in `app/BridePriceGame.tsx` |
| Score | `app/BridePriceGame.tsx` sums one binary correctness value per question; `app/gameLogic.ts` performs exact-answer matching, including exact-set equality for multi-select |
| Result tier | `app/gameLogic.ts`; `min(3, floor(correctCount / 3))` preserves the 0-2, 3-5, 6-8 and 9-12 boundaries |
| Aura | 150 per correct answer, 45 per incorrect answer, plus a displayed 500 reveal bonus |
| Regional best scores/mastery | Browser `localStorage` key `wybp-region-scores` |
| Static page/social metadata | `app/layout.tsx` and `app/page.tsx` |
| Hosting bindings | `.openai/hosting.json` |
| Feature flags and Sites commerce guard | `app/featureFlags.ts`, resolved and enforced at build time by `vite.config.ts` |
| User-safe route failure UI and structured client diagnostics | `app/error.tsx` and `app/errors.ts`; diagnostics remain in the browser console and are not sent to a collector |

`app/BridePriceGame.tsx` also contains an unused legacy region/question/avatar dataset. It is not the active source of truth and is lint-suppressed, but it still creates maintenance ambiguity.

## Uploaded-photo processing

The visible privacy claim is substantially correct for normal application behaviour: the selected file is read locally with `FileReader.readAsDataURL`, kept in React memory, rendered in local `<img>` elements and drawn into a local canvas. No application `fetch`, form submission, D1 write, R2 write or analytics call transmits the original photo.

Important qualifications:

- Only the browser-provided MIME string is checked. There is no byte-signature verification, file-size limit, dimension limit, decode timeout or decompression-bomb defence.
- The original data URL remains in memory until an avatar is selected, the player restarts or the page closes. There is no explicit Remove photo control.
- Metadata is not explicitly inspected or stripped from the in-memory source. The generated result is a new PNG canvas and normally does not carry the original EXIF block, but this is incidental and untested.
- When the player explicitly shares the result, the generated PNG can leave the device through the operating-system share sheet. Download writes it to the player's device. These are user-initiated disclosures, not server uploads.
- The result PNG can contain the visible photo pixels, name, region, score and tier.

See `docs/data-and-privacy-inventory.md` for the complete data-flow table.

## Sharing, URLs and `nominated=1`

The current nomination URL is constructed in the browser as:

`{window.location.origin}{window.location.pathname}?edition={region}&nominated=1`

Consequences:

- The runtime origin follows whichever host is serving the page, so a player on the custom domain would share that domain.
- The URL selects the regional setup because `edition` is handled.
- `nominated=1` is never read, so it does not create a nomination-aware landing state, challenge, referral record or attribution event.
- `chooseRegion()` replaces the entire query string with only `edition`, so future attribution values would be discarded.
- Restart removes all query parameters.
- Native share cancellation is intentionally ignored; non-cancellation share failures are reported through the structured local error helper. In nomination sharing, any thrown share attempt still returns without clipboard fallback.
- The clipboard fallback can show “Nomination link copied” even when Clipboard API support is absent because the optional call is not verified.
- WhatsApp uses a correctly encoded `wa.me` text URL, but it contains a generic edition nomination, not a durable result or verified score challenge.
- No event distinguishes intent, handoff, successful copy or referred visit.

## Result URLs and metadata

- Results exist only in client memory on `/`. Refreshing loses the result.
- At this historical checkpoint there was no unique, durable or opaque result URL.
- There is no server-authoritative persisted result.
- The only metadata is static page/layout metadata. It cannot vary by edition, score or player.
- There is no canonical link or explicit `og:url`.
- `metadataBase` is hard-coded to `https://whats-your-bride-price.ayo43077.chatgpt.site`, not the intended `https://brideprice.classesforculture.com` origin.
- The generic `og-v2.png` is used for all shares. The unused `og.png` also ships in public assets.
- Social crawlers cannot receive a personalised result title, description or image from the raw HTML.

## Performance risks for social in-app browsers

Measured repository/build facts:

- Public assets total approximately 11.69 MB.
- Built output totals approximately 12.94 MB.
- The five regional images total approximately 0.92 MB and all are eagerly referenced on the home screen.
- The 12 avatars total approximately 1.11 MB and are all mounted when setup opens.
- Quiz artwork totals approximately 3.22 MB. Only current image-question files mount at one time, but there is no explicit lazy-loading policy.
- `og-v2.png` is approximately 2.69 MB. The unused `og.png` adds another 3.18 MB to every deployment package.
- Current client JavaScript chunks total about 413 KB uncompressed, and CSS is about 57 KB uncompressed.

Key bottlenecks:

1. Direct edition links still server-render and initially hydrate the generic home because edition parsing is client-only.
2. Home renders ten `<img>` elements pointing to five regional files. Network caching should deduplicate URLs, but all five files are still eager and may be decoded for multiple visual instances.
3. Images do not declare intrinsic width/height, `loading`, `fetchpriority` or `decoding`, increasing layout-shift and scheduling risk.
4. Setup mounts the complete avatar catalogue rather than prioritising the selected avatar and visible choices.
5. The whole quiz and all 60 questions live in the main client experience; there is no route or edition-level code/data split.
6. Animations, filters, large shadows, blur/backdrop filters and full-screen compositing are extensive. Reduced-motion CSS disables transitions and only a subset of animations.
7. There is no poor-network shell, retry state, service worker, offline mode, performance instrumentation or tested budget.
8. Canvas export decodes full-resolution portrait and region art into a 1080 x 1350 canvas on the main thread with no low-memory mode. Export failures now receive a generic player alert and structured local diagnostic, but there is no degraded-image fallback.

## Accessibility findings

Existing strengths:

- Semantic buttons are used for most actions.
- Important buttons have accessible labels.
- Image-answer alternatives describe each option.
- Answer feedback uses `role="status"`.
- Region cards support keyboard activation and expose button semantics.
- Avatar choices expose `aria-pressed`, and quiz progress exposes progressbar values.
- Overlays declare dialog roles and `aria-modal`.
- A partial `prefers-reduced-motion` treatment exists.
- Responsive layouts cover several mobile breakpoints.

Current risks:

- No focus management, initial focus, focus trap, Escape handling or focus restoration exists for dialogs or screen transitions.
- Region cards use `div[role="button"]` rather than native buttons, so interaction semantics still rely on custom keyboard handling.
- Dynamic screen changes do not move focus or announce the new screen/question heading.
- Many labels and status elements use 5 to 10 px text, presenting readability and zoom risk.
- The name input removes its outline and provides only a colour border change on focus.
- There is no comprehensive `:focus-visible` treatment, skip link or automated axe/accessibility ruleset; the E2E suite exercises keyboard-relevant semantics but is not a WCAG audit.
- Reduced-motion mode still permits poster entrance, portal pulse, live pulse, marquee motion, question entrance, result reveal, gem motion, world drift and coronation fire.
- The All Africa and About dialogs do not prevent background focus.
- The app has not been verified for WCAG 2.2 AA, 200%/400% zoom, 320 px reflow, screen-reader completion or colour contrast.

## Security findings

- There are no active application write endpoints, durable records or app-owned authentication, so current server-side data exposure is small.
- Query-string edition values are checked against the known region map before use.
- React escapes the display name in DOM output, and canvas text rendering does not interpret HTML.
- External source links use `rel="noreferrer"`.

Risks and gaps:

1. Uploaded images lack size, signature and dimension validation, creating a mobile memory-exhaustion and malformed-image risk.
2. No application-level Content Security Policy or other explicit security headers are configured in `next.config.ts` or the worker.
3. Scoring and correct answers are entirely client-side. This is acceptable for an entertainment-only local quiz but cannot be trusted for durable challenges, leaderboards, analytics or entitlements.
4. Share, photo-read and canvas failures now produce structured browser-console diagnostics, and player-visible canvas failures use a generic alert. There is still no remote monitoring, recovery telemetry or detailed fallback.
5. There is no rate limiting, abuse control, CSRF strategy or server-side input validation because there are no active write APIs. These become mandatory before adding D1-backed public routes.
6. Optional authentication helpers are unused. Any future owner dashboard will need explicit server-side authorisation, not only successful SIWC authentication.
7. Dependency vulnerability status was not fetched from the network in this audit. A controlled dependency audit belongs in the next foundation task.

## Privacy findings

- No first-party or third-party analytics, ad pixels, marketing SDKs or tracking cookies were found.
- The app sets no cookies in its own code.
- The only persistent application storage is regional best scores in `localStorage`.
- There is no privacy notice route, storage preference control, local-data clearing action, retention statement, deletion route or minimum-audience statement.
- Hosting/platform request logs may exist outside the repository; their configuration and retention cannot be inferred from source.
- The current human-worth safeguard appears on the home page and conceptually in the About content, but not as the roadmap's exact sentence beside the primary start action, on results or in generated share media.

## Hosting, durable storage and deployment configuration

`.openai/hosting.json` contains:

```json
{
  "project_id": "appgprj_6a866f946500819192961ffd6b073a98",
  "d1": null,
  "r2": null
}
```

- D1: not bound.
- R2: not bound.
- `db/schema.ts`: empty.
- Drizzle journal: no migration entries.
- `db/index.ts`: an unused helper that would access `env.DB` if a binding were added.
- No other durable database, blob store, external API, analytics collector or environment secret was detected.
- `vite.config.ts` correctly maps logical D1/R2 names into local Cloudflare configuration only when present.
- No custom-domain value is stored in hosting configuration. Repository metadata still uses the old ChatGPT Sites URL.

## Roadmap gap matrix

| Roadmap prompt | Current state and gap |
| --- | --- |
| P2 regression baseline/flags | Complete at approved commit `684064501493145e62d3027679b559653f997386`: lint/typecheck/unit/rendered-worker/E2E gates, typed flags defaulting false, user-safe error boundary, structured local diagnostics, review preview and enforced Sites commerce rejection |
| P3 public origin/domain | Intended domain appears only in the untracked Build Bible. App metadata uses the old origin; no central origin validation or canonical URL |
| P4 social entry | Partial edition query support only. No attribution model, poor-network shell, back-button design, diagnostics or measured in-app-browser performance |
| P5 ten-second start | Regional links skip to setup after hydration, but generic home flashes first. No refresh recovery for active quiz, prefetch policy or progressive text fallback |
| P6 safeguard | Similar copy exists, but not the required exact sentence at entry, result and share output |
| P7 Sites data model | No D1/R2 bindings, entities, migrations, data layer, rate limits, retention or server authority |
| P8 privacy-safe identity/photos | Avatar and on-device photo basics exist. No anonymous session, stable avatar IDs, file limits/signature checks, explicit metadata stripping, removal action or deletion token |
| P9 unique challenges | Absent. Current URL is a generic edition query with no opaque code or server record |
| P10 challenge landing | Absent. No server-rendered `/challenge/[code]` route or safe states |
| P11 comparison | Absent. No persisted result, compatible scoring version or head-to-head model |
| P12 nominate three | One generic nominate action exists. `nominated=1` is ignored; no three-slot flow or honest event semantics |
| P13 share centre | Native share, WhatsApp and download are partial. No explicit share centre, Facebook, Instagram/TikTok guidance, reliable copy fallback or platform tests |
| P14 published expiry-bounded results/OG | Absent at this historical checkpoint. Results were in memory, metadata was generic and the canonical origin was wrong |
| P15 Story/Reel media | Absent. Only a static 1080 x 1350 PNG result is generated |
| P16 regional render system | Strong regional visuals exist, but tokens are duplicated across data/CSS/canvas; no shared render model, provenance, approval matrix or visual regression tests |
| P17 first-party analytics | Absent |
| P18 owner funnel dashboard | Absent; no owner authorisation surface exists |
| P19 UK privacy controls | Absent except short local-photo copy and one localStorage key |
| P20 versioned question engine | A typed static file exists, but questions lack IDs, versions, difficulty, per-question sources, review state, provenance and deterministic selection |
| P21 50+ approved questions/region | Only 12 per region. Sources are broad collection links, not per-question citations; no human review workflow |
| P22 random/daily/streak | Fixed questions and order. The HUD streak is only consecutive correct answers in the current session, not a daily retention streak |
| P23 Groom/Couples modes | Absent |
| P24 Party mode | Absent |
| P25 commerce migration plan | Absent; required before any commerce host change |
| P26 separate Netlify deployment | Absent and outside this audit's authority |
| P27 Royal Reveal payment | **BLOCKED on ChatGPT Sites.** Must remain blocked until production is demonstrably on a host that permits transactions |
| P28 other paid products | **BLOCKED on ChatGPT Sites.** Same commerce gate applies |
| P29 TikTok API posting | Absent and correctly not attempted without developer app approval, OAuth review and a suitable host/privacy model |
| P30 sponsorship/ads | Absent; must depend on consent controls, cultural review, analytics definitions and owner approval |
| P31 final preflight | Not performed. Accessibility, security, performance, privacy and cultural-review findings still prevent a release-ready declaration despite the passing regression gate |
| P32 controlled launch | Not performed. Feature flags and a rollback runbook now exist, but monitoring, durable metrics, launch evidence and production approval do not |
| P33 invitation A/B test | Absent and must wait for stable first-party analytics and sufficient sample size |
| P34 sponsored weekly pilot | Absent and must wait for sponsorship controls, privacy choices and cultural approval |

## Dependency map

1. The regression baseline, typecheck/lint repair, feature flags, error handling and commerce-on-Sites build guard are complete in the approved foundation commit.
2. Canonical origin/public-access verification and fast mobile entry are the next layer and depend on that completed safe-delivery foundation.
3. Durable D1/R2 design and privacy-safe anonymous identity must precede server-authoritative results, challenges, referrals, analytics, daily play, couples and parties.
4. A server-authoritative attempt/result model must precede challenge creation; challenge creation must precede challenge landing, comparison and three-person nomination.
5. The regional token/render model should be centralised before durable Open Graph images and Story/Reel outputs to avoid implementing every format twice.
6. A share centre depends on canonical result/challenge URLs. Honest analytics semantics should be defined before instrumentation is enabled.
7. The privacy/storage control layer must ship no later than first-party analytics and before any advertising or sponsorship integration.
8. The versioned question engine and human cultural-review gate must precede random games, daily challenges and expanded banks.
9. Groom/Couples mode depends on challenges and comparison. Party mode depends on the data layer, server authority, rate limits and a reusable comparison/leaderboard model.
10. Commerce planning and migration may begin only after the free product data model is stable. Payment implementation remains blocked until the production quiz is off ChatGPT Sites.
11. Final preflight precedes controlled launch. Experiments and sponsored pilots follow stable analytics, privacy controls and sufficient data.

The prioritised delivery table and acceptance tests are in `docs/viral-growth-implementation-map.md`.
