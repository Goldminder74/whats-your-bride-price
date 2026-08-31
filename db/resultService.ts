import { resolveApprovedAvatar } from "../app/avatarRegistry.ts";
import { regions, type RegionKey } from "../app/gameData.ts";
import {
  createResultUrl,
  type PublicAppOrigin,
} from "../app/publicAppOrigin.ts";
import { RESULT_TIER_TITLES } from "../app/productSafeguards.ts";
import {
  toPublicResult,
  type PublicResultData,
  type ResultRecord,
  type ResultVisibility,
} from "./dataContracts.ts";
import type { AtomicD1Database } from "./repositories.ts";

const PUBLIC_SLUG_PATTERN = /^[0-9a-f]{48}$/;

export type ResolvedPublicResult = Readonly<{
  internalResultId: string;
  data: PublicResultData;
}>;

export type PublicResultView = Readonly<{
  resultSlug: string;
  canonicalUrl: string;
  displayName: "A challenger";
  edition: RegionKey;
  editionLabel: string;
  score: number;
  total: number;
  tier: 0 | 1 | 2 | 3;
  resultTitle: string;
  masterySeal: string | null;
  avatarId: string | null;
  avatarSrc: string | null;
  safeguard: PublicResultData["safeguard"];
  expiresAt: number | null;
}>;

export interface PublicResultRepository {
  readonly storageAvailable: boolean;
  getResultByPublicSlug(publicSlug: string): Promise<ResultRecord | null>;
}

export class ResultService {
  private readonly repository: PublicResultRepository;
  private readonly options: Readonly<{ now?: () => number; publicOrigin?: PublicAppOrigin }>;

  constructor(repository: PublicResultRepository, options: Readonly<{ now?: () => number; publicOrigin?: PublicAppOrigin }> = {}) {
    this.repository = repository;
    this.options = options;
  }

  async getPublic(publicSlug: unknown): Promise<ResolvedPublicResult | null> {
    if (!this.repository.storageAvailable || typeof publicSlug !== "string" || !PUBLIC_SLUG_PATTERN.test(publicSlug)) return null;
    const record = await this.repository.getResultByPublicSlug(publicSlug);
    if (!record) return null;
    try {
      const data = toPublicResult(record, this.options.now?.() ?? Date.now());
      return data ? Object.freeze({ internalResultId: record.id, data }) : null;
    } catch {
      return null;
    }
  }

  toView(result: ResolvedPublicResult): PublicResultView {
    const region = regions[result.data.edition];
    return Object.freeze({
      resultSlug: result.data.resultSlug,
      canonicalUrl: createResultUrl(result.data.resultSlug, this.options.publicOrigin),
      displayName: "A challenger",
      edition: result.data.edition,
      editionLabel: region.name,
      score: result.data.score,
      total: result.data.total,
      tier: result.data.tier,
      resultTitle: RESULT_TIER_TITLES[result.data.tier],
      masterySeal: result.data.score >= 9 ? `${region.name} mastery` : null,
      avatarId: result.data.safeAvatarId,
      avatarSrc: result.data.safeAvatarId ? resolveApprovedAvatar(result.data.safeAvatarId).src : null,
      safeguard: result.data.safeguard,
      expiresAt: result.data.expiresAt,
    });
  }
}

type ResultRow = Readonly<{
  id: string;
  public_slug: string;
  edition_key: string;
  score: number;
  total: number;
  tier: number;
  scoring_version: string;
  safe_avatar_id: string | null;
  reviewed_display_name: string | null;
  safeguard_version: string;
  visibility: ResultVisibility;
  state: ResultRecord["state"];
  created_at: number;
  expires_at: number | null;
}>;

export class D1PublicResultRepository implements PublicResultRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }

  async getResultByPublicSlug(publicSlug: string): Promise<ResultRecord | null> {
    const row = await this.database.prepare(`SELECT
      r.id, r.public_slug, qe.edition_key, r.score, r.total, r.tier, r.scoring_version,
      r.safe_avatar_id, r.reviewed_display_name, r.safeguard_version, r.visibility,
      r.state, r.created_at, r.expires_at
    FROM results r
    JOIN quiz_editions qe ON qe.id = r.edition_id
    WHERE r.public_slug = ?1
    LIMIT 1`).bind(publicSlug).first<ResultRow>();
    return row ? Object.freeze({
      id: row.id,
      publicSlug: row.public_slug,
      editionKey: row.edition_key,
      score: row.score,
      total: row.total,
      tier: row.tier,
      scoringVersion: row.scoring_version,
      safeAvatarId: row.safe_avatar_id,
      reviewedDisplayName: row.reviewed_display_name,
      safeguardVersion: row.safeguard_version,
      visibility: row.visibility,
      state: row.state,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }) : null;
  }
}
