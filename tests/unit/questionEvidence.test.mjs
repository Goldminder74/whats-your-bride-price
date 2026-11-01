import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  evidenceBundleHash, evidenceConceptKey, evidenceQuestionWording, validateEvidenceBundle,
  REVIEW_PASS_GATES, currentMachineEvidence, machineEvidenceCatalogContext,
} from "../../db/questionEvidence.ts";
import { validateQuestionContract } from "../../db/questionBankContracts.ts";
import { validatePublicSelectionRequest } from "../../db/questionSelectionService.ts";
import { toPublicSelectedQuestion } from "../../db/questionSelection.ts";

// Synthetic metadata exercises the validator only. It is never a research record,
// evidence of a real fact, database input or launch-pack candidate.
const now = Date.UTC(2026, 8, 13, 12);
const iso = new Date(now).toISOString();
const fact = { subject: "Synthetic Lake", predicate: "country", value: "Ghana" };
const corpusSha256 = "c".repeat(64);
const context = { now, corpusSha256, originalDraftReviews: new Map(), duplicateConceptKeys: new Set() };
function fixture() {
  const wording = evidenceQuestionWording(fact);
  const question = {
    stableId: "west_e_" + "a".repeat(24), version: 1, region: "west", countryScope: "Ghana",
    subregionScope: null, communityScope: null, category: "GEOGRAPHY", difficulty: "introductory",
    questionKind: "single", ...wording,
    answerOptions: [{ id: "o1", text: "Ghana" }, { id: "o2", text: "Senegal" }, { id: "o3", text: "Nigeria" }, { id: "o4", text: "Mali" }],
    acceptedAnswers: [["o1"]], sources: [{ title: "Synthetic contract source", organisationOrAuthor: "Synthetic test",
      urlOrReference: "https://example.org/test-only", publicationDate: null, accessDate: "2026-09-13",
      sourceType: "article", reviewStatus: "approved", relevantClaim: "Synthetic test only." }],
    reviewer: null, reviewDate: null, sensitivityNotes: null, language: "en", locale: "en-GB",
    lifecycleStatus: "draft", publishedAt: null, retiredAt: null, validFrom: null, validUntil: null,
    scoringWeight: 1, imageProvenance: [], audioProvenance: [],
  };
  const sources = ["one", "two"].map((id, i) => ({
    id, title: "Synthetic inspected record " + id, institution: "Synthetic institution " + id,
    url: "https://example.org/test-only/" + id, sourceClass: "official_geography", role: i ? "corroborating" : "primary",
    accessDate: "2026-09-13", locator: "Synthetic section 1", summary: "Synthetic test assertion only.",
    supports: ["claim", "answer", "explanation"], facts: [structuredClone(fact)],
    upstreamIdentity: "independent-synthetic-" + id, independenceFinding: "Synthetic independent dataset " + id,
    availability: "inspected_accessible",
  }));
  return {
    schemaVersion: "question-evidence-v1", method: "machine_evidence_v1", policyVersion: "low-objective-evidence-v1",
    candidateOrigin: { kind: "replacement", stableId: question.stableId, version: 1, sourceSha256: null }, question,
    fact: structuredClone(fact), sources,
    claimSourceMap: { claim: ["one", "two"], answer: ["one", "two"], explanation: ["one", "two"] },
    distractorAnalysis: question.answerOptions.slice(1).map(o => ({ optionId: o.id, excludedValue: o.text, incorrectBecause: "Synthetic context excludes " + o.text })),
    scopeAnalysis: { region: "west", country: "Ghana", finding: "Synthetic national scope." },
    duplicateAnalysis: { corpusSha256, conceptKey: evidenceConceptKey(fact), exactMatches: 0, nearMatches: 0, finding: "Synthetic corpus contains no matching test assertion." },
    riskScreening: { riskClass: "low_objective", specialistReviewRequired: false, prohibitedSubjects: [], finding: "Synthetic objective test." },
    reviewPasses: Object.entries(REVIEW_PASS_GATES).map(([kind, gates]) => ({ kind, gates: [...gates], decision: "pass", inspectedAt: iso, findings: ["Synthetic first finding", "Synthetic second finding"] })),
    verifiedAt: iso, recheckAt: new Date(now + 30 * 86_400_000).toISOString(), expiresAt: new Date(now + 180 * 86_400_000).toISOString(),
    evidenceBundleSha256: "0".repeat(64), publicationReadiness: "ready_under_low_risk_policy",
  };
}
async function signed(mutator = () => {}) { const value = fixture(); mutator(value); value.evidenceBundleSha256 = await evidenceBundleHash(value); return value; }
async function rejects(mutator, code) {
  const value = await signed(mutator);
  await assert.rejects(validateEvidenceBundle(value, context), code ? error => error.code === code : undefined);
}
test("complete synthetic metadata passes without changing the question or creating a reviewer", async () => {
  const value = await signed(), before = structuredClone(value);
  assert.equal(await validateEvidenceBundle(value, context), value);
  assert.deepEqual(value, before); assert.equal(value.question.reviewer, null); assert.equal(value.question.lifecycleStatus, "draft");
});
const failures = [
  ["fewer than two sources", b => b.sources.pop(), "two_sources_required"],
  ["no primary source", b => b.sources.forEach(s => s.role = "corroborating"), "primary_source_required"],
  ["duplicate upstream evidence", b => b.sources[1].upstreamIdentity = b.sources[0].upstreamIdentity, "independent_sources_required"],
  ["two pages from one institution", b => b.sources[1].institution = b.sources[0].institution, "independent_sources_required"],
  ["unsupported central claim", b => b.sources[1].facts = [], "unsupported_claim"],
  ["unsupported extra explanation", b => b.question.explanation += " It is the largest.", "unsupported_explanation"],
  ["missing explanation support", b => b.sources[0].supports = ["claim", "answer"], "claim_source_mapping_missing"],
  ["multiple accepted answers", b => b.question.acceptedAnswers = [["o1"], ["o2"]], "unique_answer_required"],
  ["missing distractor exclusion", b => b.distractorAnalysis[0].incorrectBecause = "", "distractor_not_excluded"],
  ["country in the wrong edition", b => { b.question.region = "north"; b.question.stableId = b.question.stableId.replace("west_", "north_"); b.candidateOrigin.stableId = b.question.stableId; b.scopeAnalysis.region = "north"; }, "regional_scope_invalid"],
  ["source supporting a second country", b => b.sources[1].facts.push({ ...fact, value: "Senegal" }), "source_conflict"],
  ["missing locator", b => b.sources[0].locator = "", "inspected_source_required"],
  ["prohibited source class", b => b.sources[0].sourceClass = "travel", "source_class_prohibited"],
  ["unavailable source", b => b.sources[0].availability = "unavailable", "inspected_source_required"],
  ["impossible source access date", b => b.sources[0].accessDate = "2026-02-30", "inspected_source_required"],
  ["unvalidated independence", b => b.sources[0].independenceFinding = "", "inspected_source_required"],
  ["uninspected review", b => b.reviewPasses[1].decision = "fail", "review_pass_failed"],
  ["missing independent pass", b => b.reviewPasses.pop(), "three_review_passes_required"],
  ["moving all gates into one pass", b => b.reviewPasses[1].gates = [], "mandatory_gate_missing"],
  ["exact duplicate", b => b.duplicateAnalysis.exactMatches = 1, "duplicate_question"],
  ["near duplicate", b => b.duplicateAnalysis.nearMatches = 1, "duplicate_question"],
  ["forged concept key", b => b.duplicateAnalysis.conceptKey = "unrelated", "duplicate_question"],
  ["specialist-review flag", b => b.riskScreening.specialistReviewRequired = true, "specialist_review_required"],
  ["invented human reviewer", b => b.question.reviewer = "Machine verifier", "machine_human_identity_forbidden"],
  ["publication in a verification bundle", b => { b.question.lifecycleStatus = "published"; b.question.publishedAt = "2026-09-13"; }],
  ["past recheck", b => b.recheckAt = iso, "evidence_expired"],
  ["recheck beyond 180 days", b => b.recheckAt = new Date(now + 181 * 86_400_000).toISOString(), "evidence_expired"],
];
for (const [name, mutation, code] of failures) test(name + " fails closed", () => rejects(mutation, code));
test("alternative country names cannot make a second option valid", () => rejects(b => {
  b.fact.value = "Côte d’Ivoire"; Object.assign(b.question, evidenceQuestionWording(b.fact));
  b.question.countryScope = b.scopeAnalysis.country = b.fact.value;
  b.question.answerOptions[0].text = b.fact.value; b.question.answerOptions[1].text = "Ivory Coast";
}, "ambiguous_option"));
for (const subject of ["bride-price", "marriage", "courtship", "sacred tradition", "religious ceremony", "ethnic identity", "Western Sahara", "Ceuta", "Melilla", "all communities", "proverb", "idiom", "cultural purity"]) {
  test(subject + " cannot qualify as low-objective evidence", () => rejects(b => {
    b.fact.subject = subject; Object.assign(b.question, evidenceQuestionWording(b.fact));
  }, "prohibited_subject"));
}
test("original specialist annotations cannot be washed into a separate verification", async () => {
  const value = await signed(b => b.candidateOrigin = { kind: "original_draft", stableId: b.question.stableId, version: 1, sourceSha256: "a".repeat(64) });
  const original = structuredClone(value.question);
  const reviews = new Map([[original.stableId + "@1", { sha256: "a".repeat(64), specialistReviewRequired: true, sensitivityNotes: null, communityScope: null, question: original }]]);
  await assert.rejects(validateEvidenceBundle(value, { ...context, originalDraftReviews: reviews }), e => e.code === "specialist_review_required");
  assert.deepEqual(original, value.question);
});
test("altering an otherwise eligible original is forbidden", async () => {
  const value = await signed(b => b.candidateOrigin = { kind: "original_draft", stableId: b.question.stableId, version: 1, sourceSha256: "a".repeat(64) });
  const original = structuredClone(value.question); original.difficulty = "intermediate";
  const reviews = new Map([[original.stableId + "@1", { sha256: "a".repeat(64), specialistReviewRequired: false, sensitivityNotes: null, communityScope: null, question: original }]]);
  await assert.rejects(validateEvidenceBundle(value, { ...context, originalDraftReviews: reviews }), e => e.code === "original_draft_modified");
});
const proof = {
  questionId: "internal", questionVersion: 1, questionContentSha256: "a".repeat(64), method: "machine_evidence_v1",
  status: "verified", riskClass: "low_objective", policyVersion: "low-objective-evidence-v1", evidenceBundleSha256: "b".repeat(64),
  sourceCount: 2, independentSourceCount: 2, primarySourceCount: 1, verifiedAt: now - 1000,
  recheckAt: now + 30 * 86_400_000, expiresAt: now + 180 * 86_400_000 - 1000, revokedAt: null, deletedAt: null,
};
const storedQuestion = { id: "internal", version: 1, contentHash: "a".repeat(64), reviewer: null, sensitivityNotes: null, communityScope: null };
test("stored authority binds exact version, hash, risk and immediate availability", () => {
  assert.equal(currentMachineEvidence(proof, storedQuestion, now), true);
  for (const change of [{ status: "revoked" }, { status: "expired" }, { status: "deleted" }, { recheckAt: now }, { expiresAt: now },
    { questionVersion: 2 }, { questionContentSha256: "c".repeat(64) }, { independentSourceCount: 1 }, { primarySourceCount: 0 },
    { evidenceBundleSha256: "B".repeat(64) }, { verifiedAt: 0 }, { sourceCount: 2.5 }, { riskClass: "sensitive" }, { deletedAt: now }]) {
    assert.equal(currentMachineEvidence({ ...proof, ...change }, storedQuestion, now), false, JSON.stringify(change));
  }
  assert.equal(currentMachineEvidence(proof, { ...storedQuestion, reviewer: "Machine" }, now), false);
  assert.equal(currentMachineEvidence(null, storedQuestion, now), false);
});
test("catalogue history is read-only semantics and a JSON object cannot manufacture trusted review basis", () => {
  const q = fixture().question; q.lifecycleStatus = "published"; q.publishedAt = "2026-09-13";
  assert.throws(() => validateQuestionContract(q), /cultural_review_required/);
  const trusted = machineEvidenceCatalogContext([{ stableId: q.stableId, version: 1, contentHash: "a".repeat(64), verification: { ...proof, status: "revoked" } }]);
  assert.equal(validateQuestionContract(q, { machineCatalogContext: trusted }).reviewer, null);
  assert.throws(() => validateQuestionContract(q, { machineCatalogContext: JSON.parse(JSON.stringify(trusted)) }), /cultural_review_required/);
  q.reviewer = "Synthetic independent human reviewer"; q.reviewDate = "2026-09-13";
  assert.equal(validateQuestionContract(q, { machineCatalogContext: trusted }).reviewer, q.reviewer);
  assert.equal(currentMachineEvidence({ ...proof, status: "revoked" }, storedQuestion, now), false);
});
test("public clients and query-shaped values cannot submit verification authority", () => {
  const request = { region: "west", anonymousSessionCredential: "a".repeat(32), idempotencyKey: "test_evidence_key_123" };
  assert.doesNotThrow(() => validatePublicSelectionRequest(request));
  for (const field of ["machineEvidence", "verification", "riskClass", "sources", "sourceCount", "published", "eligibility", "seed"]) {
    assert.throws(() => validatePublicSelectionRequest({ ...request, [field]: true }), /selection_request_field_not_allowed/);
  }
  assert.throws(() => validatePublicSelectionRequest(new URLSearchParams("machineEvidence=verified")));
});
test("canonical hashing survives object-key order and detects any content change", async () => {
  const b = await signed(); const reverse = Object.fromEntries(Object.entries(b).reverse());
  assert.equal(await evidenceBundleHash(reverse), b.evidenceBundleSha256); assert.match(b.evidenceBundleSha256, /^[a-f0-9]{64}$/);
  b.sources[0].summary += " changed";
  await assert.rejects(validateEvidenceBundle(b, context), e => e.code === "evidence_hash_invalid");
});
test("browser projection omits evidence, sources, answer keys and explanations", () => {
  const q = fixture().question;
  const publicQuestion = toPublicSelectedQuestion({ ...q, machineEvidence: { verification: proof, contentHash: "a".repeat(64) } }, ["o4", "o3", "o2", "o1"]);
  assert.deepEqual(Object.keys(publicQuestion).sort(), ["audioAssets", "imageAssets", "imageDescriptions", "kind", "options", "questionRef", "text", "version"]);
  const json = JSON.stringify(publicQuestion); for (const privateValue of ["machine_evidence_v1", "acceptedAnswers", "explanation", "example.org", "evidenceBundleSha256"]) assert.ok(!json.includes(privateValue));
});
test("the verification module has no database, hosted writer or public seed operation", async () => {
  const source = await readFile(new URL("../../db/questionEvidence.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.prepare\(|\.batch\(|fetch\(|INSERT INTO|UPDATE questions|seedStatements/);
});
