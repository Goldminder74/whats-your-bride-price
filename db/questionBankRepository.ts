import type { AtomicD1Database } from "./repositories.ts";
import { validateQuestionBankDocument, type QuestionBankDocument, type QuestionBankQuestion, type QuestionSource } from "./questionBankContracts.ts";
import { buildLegacyQuestionBankDocument } from "./questionBankWorkflow.ts";

type QuestionRow = Readonly<Record<string, unknown> & {
  id: string; stable_id: string; version: number; edition_key: string; country_scope: string | null;
  subregion_scope: string | null; community_scope: string | null; category: string; difficulty: string | null;
  question_kind: string; question_text: string; answer_options_json: string; correct_answer_json: string;
  accepted_answers_json: string; explanation: string; scoring_weight: number; language: string; locale: string;
  publication_status: string; source_review_status: string; sensitivity_notes: string | null;
  reviewed_by: string | null; reviewed_at: number | null; published_at: number | null; retired_at: number | null;
  valid_from: number | null; valid_until: number | null; image_provenance_json: string; audio_provenance_json: string;
}>;
type SourceRow = Readonly<{
  question_id: string; title: string; organisation_or_author: string; url_or_reference: string;
  publication_date: string | null; access_date: string; source_type: string; review_status: string;
  relevant_claim: string | null;
}>;

function day(value: number | null): string | null { return value === null ? null : new Date(value).toISOString().slice(0, 10); }

function lifecycle(row: QuestionRow): QuestionBankQuestion["lifecycleStatus"] {
  if (row.publication_status === "published" || row.publication_status === "retired" || row.publication_status === "draft") return row.publication_status;
  if (row.publication_status === "review") return row.source_review_status === "approved" ? "approved" : "review";
  throw new Error("unsupported_question_lifecycle");
}

export class D1QuestionBankRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }

  async list(): Promise<QuestionBankDocument> {
    const [questionResult, sourceResult, legacy] = await Promise.all([
      this.database.prepare(`SELECT q.id,q.stable_id,q.version,qe.edition_key,q.country_scope,q.subregion_scope,
        q.community_scope,q.category,q.difficulty,q.question_kind,q.question_text,q.answer_options_json,
        q.correct_answer_json,q.accepted_answers_json,q.explanation,q.scoring_weight,q.language,q.locale,
        q.publication_status,q.source_review_status,q.sensitivity_notes,q.reviewed_by,q.reviewed_at,
        q.published_at,q.retired_at,q.valid_from,q.valid_until,q.image_provenance_json,q.audio_provenance_json
      FROM questions q JOIN quiz_editions qe ON qe.id=q.edition_id
      ORDER BY q.stable_id,q.version`).all<QuestionRow>(),
      this.database.prepare(`SELECT question_id,title,organisation_or_author,url_or_reference,publication_date,
        access_date,source_type,review_status,relevant_claim FROM question_sources
      WHERE question_id IS NOT NULL ORDER BY question_id,url_or_reference`).all<SourceRow>(),
      buildLegacyQuestionBankDocument(),
    ]);
    if (!questionResult.success || !sourceResult.success) throw new Error("question_bank_storage_unavailable");
    const legacyByVersion = new Map(legacy.questions.map((question) => [`${question.stableId}@${question.version}`, question]));
    const sources = new Map<string, QuestionSource[]>();
    for (const source of sourceResult.results) {
      if (source.review_status !== "approved" || !source.relevant_claim) continue;
      const list = sources.get(source.question_id) || [];
      list.push({
        title: source.title, organisationOrAuthor: source.organisation_or_author,
        urlOrReference: source.url_or_reference, publicationDate: source.publication_date,
        accessDate: source.access_date, sourceType: source.source_type as QuestionSource["sourceType"],
        reviewStatus: "approved", relevantClaim: source.relevant_claim,
      });
      sources.set(source.question_id, list);
    }
    const questions = questionResult.results.map((row) => {
      const legacyQuestion = legacyByVersion.get(`${row.stable_id}@${row.version}`);
      const accepted = JSON.parse(row.accepted_answers_json) as string[][];
      const record = {
        stableId: row.stable_id, version: row.version, region: row.edition_key,
        countryScope: row.country_scope, subregionScope: row.subregion_scope, communityScope: row.community_scope,
        category: row.category, difficulty: row.difficulty || legacyQuestion?.difficulty,
        questionKind: row.question_kind, questionText: row.question_text,
        answerOptions: JSON.parse(row.answer_options_json),
        acceptedAnswers: accepted.length ? accepted : [JSON.parse(row.correct_answer_json)],
        explanation: row.explanation, sources: sources.get(row.id) || legacyQuestion?.sources || [],
        reviewer: row.reviewed_by || legacyQuestion?.reviewer || null,
        reviewDate: day(row.reviewed_at) || legacyQuestion?.reviewDate || null,
        sensitivityNotes: row.sensitivity_notes, language: row.language, locale: row.locale,
        lifecycleStatus: lifecycle(row), publishedAt: day(row.published_at), retiredAt: day(row.retired_at),
        validFrom: day(row.valid_from) || legacyQuestion?.validFrom || null, validUntil: day(row.valid_until),
        scoringWeight: row.scoring_weight, imageProvenance: JSON.parse(row.image_provenance_json),
        audioProvenance: JSON.parse(row.audio_provenance_json),
      };
      return record;
    });
    return validateQuestionBankDocument({ schemaVersion: "question-bank-v1", questions });
  }
}
