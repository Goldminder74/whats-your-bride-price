import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  SyntheticDeletionService,
  constantTimeEqual,
  deletionCredentialEntropyBytes,
  deletionCredentialLifetimeMs,
  deletionEndpointActive,
  issueDeletionCredential,
  verifyDeletionCredential,
} from "../../db/deletionReadiness.ts";

const operation = Object.freeze({
  operationId: "operation_1234567890",
  targetType: "result",
  targetPublicCode: "a".repeat(48),
  requestedAt: 1_000,
  mode: "anonymize",
  idempotencyKeyHash: "b".repeat(64),
});

test("issues a one-time 256-bit bearer token and stores only its record-bound hash", async () => {
  assert.equal(deletionCredentialEntropyBytes, 32);
  const issued = await issueDeletionCredential({ targetRecordId: "result_1234567890", now: 1_000 });
  assert.match(issued.bearerToken, /^[0-9a-f]{64}$/);
  assert.match(issued.verifier.tokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(issued.verifier.tokenHash, issued.bearerToken);
  assert.equal(issued.verifier.expiresAt, 1_000 + deletionCredentialLifetimeMs);
  assert.equal("bearerToken" in issued.verifier, false);
});

test("verifies valid tokens and rejects invalid, expired and cross-record tokens", async () => {
  const issued = await issueDeletionCredential({ targetRecordId: "result_1234567890", now: 1_000 });
  assert.equal(await verifyDeletionCredential({ targetRecordId: "result_1234567890", bearerToken: issued.bearerToken, verifier: issued.verifier, now: 1_001 }), true);
  assert.equal(await verifyDeletionCredential({ targetRecordId: "result_1234567890", bearerToken: "0".repeat(64), verifier: issued.verifier, now: 1_001 }), false);
  assert.equal(await verifyDeletionCredential({ targetRecordId: "result_other_12345", bearerToken: issued.bearerToken, verifier: issued.verifier, now: 1_001 }), false);
  assert.equal(await verifyDeletionCredential({ targetRecordId: "result_1234567890", bearerToken: issued.bearerToken, verifier: issued.verifier, now: issued.verifier.expiresAt }), false);
  const rotated = await issueDeletionCredential({ targetRecordId: "result_1234567890", now: 2_000, rotation: 2 });
  assert.equal(await verifyDeletionCredential({ targetRecordId: "result_1234567890", bearerToken: issued.bearerToken, verifier: rotated.verifier, now: 2_001 }), false);
  assert.equal(await verifyDeletionCredential({ targetRecordId: "result_1234567890", bearerToken: rotated.bearerToken, verifier: rotated.verifier, now: 2_001 }), true);
});

test("constant-time comparison covers equal, unequal and different-length values", () => {
  assert.equal(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2)), true);
  assert.equal(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 3)), false);
  assert.equal(constantTimeEqual(Uint8Array.of(1), Uint8Array.of(1, 0)), false);
});

test("synthetic anonymisation is idempotent and returns one sanitised unavailable outcome", async () => {
  const issued = await issueDeletionCredential({ targetRecordId: "result_1234567890", now: 1_000 });
  const service = new SyntheticDeletionService([{ id: "result_1234567890", targetType: "result", state: "active", publicProjectionActive: true, identityLinked: true, integrityDataRetained: true }]);
  const input = { operation, targetRecordId: "result_1234567890", bearerToken: issued.bearerToken, verifier: issued.verifier, now: 1_001 };
  assert.equal(await service.apply(input), "accepted");
  assert.equal(await service.apply(input), "already_processed");
  assert.deepEqual(service.inspectForTest("result_1234567890"), { id: "result_1234567890", targetType: "result", state: "anonymized", publicProjectionActive: false, identityLinked: false, integrityDataRetained: true });
  assert.deepEqual(service.sanitizedAudit("accepted", operation), { outcome: "accepted", mode: "anonymize", targetType: "result" });
  assert.equal(JSON.stringify(service.sanitizedAudit("accepted", operation)).includes(issued.bearerToken), false);
  assert.equal(await new SyntheticDeletionService().apply({ ...input, targetRecordId: "result_other_12345" }), "unavailable");
  assert.equal(deletionEndpointActive, false);
});

test("keeps deletion endpoints and durable bindings inactive", async () => {
  const worker = await readFile(new URL("../../worker/index.ts", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../../.openai/hosting.json", import.meta.url), "utf8"));
  assert.deepEqual({ d1: hosting.d1, r2: hosting.r2 }, { d1: null, r2: null });
  assert.doesNotMatch(worker, /\/delete|\/anonymi[sz]e|deletion-token|bearer/i);
});
