import {
  RESULT_PREVIEW_MAX_BYTES,
  RESULT_PREVIEW_MIME,
  renderResultPreview,
  type RenderedResultPreview,
} from "../app/resultPreview.ts";
import type { PublicResultData } from "./dataContracts.ts";
import type { AtomicD1Database } from "./repositories.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PUBLIC_SLUG_PATTERN = /^[0-9a-f]{48}$/;

export type StoredResultPreview = Readonly<{
  resultId: string;
  resultSlug: string;
  objectKey: string;
  contentHash: string;
  mimeType: typeof RESULT_PREVIEW_MIME;
  width: 1200;
  height: 630;
  byteSize: number;
  generationVersion: string;
  expiresAt: number | null;
  state: "ready" | "revoked" | "expired" | "deleted";
}>;

export interface GeneratedMediaObjectStore {
  readonly storageAvailable: boolean;
  get(objectKey: string): Promise<Uint8Array | null>;
  putImmutable(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(objectKey: string): Promise<void>;
}

export interface ResultPreviewRepository {
  readonly storageAvailable: boolean;
  getReadyForResult(resultSlug: string): Promise<StoredResultPreview | null>;
  saveReady(record: StoredResultPreview): Promise<StoredResultPreview>;
  revokeForResult(resultId: string): Promise<void>;
}

export class InMemoryGeneratedMediaStore implements GeneratedMediaObjectStore {
  readonly storageAvailable: boolean;
  private readonly objects = new Map<string, Uint8Array>();
  constructor(storageAvailable = true) { this.storageAvailable = storageAvailable; }
  async get(objectKey: string): Promise<Uint8Array | null> { return this.storageAvailable ? this.objects.get(objectKey)?.slice() || null : null; }
  async putImmutable(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (!this.storageAvailable || contentType !== RESULT_PREVIEW_MIME || bytes.length > RESULT_PREVIEW_MAX_BYTES) throw new Error("generated_media_storage_unavailable");
    const existing = this.objects.get(objectKey);
    if (existing && (existing.length !== bytes.length || existing.some((byte, index) => byte !== bytes[index]))) throw new Error("generated_media_immutable_conflict");
    if (!existing) this.objects.set(objectKey, bytes.slice());
  }
  async delete(objectKey: string): Promise<void> { if (this.storageAvailable) this.objects.delete(objectKey); }
}

export class InMemoryResultPreviewRepository implements ResultPreviewRepository {
  readonly storageAvailable: boolean;
  readonly records = new Map<string, StoredResultPreview>();
  readonly writeCount = { save: 0, revoke: 0 };
  constructor(storageAvailable = true) { this.storageAvailable = storageAvailable; }
  async getReadyForResult(resultSlug: string): Promise<StoredResultPreview | null> {
    const record = this.records.get(resultSlug);
    return this.storageAvailable && record?.state === "ready" ? record : null;
  }
  async saveReady(record: StoredResultPreview): Promise<StoredResultPreview> {
    if (!this.storageAvailable) throw new Error("generated_media_metadata_unavailable");
    const existing = this.records.get(record.resultSlug);
    if (existing) {
      if (existing.contentHash !== record.contentHash || existing.objectKey !== record.objectKey) throw new Error("generated_media_record_conflict");
      if (existing.state === "ready") return existing;
      this.records.set(record.resultSlug, record); this.writeCount.save += 1; return record;
    }
    this.records.set(record.resultSlug, record); this.writeCount.save += 1; return record;
  }
  async revokeForResult(resultId: string): Promise<void> {
    for (const [slug, record] of this.records) if (record.resultId === resultId && record.state === "ready") {
      this.records.set(slug, Object.freeze({ ...record, state: "revoked" })); this.writeCount.revoke += 1;
    }
  }
}

type D1PreviewRow = Readonly<{
  result_id: string; public_slug: string; object_key: string; content_hash: string;
  mime_type: "image/png"; width: 1200; height: 630; byte_size: number;
  generation_version: string; expires_at: number | null; state: StoredResultPreview["state"];
}>;

function previewFromRow(row: D1PreviewRow): StoredResultPreview {
  return Object.freeze({ resultId: row.result_id, resultSlug: row.public_slug, objectKey: row.object_key, contentHash: row.content_hash, mimeType: row.mime_type, width: row.width, height: row.height, byteSize: row.byte_size, generationVersion: row.generation_version, expiresAt: row.expires_at, state: row.state });
}

export class D1ResultPreviewRepository implements ResultPreviewRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  private readonly now: () => number;
  constructor(database: AtomicD1Database, now: () => number = Date.now) { this.database = database; this.now = now; }
  async getReadyForResult(resultSlug: string): Promise<StoredResultPreview | null> {
    const row = await this.database.prepare(`SELECT m.result_id, r.public_slug, m.object_key, m.content_hash,
      m.mime_type, m.width, m.height, m.byte_size, m.generation_version, m.expires_at, m.state
    FROM media_assets m JOIN results r ON r.id = m.result_id
    WHERE r.public_slug = ?1 AND m.media_type = 'open_graph' AND m.privacy_classification = 'safe_public'
      AND m.state = 'ready'
    ORDER BY m.created_at DESC LIMIT 1`).bind(resultSlug).first<D1PreviewRow>();
    return row ? previewFromRow(row) : null;
  }
  async saveReady(record: StoredResultPreview): Promise<StoredResultPreview> {
    const now = this.now();
    await this.database.prepare(`INSERT INTO media_assets (
      id, object_key, media_type, owner_type, owner_id, result_id, edition_id,
      width, height, mime_type, byte_size, content_hash, generation_version,
      privacy_classification, state, expires_at, version, created_at, updated_at
    ) SELECT ?1, ?2, 'open_graph', 'result', ?3, ?3, r.edition_id,
      ?4, ?5, ?6, ?7, ?8, ?9, 'safe_public', 'ready', ?10, 1, ?11, ?11
    FROM results r WHERE r.id = ?3
    ON CONFLICT(object_key) DO NOTHING`).bind(
      `media_${record.contentHash}`, record.objectKey, record.resultId, record.width, record.height,
      record.mimeType, record.byteSize, record.contentHash, record.generationVersion, record.expiresAt, now,
    ).run();
    await this.database.prepare(`UPDATE media_assets SET state = 'ready', updated_at = ?1
      WHERE object_key = ?2 AND result_id = ?3 AND content_hash = ?4
        AND media_type = 'open_graph' AND privacy_classification = 'safe_public'`)
      .bind(now, record.objectKey, record.resultId, record.contentHash).run();
    const saved = await this.getReadyForResult(record.resultSlug);
    if (!saved || saved.contentHash !== record.contentHash) throw new Error("generated_media_record_conflict");
    return saved;
  }
  async revokeForResult(resultId: string): Promise<void> {
    await this.database.prepare(`UPDATE media_assets SET state = 'revoked', updated_at = ?1
      WHERE result_id = ?2 AND media_type = 'open_graph' AND state = 'ready'`).bind(this.now(), resultId).run();
  }
}

