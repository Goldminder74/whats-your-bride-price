# Versioned question-bank engine

Fresh ordinary regional selection, its readiness threshold, persisted presentation order and game-mode boundaries are specified in [random-quick-play.md](./random-quick-play.md). Draft research packs remain outside every playable selection.

## Spoiler-proof image answers

Image-identification questions use one central presentation contract. Public options expose only stable option IDs, neutral markers (`A`, `B`, `C`, `D`), opaque reviewed asset references and objective accessibility descriptions. The browser catalogue also removes image labels, correct-answer indexes and pre-reveal explanations. A same-origin, POST-only route checks a submitted opaque option ID against the canonical server catalogue and returns the judgement and explanation after submission. Canonical option wording, accepted-answer sets and explanations remain authority data and are not part of the pre-submission public question projection. Text-answer questions keep their original visible wording and scoring behaviour.

The ten published legacy image questions use reviewed descriptions keyed by their immutable question IDs and existing numeric asset paths. A future image question must provide one `accessibilityDescription` per option in `imageProvenance`; missing, mismatched, answer-bearing or label-bearing media metadata fails closed. The browser renderer uses the same presentation contract for visible markers, non-empty image alternatives, keyboard-operable controls and meaningful accessible names. Recovery stores only option IDs and rechecks recovered image selections through the server authority; it never stores or derives canonical image labels. No schema migration is required because media provenance is already stored as versioned JSON.

## Scope and transition

The engine introduces a validated, versioned catalogue and server-side selection policy without adding cultural questions. The verified pre-engine catalogue remains the only current content: five editions, twelve questions per edition and sixty questions in total. `app/gameData.ts` remains the canonical byte-for-byte source for that transitional catalogue. `buildLegacyQuestionBankDocument()` maps those records into `question-bank-v1` without changing wording, options, accepted answers, explanations, regional assignment, image offsets or the one-point scoring weight.

The transitional questions are classified as introductory because the earlier data did not store difficulty. This is an explicit compatibility classification; it does not claim a balanced difficulty mix. The selector balances the catalogue it actually has and fails with `insufficient_published_bank` when fewer than the requested twelve valid questions exist. It never fills a gap with a draft or retired record.

The engine accepts any number of validated versions and supports at least fifty approved questions in each of the five edition pools. Adding that researched content is outside Prompt 20. Prompt 21 may add questions only after source research and human cultural review; passing the software tests is not publication approval.

## Contract and lifecycle

`question-bank-v1` requires a stable regional ID, positive version, region and optional country/subregion/community scope, controlled category and difficulty, question kind and text, unique option IDs and text, one or more exact accepted-answer sets, explanation, sources, reviewer metadata, sensitivity notes, language and locale, lifecycle dates, a positive scoring weight, and complete image/audio provenance when media is used.

The lifecycle is:

1. `draft`: editable working content; never selected.
2. `review`: awaiting source and cultural review; never selected.
3. `approved`: reviewed but not released; never selected.
4. `published`: selectable only inside its validity window.
5. `retired`: retained for historical attempts and excluded from new games.

Publication requires a publication date, at least one approved reliable source, and a recorded reviewer and review date. Retirement requires a retirement date. Published or previously used question material is immutable; corrections create the next version. Lifecycle state may move to retirement without deleting the old version.

## Sources and cultural review

Every imported question needs at least one approved HTTPS, DOI or ISBN reference with a title, organisation or author, source type, access date and the claim it supports. Approved, published and retired content also needs a named review record and review date. Entries with sensitivity notes cannot proceed without that review. Unapproved remote media is rejected. Local media also needs creator, source, licence and review date provenance.

The existing sixty questions retain their pre-engine verified catalogue status and the four collection-level references already shown in the product. New Prompt 21 content must replace collection-level coverage with question-specific evidence wherever practical and must not be marked published by an import.

## Selection and attempt authority

