# Machine evidence policy — disabled, unpublished preparation

Method `machine_evidence_v1` is **machine evidence verified**, never human, community, specialist or cultural approval. Original research drafts, triage annotations and specialist flags are immutable inputs. Publication and import are separate deliberate operations; this work performs neither.

## Schema audit and minimal design

The existing question table has no evidence method, policy, bundle hash, source independence, expiry or revocation record. The application contract requires a reviewer for the existing publication route. One additive `question_evidence_verifications` table in migration 0011 is required. No existing table is rebuilt, and migrations 0000–0010 are unchanged.

The new table binds a random internal identifier to the exact existing question ID/version and content hash. It records the controlled method/risk/status, policy version, bundle hash, distinct source and primary-source counts, verification/recheck/expiry and revocation/deletion timestamps. A partial unique index prevents two verified records for the same question/policy. Checks and triggers reject invalid relationships, mutable evidence authority and a machine record attached to a human reviewer or a question carrying sensitivity/community review requirements.

The existing database CHECK requires `source_review_status='approved'` for any published row. That field continues to represent source administration; it must not be rendered as human cultural approval. Machine qualification instead requires the separate valid evidence record and a null human reviewer. The original human publication validator remains the default. A trusted server evidence context may validate machine publication without inventing a reviewer. Draft publication-ready projections do not satisfy public lifecycle eligibility.

Public selection remains central: published lifecycle and valid dates, plus either the established human route (including the unchanged canonical sixty), or a valid machine evidence record. A missing, expired, revoked or deleted machine record cannot fall back to a null-reviewer human route. Existing attempt snapshots and fixed challenge/daily order are not rewritten. The thirty-question random threshold and twelve-unique-question selection remain unchanged.

## Evidence requirements

Each question needs two independently authored authoritative records, at least one primary/official source, accessible canonical HTTPS pages or DOI resolution, exact locators and access dates. Separate publishers alone are insufficient: copied text, shared upstream evidence and mirrors count only once. Search snippets, AI summaries, Wikipedia, travel/commercial/blog/social pages and another quiz are not evidence.

Verification records exact structured claim assertions extracted from inspected source bodies, concise paraphrases, claim-to-source mapping, answer and distractor analyses, scope and concept checks. Sources must agree directly about the tested fact; merely mentioning its subject is insufficient. Unsupported explanations, alternative valid answers, conflicting evidence or missing locators fail closed. Canonical JSON hashing excludes only the self-referential bundle hash.

Three separately recorded passes are mandatory: entailment; adversarial ambiguity; cultural/regional risk. Any material disagreement fails. No model confidence number substitutes for these gates. Evidence is rechecked within 180 days, with explicit policy expiry; expiry or revocation prevents new selection immediately.

## Risk and quality

Only stable low-objective geography, official heritage location/names, documented objects/materials, institutional historical dates, instruments/scripts and explicitly bounded preparation facts qualify. No marriage/bride-price, courtship, gender expectations, sacred/restricted obligations, ethnic or universal living-community claims, proverbs/idioms/translations, etiquette, disputed identity/history/territory, superiority/worth, demeaning distractors or unresolved specialist concern qualifies. Western Sahara, Ceuta and Melilla are excluded from automatic territorial assignment. Time-sensitive facts require validity/recheck handling.

Questions use neutral UK English, four plausible distinct options, one supported answer, one point and respectful bounded explanations. Text-only replacements are preferred. IDs are opaque and evidence/answer keys are server/offline only. Exact/near duplicates and repeated concepts are checked against the canonical sixty, all 352 drafts and all replacements. Regional coverage shortfalls are reported rather than weakening the policy.

No client, public endpoint, query, browser storage or review fixture can write verification authority. No new endpoint or activation control is introduced. Random Quick Play, Cowries, commerce, analytics, daily challenges, streaks and owner dashboard remain disabled. Hosted storage, Stripe, staging and production are untouched.
