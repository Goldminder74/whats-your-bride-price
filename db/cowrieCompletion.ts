import { deriveAnonymousSubjectHash } from "../app/anonymousSession.ts";
import { calculateResultTier } from "../app/gameLogic.ts";
import { D1QuestionSelectionRepository } from "./questionSelection.ts";
import { validateResultCompletionRequest } from "./resultCompletion.ts";
import type { AtomicD1Database } from "./repositories.ts";
import { authorizeCowrieAchievement, CowrieRequestError, CowrieWalletService, D1CowrieWalletRepository } from "./cowrieWallet.ts";

const randomHex = (length: number) => [...crypto.getRandomValues(new Uint8Array(length))].map(value => value.toString(16).padStart(2, "0")).join("");
const fail = (): never => { throw new CowrieRequestError("cowrie_completion_unavailable"); };

/** Completes only the owner's exact already-issued random attempt. No score is accepted. */
export async function completeCowrieQuickPlay(database: AtomicD1Database, value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const { attemptId, ...body } = value as Record<string, unknown>;
  if (typeof attemptId !== "string" || !/^attempt_[0-9a-f]{48}$/.test(attemptId)) return fail();
  const request = validateResultCompletionRequest(body);
  const owner = await deriveAnonymousSubjectHash(request.anonymousSessionCredential);
  if (!owner) return fail();
  const selectionRepository = new D1QuestionSelectionRepository(database);
  if (await selectionRepository.consumeRateLimit(owner, "complete", now, 20) !== "allowed") throw new CowrieRequestError("cowrie_rate_limited");
  const repository = new D1CowrieWalletRepository(database, selectionRepository);
  const wallet = await repository.getWalletByOwner(owner);
  if (!wallet || wallet.state !== "active") return fail();
  const existing = async () => database.prepare(`SELECT r.public_slug,r.score,qe.edition_key FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id JOIN quiz_editions qe ON qe.id=r.edition_id WHERE qa.id=?1 AND qa.anonymous_subject_hash=?2 AND qa.status='completed' AND qa.play_mode='random' AND qa.selection_policy_version='balanced-random-v2' AND qa.deleted_at IS NULL AND r.state='active' AND r.expires_at>?3 LIMIT 1`).bind(attemptId, owner, now).first<{ public_slug: string; score: number; edition_key: string }>();
  let result = await existing();
  if (!result) {
    const stored = await selectionRepository.getAttempt(attemptId, owner, now);
    if (!stored || stored.selection.questions.length !== 12) return fail();
    const submitted = new Map(request.answers.map(answer => [answer.questionStableId, answer.selectedOptionIds]));
    const answers = stored.selection.questions.map(question => {
      const selected = submitted.get(question.stableId);
      if (!selected || selected.some(id => !question.answerOptions.some(option => option.id === id))) return fail();
      const correct = question.acceptedAnswers.some(accepted => accepted.length === selected.length && [...accepted].sort().every((id, index) => id === [...selected].sort()[index]));
      return { question, selected, correct };
    });
    if (submitted.size !== answers.length || answers.some(answer => answer.question.scoringWeight !== 1)) return fail();
    const score = answers.filter(answer => answer.correct).length;
    const slug = randomHex(24);
    // The result/answer inserts share the guarded completion transaction. A losing
    // concurrent transaction fails the existing unique attempt/result constraints.
    const statements = [database.prepare(`UPDATE quiz_attempts SET status='completed',completed_at=?3,updated_at=?3,version=version+1 WHERE id=?1 AND anonymous_subject_hash=?2 AND status='in_progress' AND play_mode='random' AND selection_policy_version='balanced-random-v2' AND deleted_at IS NULL AND expires_at>?3`).bind(attemptId, owner, now)];
    for (const answer of answers) statements.push(database.prepare(`INSERT INTO answers (id,attempt_id,question_id,question_version,selected_option_ids_json,is_correct,score_awarded,answered_at,version,created_at,updated_at) SELECT ?1,id,?3,?4,?5,?6,?6,?7,1,?7,?7 FROM quiz_attempts WHERE id=?2 AND anonymous_subject_hash=?8 AND status='completed' AND completed_at=?7`).bind(`answer_${randomHex(16)}`, attemptId, answer.question.internalId, answer.question.version, JSON.stringify(answer.selected), answer.correct ? 1 : 0, now, owner));
    statements.push(database.prepare(`INSERT INTO results (id,public_slug,attempt_id,edition_id,score,total,tier,scoring_version,question_set_version,scoring_snapshot_json,safe_avatar_id,reviewed_display_name,safeguard_version,visibility,state,expires_at,version,created_at,updated_at) SELECT ?1,?2,id,edition_id,?4,12,?5,scoring_version,question_set_version,?6,?7,NULL,'culture-score-v1','private','active',?8,1,?9,?9 FROM quiz_attempts WHERE id=?3 AND anonymous_subject_hash=?10 AND status='completed' AND completed_at=?9`).bind(`result_${randomHex(16)}`, slug, attemptId, score, calculateResultTier(score), JSON.stringify({ mode: "random", scoringWeightPolicy: "binary-one-point", questionSetVersion: stored.selection.questionSetVersion }), request.avatarId, now + 90 * 86400000, now, owner));
    try { await database.batch(statements); } catch { /* Read only the winning committed result. */ }
    result = await existing();
    if (!result) return fail();
  }
  const service = new CowrieWalletService(repository, { now: () => now });
  if (result.score === 12) await service.award(wallet, authorizeCowrieAchievement({ kind: "perfect_region_day", scope: `${result.edition_key}:${new Date(now).toISOString().slice(0, 10)}`, authoritative: true, practice: false, classicFallback: false }));
  await service.award(wallet, authorizeCowrieAchievement({ kind: "all_region_mastery", scope: "all:binary-exact-set-v1", authoritative: true, practice: false, classicFallback: false }));
  return Object.freeze({ completed: true, resultSlug: result.public_slug });
}
