# Product safeguard and inclusive-copy audit

Audit date: 22 August 2026

Branch reviewed: `feature/viral-build-sprint`
Approved baseline: `ebd6127a460582923a78a135d3c105d1167b8b11`

## Permanent safeguard

The canonical sentence is:

> A playful culture score, never a measure of human worth.

It is defined once in `app/productSafeguards.ts` and reused in application copy. The implementation places it:

- in the immediate generic-entry decision area, before the five region actions;
- on direct regional entry, trusted challenge entry and invalid-challenge fallback;
- in both the compact fast-start avatar flow and the original setup flow, before any private-photo action;
- beside start or continue actions through visible text and `aria-describedby` relationships;
- during the score-reveal ceremony, including the reduced-motion presentation;
- inside every result-card tier because the same unconditional result-card element renders tiers 0 through 3;
- inside the All-Africa completion overlay;
- in generated 1080 by 1350 portrait downloads and file-share images, within the inner safe frame;
- in native result share, nomination and WhatsApp nomination text;
- in page, Open Graph and Twitter text metadata; and
- prominently in the About panel.

Recovery does not create a different entry or result component. A recovered setup receives the same start-area safeguard, a recovered quiz retains the scoring-information control, and a recovered result receives the same unconditional result-card safeguard.

## Routes and compositions reviewed

The repository has one public route, `/`, with query-driven states rather than separate result URLs.

| Route or composition | Review result |
| --- | --- |
| `/` original home entry with feature off | Exact safeguard is next to and associated with Start the challenge |
| `/` fast generic entry | Exact safeguard precedes all five region choices and describes each choice |
| `/?edition=<region>` direct entry | Original setup and fast compact setup both place the safeguard before photo use and associate it with the primary action |
| `/?nominated=1&edition=<region>` nomination entry | Uses the same safe direct-entry component; no identity claim is made |
| Authorised trusted-challenge fixture | Exact safeguard precedes and describes Accept the challenge |
| Invalid or hostile challenge fallback | Untrusted names and scores are discarded; the generic-entry safeguard remains before choices |
| Recovered compact setup or quiz | Continue receives the compact safeguard; Question 1 and resumed questions expose How scoring works |
| Quiz answer and culture-drop states | No valuation or relationship judgement; educational explanations are unchanged |
| Score-reveal ceremony | Exact safeguard remains present independently of sound, motion and tier |
| Result tiers 0, 1, 2 and 3 | One unconditional safeguard renders inside the regional result card for all tiers |
| Perfect, low and recovered result | Same result component and exact safeguard; lower copy encourages learning without shame |
| All-Africa completion overlay | Knowledge mastery is celebrated and the exact safeguard remains visible |
| Canvas portrait download and file share | Exact sentence is drawn at baseline 1240 within the 1080 by 1350 inner frame |
| Native result share | Concise culture-score language plus exact safeguard and nomination URL |
| Native nomination and WhatsApp nomination | Culture-score challenge language plus exact safeguard; no success claim before a platform completes sharing |
| Static Open Graph and Twitter image | `public/og-v2.png` reviewed; text metadata is safe, but the static pixels do not contain the safeguard |
| About panel | Purpose, seven scoring principles, photo privacy, cultural review/reporting and audience position added |

## How scoring works

The About panel and the in-quiz `How scoring works` disclosure state that:

1. the quiz tests knowledge of selected African histories, languages, foodways, proverbs and cultural traditions;
2. the score and ceremonial result are fictional, playful and for entertainment and learning;
3. the result is not a valuation of a person;
4. it does not assess suitability for marriage or relationships;
5. short questions simplify diverse subjects and are not universal rules;
6. questions and explanations are based on the reviewed sources linked in About; and
7. culture-game scores may be compared and shared without demeaning lower-scoring players.

No score calculation, answer key, tier threshold, question, answer, explanation or cultural wording in `app/gameData.ts` changed. The source file remains byte-for-byte identical to the approved baseline, with SHA-256 `3ce3474de2e6b072bf4e893fc2760c8b9ba996a889697ec5ac15f631cc05c74d`.

## Copy changes

Clear, non-interpretive corrections made in this prompt:

| Surface | Previous risk | Revised framing |
| --- | --- | --- |
| Home headline | Claimed a higher score produces a higher bride price | A higher knowledge score produces a brighter culture score |
| Home introduction | Claimed a player deserved a high bride price and a groom must pay | Offers a culture score, regional portrait and shareable facts |
| About heading | Asked players to prove high human value | Asks players to prove culture knowledge |
| Tier 1 result | Described knowledge as bride-price energy | Describes culture-score energy |
| Tier 3 result | Raised a bride price and required a financially prepared groom | Celebrates regional mastery and a fictional scorecard |
| Tier gifts | Labelled point rewards as literal bride prices and included a groom budget joke | Labels them ceremonial cowrie scores and knowledge celebrations |
| All-Africa overlay | Declared the player’s bride price legendary | Declares the knowledge journey legendary |
| Result kicker | Called the output an official bride-price certificate | Calls it a playful cultural knowledge scorecard |
| Share and nomination copy | Shared an unqualified score comparison | Calls it a culture score and includes the permanent safeguard |