Normal games request twelve questions. The server loads only active-edition rows that are published, source-approved, already released, not retired, and inside `valid_from`/`valid_until`. When more than one currently published version shares a stable ID, the highest valid version is the candidate. Selection greedily spreads categories and controlled difficulty values, uses a cryptographically random 256-bit seed, prevents duplicate stable IDs, and favours versions absent from the most recent valid functional attempt history.

The raw seed never leaves server memory. Attempts store its SHA-256 reference, `balanced-v1`, the scoring version and the exact stable-ID/version list. An authorised challenge or comparison may provide a sealed server-side seed and an exact compatible version list to reproduce a selection. Browser requests have a fixed three-field contract and cannot set count, difficulty, accepted answers or seed.

Challenge acceptance copies the inviter attempt's question-set version, exact question versions, selection-policy version and seed reference. Completion resolves the exact recorded versions even if a question is later retired, so retirement affects new games without rewriting history. Compatibility still requires matching edition, question count, scoring version, question-set version, scoring-weight policy and difficulty policy.

Public selection responses contain only stable question references, versions, kind, text, options and approved local media references. They omit accepted answers, explanations before answer evaluation, raw seeds, seed references, database IDs, hashes, reviewer data and source-review internals.

## Owner CSV and JSON workflow

`GET /owner/questions?format=json` exports `question-bank-v1`; `format=csv` exports the same fields with nested data represented as JSON cells. `POST /owner/questions` accepts either `application/json` or `text/csv` and returns a validation and change preview. The POST route performs no writes: proposed `published` and `retired` records are reported as publication or retirement preparation only.

The JSON object must contain exactly `schemaVersion` and `questions`; each question and nested record also rejects unexpected fields. CSV columns and order are fixed. Imports are capped at 1 MiB and 1,000 rows. Validation rejects malformed files, formula-leading CSV cells, unknown controls, bad versions or dates, duplicate options or accepted-answer sets, missing sources, missing cultural review, unapproved remote assets and changed content for a published stable-ID/version pair. It reports exact and token-near duplicates before any later controlled write workflow.

CSV export quotes RFC-style special characters and prefixes formula-leading values with an apostrophe. Exports contain catalogue records only. They do not query or expose users, attempts, analytics, credentials, tokens, runtime secrets or internal content hashes.

Both methods require HTTPS (or loopback in local tests), same-origin Fetch Metadata, the existing trusted Sites identity, and the server-only owner subject allowlist. Authentication and allowlist checks run before the D1 runtime loader. Missing authorization returns a neutral unavailable response.

## Schema change and activation gate

`drizzle/0007_ancient_yellow_claw.sql` is the sole Prompt 20 migration. It adds accepted-answer alternatives, language, reviewer, validity and media-provenance columns to `questions`; policy and seed-reference columns to `quiz_attempts`; a selection index; and immutability/seed-shape triggers. It contains no question catalogue or seed data. Migrations `0000` through `0006` remain unchanged.

Migration 0007 is local source only. It must not be applied to staging or production without a later, target-specific approval and migration-state check. The feature repository keeps D1 and R2 unbound, so the public selection and owner workflow fail closed when storage is absent. Prompt 21 remains blocked until its researched question records, reliable sources and human cultural reviews are approved.

## West Africa Prompt 21 research pack

The West Africa research run adds draft candidates under `data/question-bank/west-africa/`. The validated JSON file is import-ready, while the cultural-review CSV deliberately leaves the human decision, reviewer, review date and reviewer-notes fields empty. The source register records the authoritative URL, access date and supported claim for every source. Coverage, under-representation, duplicate analysis and cultural-review issues are separate review artifacts.

Every candidate remains `draft`, has no publication or validity date and is excluded from public selection. A source record marked `approved` means only that it passed the research-source gate. It does not mean the question has cultural approval. Entries involving initiation, sacred or religious practice, enslavement, ritualized joking, gendered descriptions, weddings, proverbs or language usage carry a specialist-review flag. No candidate may progress until an appropriate human reviewer records a decision.

## East Africa Prompt 21 research pack

