import type { DeletionOrAnonymisationOperation } from "./dataContracts.ts";

export const deletionCredentialEntropyBytes = 32;
export const deletionCredentialLifetimeMs = 30 * 24 * 60 * 60 * 1000;

type CryptoLike = Pick<Crypto, "getRandomValues" | "subtle">;

export type DeletionCredentialVerifier = Readonly<{
  version: 1;
  targetRecordId: string;
  tokenHash: string;
  issuedAt: number;
  expiresAt: number;
  rotation: number;
}>;

export type IssuedDeletionCredential = Readonly<{
  bearerToken: string;
  verifier: DeletionCredentialVerifier;
}>;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/.test(value) || value.length % 2) return null;
  return Uint8Array.from(value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
}

async function tokenHash(cryptoApi: CryptoLike, targetRecordId: string, bearerToken: string): Promise<string> {
  const message = new TextEncoder().encode(`wybp-deletion-v1\u0000${targetRecordId}\u0000${bearerToken}`);
  return toHex(new Uint8Array(await cryptoApi.subtle.digest("SHA-256", message)));
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index % Math.max(1, left.length)] || 0) ^ (right[index % Math.max(1, right.length)] || 0);
  return difference === 0;
}

export async function issueDeletionCredential(input: {
  targetRecordId: string;
  cryptoApi?: CryptoLike;
  now?: number;
  rotation?: number;
}): Promise<IssuedDeletionCredential> {
  const cryptoApi = input.cryptoApi ?? globalThis.crypto;
  if (!cryptoApi?.getRandomValues || !cryptoApi.subtle) throw new Error("Secure deletion credentials are unavailable without Web Crypto.");
  const random = new Uint8Array(deletionCredentialEntropyBytes);
  cryptoApi.getRandomValues(random);
  const bearerToken = toHex(random);
  const now = input.now ?? Date.now();
  const verifier: DeletionCredentialVerifier = Object.freeze({
    version: 1,
    targetRecordId: input.targetRecordId,
    tokenHash: await tokenHash(cryptoApi, input.targetRecordId, bearerToken),
    issuedAt: now,
    expiresAt: now + deletionCredentialLifetimeMs,
    rotation: input.rotation ?? 1,
  });
  return Object.freeze({ bearerToken, verifier });
}

export async function verifyDeletionCredential(input: {
  targetRecordId: string;
  bearerToken: string;
  verifier: DeletionCredentialVerifier;
  cryptoApi?: CryptoLike;
  now?: number;
}): Promise<boolean> {
  const cryptoApi = input.cryptoApi ?? globalThis.crypto;
  const now = input.now ?? Date.now();
  if (!cryptoApi?.subtle || input.verifier.version !== 1 || input.verifier.expiresAt <= now || input.targetRecordId !== input.verifier.targetRecordId || !/^[0-9a-f]{64}$/.test(input.bearerToken)) return false;
  const expected = fromHex(input.verifier.tokenHash);
  if (!expected) return false;
  const actual = fromHex(await tokenHash(cryptoApi, input.targetRecordId, input.bearerToken));
  return Boolean(actual && constantTimeEqual(actual, expected));
}

export type SanitizedDeletionOutcome = "accepted" | "already_processed" | "unavailable";

export type SyntheticDeletableRecord = {
  id: string;
  targetType: DeletionOrAnonymisationOperation["targetType"];
  state: "active" | "revoked" | "anonymized" | "deleted";
  publicProjectionActive: boolean;
  identityLinked: boolean;
  integrityDataRetained: boolean;
};

export type SanitizedDeletionAudit = Readonly<{
  outcome: SanitizedDeletionOutcome;
  mode: DeletionOrAnonymisationOperation["mode"];
  targetType: DeletionOrAnonymisationOperation["targetType"];
}>;

export class SyntheticDeletionService {
  readonly processedOperationHashes = new Set<string>();
  private readonly records = new Map<string, SyntheticDeletableRecord>();

  constructor(records: readonly SyntheticDeletableRecord[] = []) {
    for (const record of records) this.records.set(record.id, { ...record });
  }

  inspectForTest(recordId: string): Readonly<SyntheticDeletableRecord> | null {
    const record = this.records.get(recordId);
    return record ? Object.freeze({ ...record }) : null;
  }

  async apply(input: {
    operation: DeletionOrAnonymisationOperation;
    targetRecordId: string;
    bearerToken: string;
    verifier: DeletionCredentialVerifier;
    cryptoApi?: CryptoLike;
    now?: number;
  }): Promise<SanitizedDeletionOutcome> {
    if (this.processedOperationHashes.has(input.operation.idempotencyKeyHash)) return "already_processed";
    const verified = await verifyDeletionCredential(input);
    if (!verified) return "unavailable";
    const record = this.records.get(input.targetRecordId);
    if (!record || record.targetType !== input.operation.targetType) return "unavailable";
    record.publicProjectionActive = false;
    if (input.operation.mode === "revoke_public_access") record.state = "revoked";
    if (input.operation.mode === "anonymize") {
      record.state = "anonymized";
      record.identityLinked = false;
      record.integrityDataRetained = true;
    }
    if (input.operation.mode === "delete") {
      record.state = "deleted";
      record.identityLinked = false;
      record.integrityDataRetained = false;
    }
    this.processedOperationHashes.add(input.operation.idempotencyKeyHash);
    return "accepted";
  }

  sanitizedAudit(outcome: SanitizedDeletionOutcome, operation: DeletionOrAnonymisationOperation): SanitizedDeletionAudit {
    return Object.freeze({ outcome, mode: operation.mode, targetType: operation.targetType });
  }
}

export const deletionEndpointActive = false;
