import assert from "node:assert/strict";
import test from "node:test";
import {
  CHALLENGE_TEMPORARY_COPY,
  CHALLENGE_UNAVAILABLE_COPY,
  loadChallengeLanding,
} from "../../app/challengeLandingServer.ts";

const code = "1".repeat(48);
const active = Object.freeze({
  challengeCode: code,
  displayName: "Ọlá",
  edition: "west",
  editionLabel: "West Africa",
  scoreToBeat: 10,
  maximumScore: 12,
  avatarId: "adjoa",
  status: "active",
  createdAt: 1,
  expiresAt: 2,
});

test("server landing resolves an active safe projection without any write boundary", async () => {
  let reads = 0;
  const state = await loadChallengeLanding(code, {
    enabled: true,
    reader: {
      storageAvailable: true,
      async getPublic(requested) {
        reads += 1;
        assert.equal(requested, code);
        return active;
      },
    },
  });
  assert.deepEqual(state, { kind: "active", challenge: active });
  assert.equal(reads, 1);
  assert.equal("accept" in state, false);
});

test("disabled, absent storage, malformed and all nonactive records share one neutral state", async () => {
  const unavailable = { kind: "unavailable", message: CHALLENGE_UNAVAILABLE_COPY };
  assert.deepEqual(await loadChallengeLanding(code, { enabled: false, reader: null }), unavailable);
  assert.deepEqual(await loadChallengeLanding(code, { enabled: true, reader: null }), unavailable);
  assert.deepEqual(await loadChallengeLanding("A".repeat(48), { enabled: true, reader: null }), unavailable);
  assert.deepEqual(await loadChallengeLanding("../private", { enabled: true, reader: null }), unavailable);
  for (const status of ["expired", "revoked"]) {
    assert.deepEqual(await loadChallengeLanding(code, {
      enabled: true,
      reader: { storageAvailable: true, async getPublic() { return { ...active, status }; } },
    }), unavailable);
  }
  assert.deepEqual(await loadChallengeLanding(code, {
    enabled: true,
    reader: { storageAvailable: true, async getPublic() { return null; } },
  }), unavailable);
});

test("temporary storage failures expose no infrastructure detail", async () => {
  const state = await loadChallengeLanding(code, {
    enabled: true,
    reader: {
      storageAvailable: true,
      async getPublic() { throw new Error("D1 table challenges secret-internal-id"); },
    },
  });
  assert.deepEqual(state, { kind: "temporary_failure", message: CHALLENGE_TEMPORARY_COPY });
  assert.doesNotMatch(JSON.stringify(state), /D1|table|secret|internal/i);
});