The East Africa research run adds a separate draft pack under `data/question-bank/east-africa/`. Its validated JSON, cultural-review CSV, source register, issue log, coverage, under-representation and duplicate-analysis files use the same review-only workflow as the West Africa pack. Duplicate analysis includes the original sixty questions and every West Africa draft.

The pack preserves specific country and community scope for each record and does not treat East Africa as culturally uniform. Sacred, initiatory, healing, religious, customary-law, oral-history, colonial, language and wedding material is queued for specialist review. Automated source and schema checks do not constitute cultural approval, and every record remains excluded from public selection until a later authorized human-review and publication workflow.

## North Africa Prompt 21 research pack

The North Africa research run adds a separate draft pack under `data/question-bank/north-africa/`. Its validated JSON, cultural-review CSV, source register, issue log, coverage, under-representation and duplicate-analysis files follow the same review-only workflow. Duplicate analysis includes the original sixty questions and every West and East Africa draft.

The application scope is the Maghreb, Nile and Sahara, but each record keeps a precise country and community scope. The pack documents Mauritania as a cross-edition classification question because it is already represented in the West Africa pack. It leaves Western Sahara, Ceuta and Melilla unassigned pending explicit editorial policy, locally led sourcing and specialist review. This treatment does not imply a position on sovereignty or borders.

Living practices, sacred and therapeutic material, oral traditions, gendered roles, colonial and enslavement history, environmental knowledge, ancient political and funerary interpretation, and identity terminology remain in the specialist-review queue. No proverb candidate was added without adequate attribution, contextual translation and fluent community review. Automated validation remains research triage rather than cultural approval, and all records stay `draft` and excluded from public selection.

## Central Africa Prompt 21 research pack

The Central Africa run adds a separate draft pack under `data/question-bank/central-africa/`. Its validated JSON, cultural-review CSV, source register, issue log, coverage, under-representation and duplicate-analysis files follow the same review-only workflow. Duplicate analysis includes the original sixty questions and every West, East and North Africa draft.

The application edition spans rainforest, river, island, savanna and Saharan settings. Country and community fields keep those contexts separate. Angola, Cameroon and Chad are included under the established product scope while their Southern African, West African and Sahelian connections remain explicit. Burundi and Rwanda stay in the East Africa pack to avoid duplication. Cross-border records name every relevant country.

Every record remains `draft` and carries a specialist-review flag. Sacred or restricted practices, Indigenous knowledge and rights, protected-area narratives, colonial history, marriage and gender, oral history, archaeology and living foodways require appropriate human reviewers. Equatorial Guinea remains intentionally under-represented because current high-authority public evidence is limited, and its UNESCO Tentative List is described only as a preliminary nomination step. No greeting or proverb was added without adequate language, register, attribution and community-review evidence.

## Southern Africa Prompt 21 research pack

The Southern Africa run adds a separate draft pack under `data/question-bank/southern-africa/`. Its validated JSON, cultural-review CSV, source register, issue log, coverage, under-representation and duplicate-analysis files follow the same review-only workflow. Duplicate analysis includes the original sixty questions and every West, East, North and Central Africa draft.

The pack follows the established Southern edition scope: Botswana, Eswatini, Lesotho, Namibia, South Africa, Zambia and Zimbabwe. Cross-border records name each country. Angola remains in the Central pack, while Malawi, Mozambique and Madagascar remain in the East pack. Zambia and Zimbabwe candidates use concepts distinct from their East Africa coverage, and the overlap report records those editorial decisions.

All records remain `draft` and carry specialist-review flags. Click consonants and diacritics are preserved in ǂKhomani, ǀŌb, ǂÂns, ǁKhasigu, Nama≠Nāb and |haru om, subject to review by speakers and knowledge holders. Living sacred practice, Indigenous knowledge and rights, apartheid and political violence, archaeology, protected landscapes, gendered roles and tentative-list status require specialist review. Greetings and proverbs remain under-represented because the run did not find adequate attribution, register and translation evidence for responsible draft inclusion.
