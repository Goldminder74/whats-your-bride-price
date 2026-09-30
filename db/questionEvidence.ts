import type { RegionKey } from "../app/publicGameData.ts";
import { validateQuestionContract, type QuestionBankQuestion, type QuestionOption } from "./questionBankContracts.ts";

export const MACHINE_EVIDENCE_METHOD = "machine_evidence_v1" as const;
export const MACHINE_EVIDENCE_POLICY = "low-objective-evidence-v1" as const;
export const MACHINE_EVIDENCE_POLICY_EXPIRES_AT = Date.UTC(2027, 8, 13);
export const MAX_EVIDENCE_RECHECK_MS = 180 * 86_400_000;
export const AUTHORITATIVE_SOURCE_CLASSES = Object.freeze([
  "unesco", "national_museum", "government_heritage", "university", "peer_reviewed",
  "museum_collection", "official_geography", "language_institute",
] as const);
export const EVIDENCE_GATES = Object.freeze([
  "claim", "answer", "unique_answer", "distractors", "aliases", "assumptions", "scope",
  "explanation", "standalone", "no_universality", "freshness", "no_conflict", "independence",
  "low_risk", "no_spoilers", "no_duplicates", "concept_diversity", "respectful_uk_english",
] as const);
export const REVIEW_PASS_GATES = Object.freeze({
  entailment: ["claim", "answer", "explanation", "freshness", "no_conflict", "independence"],
  adversarial_ambiguity: ["unique_answer", "distractors", "aliases", "assumptions", "standalone", "no_spoilers", "no_duplicates", "concept_diversity"],
  cultural_regional_risk: ["scope", "no_universality", "low_risk", "respectful_uk_english"],
} as const);

export type EvidenceFact = Readonly<{
  subject: string;
  predicate: "country" | "island" | "material" | "river" | "ocean" | "landform";
  value: string;
}>;
export type EvidenceSource = Readonly<{
  id: string; title: string; institution: string; url: string;
  sourceClass: (typeof AUTHORITATIVE_SOURCE_CLASSES)[number]; role: "primary" | "corroborating";
  accessDate: string; locator: string; summary: string; supports: readonly ("claim" | "answer" | "explanation")[];
  facts: readonly EvidenceFact[]; upstreamIdentity: string; independenceFinding: string;
  availability: "inspected_accessible";
}>;
export type EvidenceReviewPass = Readonly<{
  kind: "entailment" | "adversarial_ambiguity" | "cultural_regional_risk";
  decision: "pass" | "fail"; inspectedAt: string; findings: readonly string[];
  gates: readonly (typeof EVIDENCE_GATES)[number][];
}>;
export type EvidenceBundle = Readonly<{
  schemaVersion: "question-evidence-v1";
  method: typeof MACHINE_EVIDENCE_METHOD;
  policyVersion: typeof MACHINE_EVIDENCE_POLICY;
  candidateOrigin: Readonly<{ kind: "replacement" | "original_draft"; stableId: string; version: number; sourceSha256: string | null }>;
  question: QuestionBankQuestion;
  fact: EvidenceFact;
  sources: readonly EvidenceSource[];
  claimSourceMap: Readonly<{ claim: readonly string[]; answer: readonly string[]; explanation: readonly string[] }>;
  distractorAnalysis: readonly Readonly<{ optionId: string; incorrectBecause: string; excludedValue: string }>[];
  scopeAnalysis: Readonly<{ region: RegionKey; country: string; finding: string }>;
  duplicateAnalysis: Readonly<{ corpusSha256: string; conceptKey: string; exactMatches: number; nearMatches: number; finding: string }>;
  riskScreening: Readonly<{ riskClass: "low_objective"; specialistReviewRequired: false; prohibitedSubjects: readonly string[]; finding: string }>;
  reviewPasses: readonly EvidenceReviewPass[];
  verifiedAt: string; recheckAt: string; expiresAt: string;
  evidenceBundleSha256: string;
  publicationReadiness: "ready_under_low_risk_policy";
}>;

export class QuestionEvidenceError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "QuestionEvidenceError"; this.code = code; }
}
function reject(code: string): never { throw new QuestionEvidenceError(code); }
const HASH = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPAQUE_ID = /^(west|east|north|central|south)_e_[0-9a-f]{24}$/;
const PROHIBITED = /\b(?:bride[ -]?price|marriage|courtship|gender|sacred|restricted|initiati\w*|religio\w*|ceremon\w*|ethnic|proverb|idiom|etiquette|purity|superior|inferior|authentic|western sahara|ceuta|melilla)\b|\b(?:all|every)\s+(?:people|families|communities|residents|women|men)\b/i;

