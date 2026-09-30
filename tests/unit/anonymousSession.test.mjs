import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anonymousSessionEntropyBytes,
  anonymousSessionLifetimeMs,
  anonymousSessionStorageKey,
  clearAnonymousSession,
  deriveAnonymousSubjectHash,
  getOrCreateAnonymousSession,
} from "../../app/anonymousSession.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test("creates at least 128 bits of lowercase hexadecimal session entropy", () => {
  assert.equal(anonymousSessionEntropyBytes, 16);
  const storage = new MemoryStorage();
  const result = getOrCreateAnonymousSession(storage, crypto, 1_000);
  assert.equal(result.available, true);
  assert.match(result.sessionId, /^[0-9a-f]{32}$/);
  assert.equal(result.expiresAt, 1_000 + anonymousSessionLifetimeMs);
  assert.doesNotMatch(storage.getItem(anonymousSessionStorageKey), /Math\.random/);
});

test("produces unique identifiers across a large synthetic sample", () => {
  const ids = new Set();
  for (let index = 0; index < 4_096; index += 1) {
    const result = getOrCreateAnonymousSession(new MemoryStorage(), crypto, index);
    assert.equal(result.available, true);
    ids.add(result.sessionId);
  }
  assert.equal(ids.size, 4_096);
});

test("reuses a valid tab session, rotates after expiry and isolates tabs", () => {
  const firstTab = new MemoryStorage();
  const secondTab = new MemoryStorage();
  const first = getOrCreateAnonymousSession(firstTab, crypto, 5_000);
  const reused = getOrCreateAnonymousSession(firstTab, crypto, 5_001);
  const second = getOrCreateAnonymousSession(secondTab, crypto, 5_001);
  assert.equal(first.available && reused.available && first.sessionId, reused.available && reused.sessionId);
  assert.notEqual(first.available && first.sessionId, second.available && second.sessionId);
  const rotated = getOrCreateAnonymousSession(firstTab, crypto, 5_000 + anonymousSessionLifetimeMs + 1);
  assert.notEqual(first.available && first.sessionId, rotated.available && rotated.sessionId);
  assert.equal(rotated.available && rotated.rotated, true);
});

test("fails safely without secure randomness and clears local identity", () => {
  const storage = new MemoryStorage();
  const unavailable = getOrCreateAnonymousSession(storage, null, 1_000);
  assert.deepEqual(unavailable, { available: false, reason: "crypto_unavailable" });
  assert.equal(storage.getItem(anonymousSessionStorageKey), null);
  const created = getOrCreateAnonymousSession(storage, crypto, 1_000);
  assert.equal(created.available, true);
  assert.equal(clearAnonymousSession(storage), true);
  assert.equal(storage.getItem(anonymousSessionStorageKey), null);
});

test("derives a domain-separated anonymous subject hash without exposing the session identifier", async () => {
  const sessionId = "01".repeat(16);
  const hash = await deriveAnonymousSubjectHash(sessionId);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, sessionId);
  assert.equal(await deriveAnonymousSubjectHash("uppercase-ID"), null);
  assert.equal(await deriveAnonymousSubjectHash("0".repeat(31)), null);
});