Lower tiers still invite learning and replay without shame. Higher tiers celebrate demonstrated quiz knowledge without claiming greater beauty, identity, marriageability, relationship suitability, dignity, status or monetary value.

## Retained phrases and approved exceptions

The following uses remain because they are central to the product concept and are now framed by the safeguard:

- `What’s Your Bride Price?` remains the established game and brand title in the wordmark, metadata, invitation copy and exported portrait.
- `Bride Price Royalty` remains the clearly fictional top-tier game name.
- Download filenames retain `bride-price` so existing user expectations and automation remain stable.
- `My Bride Price culture-game result` remains the native-share title and explicitly labels the output as a culture-game result.

These contexts are enumerated with a reason in `tests/copy-safety-audit.mjs`. A new occurrence of “bride price” fails the unit audit unless it receives narrow, reviewed allowlist treatment. Complete high-risk phrases such as “prove your high value”, “higher your bride price”, financial-preparedness claims, marriage shaming, appearance-based score claims, false identity verification and false share-success claims are prohibited by phrase-based rules.

## Privacy, cultural review and audience copy

The About panel and both avatar/setup compositions now distinguish the original photo from the sanitised in-memory copy. They state that photo choice is optional, processing occurs on-device, the original is never uploaded, source metadata is not copied into the re-encoded JPEG, removal clears the in-memory copy, and photo choice does not affect scoring. The fast entry also states that anonymous play needs no account and that limited, non-authoritative recovery expires after 24 hours without names or photos. The result explains that a private photo can enter only a portrait the player deliberately downloads or hands to the operating-system share sheet; public links and previews use approved avatar and regional artwork.

The About panel records that D1, R2 and public deletion controls are inactive. `Clear local quiz data` removes recovery, regional mastery scores and the current tab's anonymous functional session. This is operational privacy copy, not a claim that a live durable deletion endpoint exists.

It also explains that a short quiz necessarily simplifies diverse subjects, points to reviewed sources, and directs users to report cultural inaccuracies or insensitive wording through the Classes for Culture contact channel. No public reporting address or dedicated reporting form exists in this repository, so the contact wording is intentionally provider-neutral until the owner approves a specific destination.

The intended audience statement says the experience is designed for adults and people who meet the applicable age of digital consent, is not directed to children under 13, and does not collect age or request proof of age. This is product guidance, not an age-verification claim.

## Social-preview limitation and Prompt 14 handoff

The application currently references a single static `public/og-v2.png` for Open Graph and Twitter previews. It has no per-player or per-score server-rendered preview image, and a static image cannot reliably represent every entry, result tier or region. This prompt therefore updates the social-preview text metadata with the exact safeguard but does not redraw the approved static artwork.

`RESULT_MEDIA_SAFEGUARD` in `app/productSafeguards.ts` provides a shared sentence and safe-area contract already used by the canvas portrait renderer. Prompt 14 should use the same interface when dynamic, regional social-preview rendering is approved. Until then, do not claim that the safeguard is visibly embedded in the static Open Graph image.

## Automated coverage

- `tests/unit/productSafeguards.test.mjs` checks the exact canonical sentence, entry/action associations, every tier’s safe copy, the seven scoring principles, media safe-area coordinates and the unchanged `gameData.ts` digest.
- `tests/copy-safety-audit.mjs` provides the maintainable phrase-based audit and narrow reviewed allowlist.
- `tests/rendered-html.test.mjs` checks the production-rendered safeguard and updated inclusive copy.
- End-to-end tests verify generic, direct, trusted, invalid, avatar/photo, quiz-scoring, reveal, result, download, share, nomination, WhatsApp and About surfaces.

## Owner-review items

The following judgement calls should receive product-owner approval before production deployment:

1. retaining the product title `What’s Your Bride Price?`;
2. retaining the fictional `Bride Price Royalty` tier;
3. using “aunties” and “family council” as playful result language across a pan-African audience;
4. using “ceremonial cowrie score” across all five regional editions rather than region-specific fictional tokens;
5. the final destination and wording for reporting cultural inaccuracies; and
6. the audience and digital-consent wording for the jurisdictions in which the product will launch.

## Residual risks

- The static Open Graph image retains the unqualified product title and lacks the exact safeguard in its pixels. Prompt 14 must resolve this without claiming dynamic result previews already exist.
- The repository has no dedicated public cultural-inaccuracy reporting URL or address.
- “Aunties”, “family council”, “royalty” and a universal cowrie motif are playful generalisations that need owner and cultural-review approval across all five editions.
- The title and top-tier name remain intentionally provocative. Their framing depends on the safeguard staying present and readable.
- Browser and platform share sheets control the final crop and text truncation. The app supplies safe text, but deployment-stage real-device checks remain necessary.
- The adult-audience statement is informational and is not age assurance; jurisdiction-specific legal review remains outside this task.
- Browser image decoders and JPEG encoders vary across devices. The privacy claim is limited to application behaviour and tested metadata exclusion; it does not make a legal guarantee about operating-system or hosting-provider logs.

No deployment, publication, DNS change, production-data change or production-access change is part of this audit.