/** Canonical JSON excludes only the self-referential bundle digest. No source ordering is discarded. */
export function canonicalEvidenceJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalEvidenceJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalEvidenceJson(object[key])}`).join(",")}}`;
  }
  return reject("non_canonical_evidence");
}
export async function evidenceBundleHash(bundle: EvidenceBundle): Promise<string> {
  const { evidenceBundleSha256: omitted, ...content } = bundle;
  void omitted;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalEvidenceJson(content)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalized(value: string): string { return value.normalize("NFKC").trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " "); }
const EDITION_COUNTRIES: Readonly<Record<RegionKey, readonly string[]>> = Object.freeze({
  west: ["Benin", "Burkina Faso", "Cabo Verde", "Côte d’Ivoire", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Liberia", "Mali", "Mauritania", "Niger", "Nigeria", "Senegal", "Sierra Leone", "Togo"],
  east: ["Burundi", "Comoros", "Djibouti", "Eritrea", "Ethiopia", "Kenya", "Madagascar", "Malawi", "Mauritius", "Rwanda", "Seychelles", "Somalia", "South Sudan", "Tanzania", "Uganda"],
  north: ["Algeria", "Egypt", "Libya", "Morocco", "Sudan", "Tunisia"],
  central: ["Angola", "Cameroon", "Central African Republic", "Chad", "Democratic Republic of the Congo", "Equatorial Guinea", "Gabon", "Republic of the Congo", "São Tomé and Príncipe"],
  south: ["Botswana", "Eswatini", "Lesotho", "Malawi", "Mozambique", "Namibia", "South Africa", "Zambia", "Zimbabwe"],
});
function placeName(value: string): string {
  const simple = normalized(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const aliases: Readonly<Record<string, string>> = {
    ivorycoast: "cotedivoire", capeverde: "caboverde", thegambia: "gambia", unitedrepublicoftanzania: "tanzania",
    drc: "democraticrepublicofthecongo", drcongo: "democraticrepublicofthecongo", congokinshasa: "democraticrepublicofthecongo", zaire: "democraticrepublicofthecongo",
    congobrazzaville: "republicofthecongo", swaziland: "eswatini",
  };
  return aliases[simple] || simple;
}
export function evidenceConceptKey(fact: EvidenceFact): string {
  return `${normalized(fact.subject)}:${fact.predicate}`;
}
function factEqual(left: EvidenceFact, right: EvidenceFact): boolean {
  return normalized(left.subject) === normalized(right.subject) && left.predicate === right.predicate
    && (left.predicate === "country" ? placeName(left.value) === placeName(right.value) : normalized(left.value) === normalized(right.value));
}
export function evidenceQuestionWording(fact: EvidenceFact): Readonly<{ questionText: string; explanation: string }> {
  const templates = {
    country: `In which country is ${fact.subject} located?`,
    island: `On which island is ${fact.subject} located?`,
    material: `Which material is used for ${fact.subject}?`,
    river: `On which river is ${fact.subject} located?`,
    ocean: `In which ocean is ${fact.subject} located?`,
    landform: `What type of landform is ${fact.subject}?`,
  };
  const explanations = {
    country: `${fact.subject} is located in ${fact.value}.`,
    island: `${fact.subject} is located on ${fact.value}.`,
    material: `${fact.subject} is made using ${fact.value}.`,
    river: `${fact.subject} is located on the ${fact.value}.`,
    ocean: `${fact.subject} is located in the ${fact.value}.`,
    landform: `${fact.subject} is a ${fact.value}.`,
  };
  return Object.freeze({ questionText: templates[fact.predicate], explanation: explanations[fact.predicate] });
}
function answerOption(options: readonly QuestionOption[], id: string): QuestionOption {
  return options.find((option) => option.id === id) || reject("answer_reference_missing");
}

/** Offline/server-only validation. This function performs no import, publication or database write. */
export async function validateEvidenceBundle(bundle: EvidenceBundle, context: Readonly<{
  now: number;
  originalDraftReviews: ReadonlyMap<string, Readonly<{ sha256: string; specialistReviewRequired: boolean; sensitivityNotes: string | null; communityScope: string | null; question: QuestionBankQuestion }>>;
  corpusSha256: string;
  duplicateConceptKeys: ReadonlySet<string>;
}>): Promise<EvidenceBundle> {
  if (bundle.schemaVersion !== "question-evidence-v1" || bundle.method !== MACHINE_EVIDENCE_METHOD || bundle.policyVersion !== MACHINE_EVIDENCE_POLICY) reject("evidence_policy_invalid");
  if (context.now >= MACHINE_EVIDENCE_POLICY_EXPIRES_AT) reject("evidence_policy_expired");
  const question = bundle.question;
  validateQuestionContract(question);
  if (!["country", "island", "material", "river", "ocean", "landform"].includes(bundle.fact.predicate)
    || typeof bundle.fact.subject !== "string" || !bundle.fact.subject.trim() || typeof bundle.fact.value !== "string" || !bundle.fact.value.trim()) reject("unsupported_claim");
  if (question.reviewer !== null || question.reviewDate !== null) reject("machine_human_identity_forbidden");
  if (question.lifecycleStatus !== "draft" || question.publishedAt !== null || question.retiredAt !== null) reject("automatic_publication_forbidden");
  if (question.questionKind !== "single" || question.imageProvenance.length || question.audioProvenance.length || question.scoringWeight !== 1) reject("evidence_text_only_required");
  if (question.communityScope !== null || question.sensitivityNotes !== null || bundle.riskScreening.specialistReviewRequired !== false) reject("specialist_review_required");
  if (bundle.candidateOrigin.kind === "original_draft") {
    const original = context.originalDraftReviews.get(`${bundle.candidateOrigin.stableId}@${bundle.candidateOrigin.version}`);
    if (!original || original.sha256 !== bundle.candidateOrigin.sourceSha256) reject("original_provenance_invalid");
    if (original.specialistReviewRequired || original.sensitivityNotes || original.communityScope) reject("specialist_review_required");
    if (question.stableId !== bundle.candidateOrigin.stableId || question.version !== bundle.candidateOrigin.version) reject("original_version_mismatch");
    if (canonicalEvidenceJson(question) !== canonicalEvidenceJson(original.question)) reject("original_draft_modified");
  } else if (bundle.candidateOrigin.kind !== "replacement" || !OPAQUE_ID.test(question.stableId)
    || bundle.candidateOrigin.stableId !== question.stableId || bundle.candidateOrigin.version !== question.version || bundle.candidateOrigin.sourceSha256 !== null) reject("replacement_identity_invalid");
  const wording = evidenceQuestionWording(bundle.fact);
  if (bundle.candidateOrigin.kind === "replacement" && question.questionText !== wording.questionText) reject("unsupported_claim");
  if (bundle.candidateOrigin.kind === "replacement" && question.explanation !== wording.explanation) reject("unsupported_explanation");
  if (PROHIBITED.test(`${bundle.fact.subject} ${bundle.fact.value} ${question.questionText} ${question.explanation} ${question.countryScope || ""}`)
    || bundle.riskScreening.riskClass !== "low_objective" || bundle.riskScreening.prohibitedSubjects.length
    || !bundle.riskScreening.finding.trim()) reject("prohibited_subject");
  if (question.region !== bundle.scopeAnalysis.region || question.countryScope !== bundle.scopeAnalysis.country || !bundle.scopeAnalysis.finding.trim()
    || !question.countryScope || !EDITION_COUNTRIES[question.region].some(country => placeName(country) === placeName(question.countryScope!))
    || (bundle.fact.predicate === "country" && placeName(bundle.fact.value) !== placeName(question.countryScope))) reject("regional_scope_invalid");
  if (question.answerOptions.length !== 4 || new Set(question.answerOptions.map((option) => option.id)).size !== 4
    || new Set(question.answerOptions.map((option) => normalized(option.text))).size !== 4
    || question.acceptedAnswers.length !== 1 || question.acceptedAnswers[0].length !== 1) reject("unique_answer_required");
  const correct = answerOption(question.answerOptions, question.acceptedAnswers[0][0]);
  if (normalized(correct.text) !== normalized(bundle.fact.value)) reject("unsupported_answer");
  if (bundle.fact.predicate === "country" && new Set(question.answerOptions.map(option => placeName(option.text))).size !== 4) reject("ambiguous_option");
  if (question.answerOptions.some((option) => /all of the above|none of the above|\bcongo\b/i.test(option.text) && !/democratic republic of the congo|republic of the congo/i.test(option.text))) reject("ambiguous_option");
  const incorrect = question.answerOptions.filter((option) => option.id !== correct.id);
  if (bundle.distractorAnalysis.length !== 3 || incorrect.some((option) => {
    const analysis = bundle.distractorAnalysis.find((item) => item.optionId === option.id);
    return !analysis || normalized(analysis.excludedValue) !== normalized(option.text) || !analysis.incorrectBecause.trim() || normalized(option.text) === normalized(correct.text);
  })) reject("distractor_not_excluded");
  if (bundle.sources.length < 2 || new Set(bundle.sources.map((source) => source.id)).size !== bundle.sources.length) reject("two_sources_required");
  if (!bundle.sources.some((source) => source.role === "primary")) reject("primary_source_required");
  if (new Set(bundle.sources.map((source) => normalized(source.upstreamIdentity))).size !== bundle.sources.length
    || new Set(bundle.sources.map((source) => normalized(source.institution))).size < 2) reject("independent_sources_required");
  for (const source of bundle.sources) {
    if (!AUTHORITATIVE_SOURCE_CLASSES.includes(source.sourceClass)) reject("source_class_prohibited");
    if (source.role !== "primary" && source.role !== "corroborating") reject("source_role_invalid");
    let url: URL;
    try { url = new URL(source.url); } catch { return reject("source_url_invalid"); }
    if (url.protocol !== "https:" || url.username || url.password || /(?:wikipedia|blogspot|tripadvisor|reddit|quiz)/i.test(url.hostname)) reject("source_url_invalid");
    if (!source.title.trim() || !source.institution.trim() || !source.locator.trim() || !source.summary.trim() || !source.independenceFinding.trim()
      || !source.upstreamIdentity.trim() || source.availability !== "inspected_accessible" || !DATE.test(source.accessDate)
      || !Number.isFinite(Date.parse(source.accessDate)) || new Date(source.accessDate).toISOString().slice(0, 10) !== source.accessDate
      || Date.parse(source.accessDate) > context.now) reject("inspected_source_required");
    for (const part of ["claim", "answer", "explanation"] as const) {
      if (!source.supports.includes(part) || !bundle.claimSourceMap[part].includes(source.id)) reject("claim_source_mapping_missing");
    }
    const related = source.facts.filter((fact) => normalized(fact.subject) === normalized(bundle.fact.subject) && fact.predicate === bundle.fact.predicate);
    if (!related.length) reject("unsupported_claim");
    if (related.some((fact) => !factEqual(fact, bundle.fact))) reject("source_conflict");
  }
  if (bundle.duplicateAnalysis.corpusSha256 !== context.corpusSha256 || !HASH.test(context.corpusSha256)
    || bundle.duplicateAnalysis.conceptKey !== evidenceConceptKey(bundle.fact) || !bundle.duplicateAnalysis.finding.trim()
    || bundle.duplicateAnalysis.exactMatches !== 0 || bundle.duplicateAnalysis.nearMatches !== 0
    || context.duplicateConceptKeys.has(bundle.duplicateAnalysis.conceptKey)) reject("duplicate_question");
  const kinds = ["entailment", "adversarial_ambiguity", "cultural_regional_risk"];
  if (bundle.reviewPasses.length !== 3 || new Set(bundle.reviewPasses.map((pass) => pass.kind)).size !== 3) reject("three_review_passes_required");
  const passedGates = new Set<string>();
  for (const pass of bundle.reviewPasses) {
    if (!kinds.includes(pass.kind) || pass.decision !== "pass" || !Number.isFinite(Date.parse(pass.inspectedAt))
      || Date.parse(pass.inspectedAt) > context.now || pass.findings.length < 2 || pass.findings.some((finding) => !finding.trim())) reject("review_pass_failed");
    if (REVIEW_PASS_GATES[pass.kind].some((gate) => !pass.gates.includes(gate))
      || pass.gates.some((gate) => !EVIDENCE_GATES.includes(gate))) reject("mandatory_gate_missing");
    pass.gates.forEach((gate) => passedGates.add(gate));
  }
  if (EVIDENCE_GATES.some((gate) => !passedGates.has(gate))) reject("mandatory_gate_missing");
  const verified = Date.parse(bundle.verifiedAt), recheck = Date.parse(bundle.recheckAt), expiry = Date.parse(bundle.expiresAt);
  if (![verified, recheck, expiry].every(Number.isFinite) || verified > context.now || recheck <= context.now || recheck <= verified
    || recheck - verified > MAX_EVIDENCE_RECHECK_MS || expiry <= context.now || expiry < recheck || expiry > MACHINE_EVIDENCE_POLICY_EXPIRES_AT) reject("evidence_expired");
  if (bundle.publicationReadiness !== "ready_under_low_risk_policy" || !HASH.test(bundle.evidenceBundleSha256)
    || await evidenceBundleHash(bundle) !== bundle.evidenceBundleSha256) reject("evidence_hash_invalid");
  return bundle;
}

export type StoredEvidenceVerification = Readonly<{
  questionId: string; questionVersion: number; questionContentSha256: string;
  method: string; status: string; riskClass: string; policyVersion: string; evidenceBundleSha256: string;
  sourceCount: number; independentSourceCount: number; primarySourceCount: number;
  verifiedAt: number; recheckAt: number; expiresAt: number; revokedAt: number | null; deletedAt: number | null;
}>;
const MACHINE_CATALOG_CONTEXT = Symbol("trusted machine evidence catalogue basis");
export type MachineEvidenceCatalogContext = Readonly<{ [MACHINE_CATALOG_CONTEXT]: true }>;
const catalogVersions = new WeakMap<MachineEvidenceCatalogContext, ReadonlySet<string>>();
/** Read-only catalogue semantics, including revoked history. This never authorises selection. */
export function machineEvidenceCatalogContext(records: readonly Readonly<{
  stableId: string; version: number; contentHash: string; verification: StoredEvidenceVerification;
}>[]): MachineEvidenceCatalogContext {
  const versions = new Set<string>();
  for (const record of records) {
    const proof = record.verification;
    if (proof.questionVersion === record.version && proof.questionContentSha256 === record.contentHash
      && proof.method === MACHINE_EVIDENCE_METHOD && proof.policyVersion === MACHINE_EVIDENCE_POLICY
      && proof.riskClass === "low_objective" && ["verified", "revoked", "expired", "deleted"].includes(proof.status)
      && HASH.test(proof.evidenceBundleSha256) && HASH.test(proof.questionContentSha256)
      && proof.independentSourceCount >= 2 && proof.sourceCount >= proof.independentSourceCount && proof.primarySourceCount >= 1) {
      versions.add(`${record.stableId}@${record.version}`);
    }
  }
  const context = Object.freeze({ [MACHINE_CATALOG_CONTEXT]: true as const });
  catalogVersions.set(context, versions);
  return context;
}
export function hasMachineEvidenceCatalogBasis(context: MachineEvidenceCatalogContext | undefined, reference: string): boolean {
  return Boolean(context && catalogVersions.get(context)?.has(reference));
}
export function currentMachineEvidence(record: StoredEvidenceVerification | null, question: Readonly<{
  id: string; version: number; contentHash: string; reviewer: string | null; sensitivityNotes: string | null; communityScope: string | null;
}>, now: number): boolean {
  return Boolean(record && question.reviewer === null && question.sensitivityNotes === null && question.communityScope === null
    && record.questionId === question.id && record.questionVersion === question.version && record.questionContentSha256 === question.contentHash
    && HASH.test(record.questionContentSha256) && HASH.test(record.evidenceBundleSha256)
    && record.method === MACHINE_EVIDENCE_METHOD && record.status === "verified" && record.riskClass === "low_objective"
    && record.policyVersion === MACHINE_EVIDENCE_POLICY && now < MACHINE_EVIDENCE_POLICY_EXPIRES_AT
    && record.sourceCount >= 2 && record.independentSourceCount >= 2 && record.independentSourceCount <= record.sourceCount
    && record.primarySourceCount >= 1 && record.primarySourceCount <= record.sourceCount
    && Number.isFinite(now) && Number.isInteger(record.questionVersion) && record.questionVersion >= 1
    && [record.sourceCount, record.independentSourceCount, record.primarySourceCount].every(Number.isInteger)
    && [record.verifiedAt, record.recheckAt, record.expiresAt].every(Number.isFinite)
    && record.verifiedAt > 0 && record.verifiedAt <= now && record.recheckAt > now && record.recheckAt - record.verifiedAt <= MAX_EVIDENCE_RECHECK_MS
    && record.expiresAt >= record.recheckAt && record.expiresAt > now && record.expiresAt <= MACHINE_EVIDENCE_POLICY_EXPIRES_AT
    && record.revokedAt === null && record.deletedAt === null);
}