export type PublicPreviewAsset = Readonly<{
  record: StoredResultPreview;
  bytes: Uint8Array;
}>;

export class ResultMediaService {
  private readonly repository: ResultPreviewRepository;
  private readonly objects: GeneratedMediaObjectStore;
  constructor(repository: ResultPreviewRepository, objects: GeneratedMediaObjectStore) {
    this.repository = repository; this.objects = objects;
  }
  get storageAvailable(): boolean { return this.repository.storageAvailable && this.objects.storageAvailable; }

  async prepare(resultId: string, result: PublicResultData): Promise<StoredResultPreview> {
    if (!this.storageAvailable) throw new Error("generated_media_storage_unavailable");
    const existing = await this.repository.getReadyForResult(result.resultSlug);
    if (existing) return existing;
    const rendered: RenderedResultPreview = await renderResultPreview(result);
    await this.objects.putImmutable(rendered.objectKey, rendered.bytes, rendered.mimeType);
    return this.repository.saveReady(Object.freeze({
      resultId,
      resultSlug: result.resultSlug,
      objectKey: rendered.objectKey,
      contentHash: rendered.contentHash,
      mimeType: RESULT_PREVIEW_MIME,
      width: rendered.width,
      height: rendered.height,
      byteSize: rendered.bytes.length,
      generationVersion: rendered.generationVersion,
      expiresAt: result.expiresAt,
      state: "ready",
    }));
  }

  async get(resultSlug: string, contentHash: string): Promise<PublicPreviewAsset | null> {
    if (!this.storageAvailable || !PUBLIC_SLUG_PATTERN.test(resultSlug) || !SHA256_PATTERN.test(contentHash)) return null;
    const record = await this.repository.getReadyForResult(resultSlug);
    if (!record || record.contentHash !== contentHash || record.mimeType !== RESULT_PREVIEW_MIME || record.byteSize > RESULT_PREVIEW_MAX_BYTES) return null;
    const bytes = await this.objects.get(record.objectKey);
    return bytes && bytes.length === record.byteSize ? Object.freeze({ record, bytes }) : null;
  }

  async getReady(resultSlug: string): Promise<PublicPreviewAsset | null> {
    if (!this.storageAvailable || !PUBLIC_SLUG_PATTERN.test(resultSlug)) return null;
    const record = await this.repository.getReadyForResult(resultSlug);
    if (!record) return null;
    return this.get(resultSlug, record.contentHash);
  }

  async revoke(resultId: string, resultSlug: string): Promise<void> {
    const record = await this.repository.getReadyForResult(resultSlug);
    await this.repository.revokeForResult(resultId);
    if (record) await this.objects.delete(record.objectKey);
  }
}

export type R2BucketLike = Readonly<{
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView, options: { httpMetadata: { contentType: string }; onlyIf?: { etagDoesNotMatch: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
}>;

export class R2GeneratedMediaStore implements GeneratedMediaObjectStore {
  readonly storageAvailable = true;
  private readonly bucket: R2BucketLike;
  constructor(bucket: R2BucketLike) { this.bucket = bucket; }
  async get(objectKey: string): Promise<Uint8Array | null> {
    const object = await this.bucket.get(objectKey); return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
  async putImmutable(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.bucket.put(objectKey, bytes, { httpMetadata: { contentType }, onlyIf: { etagDoesNotMatch: "*" } });
  }
  async delete(objectKey: string): Promise<void> { await this.bucket.delete(objectKey); }
}
