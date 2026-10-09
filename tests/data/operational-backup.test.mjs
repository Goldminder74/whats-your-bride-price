import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthorityJournal, exportArchive, verifyArchive, restoreArchive, compactJournal, copyJournal, main } from "../../scripts/operational-backup.mjs";
import { setup, request, checkout, verified, adverse, Adapter } from "../helpers/cowrieCommerce.mjs";
import { operatorRetentionPlan, runApprovedRetention, assertRestoreReceipt } from "../../db/retention.ts";
import { D1QuestionSelectionRepository } from "../../db/questionSelection.ts";
import { completeCowrieQuickPlay } from "../../db/cowrieCompletion.ts";
import { deriveAnonymousSubjectHash } from "../../app/anonymousSession.ts";
const at = Date.now(), DAY = 86400000;
const review = (archive, journal, now = at) => ({ manifestHash: archive.sha256, schemaHash: archive.schemaHash, journalHead: journal.verify().head, financialReconciliation: true, holdsReconciled: true, caseAuthorityReconciled: true, reviewedThrough: now });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "wybp-operational-")), key = randomBytes(32), path = join(directory, "source.sqlite");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE records(id INTEGER PRIMARY KEY, payload TEXT NOT NULL, image BLOB); CREATE TABLE parent(id TEXT PRIMARY KEY) WITHOUT ROWID; CREATE TABLE child(id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id)); CREATE INDEX child_parent ON child(parent_id)");
  db.prepare("INSERT INTO parent VALUES(?)").run("synthetic"); db.prepare("INSERT INTO child VALUES(?,?)").run("child", "synthetic");
  const insert = db.prepare("INSERT INTO records VALUES(?,?,?)");
  for (let i = 0; i < 307; i++) insert.run(i, "synthetic-private-content-" + "x".repeat(1000), Buffer.from([i % 256, 0, 255]));
  db.close();
  const journal = await AuthorityJournal.connect(path, join(directory, "journal.sqlite"), key);
  return { directory, key, journal, archive: join(directory, "archive"), output: join(directory, "restored.sqlite"), async close() { this.journal.close(); await rm(directory, { recursive: true, force: true }); } };
}
test("complete encrypted exports exceed old limits, resume a fixed snapshot and replay newer authority exactly once", async () => {
  const c = await fixture();
  try {
    assert.equal((await exportArchive(c.journal, c.archive, c.key, { pageSize: 50, now: at, maxPages: 2 })).complete, false);
    await c.journal.execute("later", [{ sql: "INSERT INTO records VALUES(?,?,?)", params: [999, "new synthetic record", null] }], { action: "later" }, at);
    const archive = await exportArchive(c.journal, c.archive, c.key, { pageSize: 50, now: at });
    assert.equal(archive.manifest.tables.find(t => t.name === "records").count, 307);
    assert.ok(archive.pages > 6);
    assert.ok(!(await readFile(join(c.archive, archive.manifest.pages[2].name))).includes(Buffer.from("synthetic-private-content")));
    const approved = review(archive, c.journal);
    assert.equal((await restoreArchive(c.archive, c.output, c.journal, c.key, approved, { now: at, maxPages: 2 })).complete, false);
    await assert.rejects(access(c.output));
    assert.equal((await restoreArchive(c.archive, c.output, c.journal, c.key, approved, { now: at })).complete, true);
    const restored = new DatabaseSync(c.output);
    try { assert.equal(restored.prepare("SELECT COUNT(*) n FROM records").get().n, 308); assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []); assert.deepEqual(restored.prepare("SELECT image FROM records WHERE id=0").get().image, new Uint8Array([0, 0, 255])); }
    finally { restored.close(); }
    await assert.rejects(restoreArchive(c.archive, c.output, c.journal, c.key, approved, { now: at }), /never_overwrites/);
  } finally { await c.close(); }
});
test("archive corruption, missing pages, wrong key, expiry and unreviewed restore fail closed", async () => {
  const c = await fixture();
  try {
    const archive = await exportArchive(c.journal, c.archive, c.key, { now: at });
    await assert.rejects(verifyArchive(c.archive, randomBytes(32), at));
    await assert.rejects(verifyArchive(c.archive, c.key, at + 30 * DAY), /window/);
    await assert.rejects(restoreArchive(c.archive, c.output, c.journal, c.key, { ...review(archive, c.journal), financialReconciliation: false }, { now: at }), /review/);
    await assert.rejects(access(c.output));
    const page = join(c.archive, archive.manifest.pages[0].name), original = await readFile(page);
    await writeFile(page, original.subarray(0, original.length - 1)); await assert.rejects(verifyArchive(c.archive, c.key, at), /page_rejected/);
    await rm(page); await assert.rejects(verifyArchive(c.archive, c.key, at));
  } finally { await c.close(); }
});
test("database and encrypted journal roll back together; retries are inert, conflicting intents and missing history reject", async () => {
  const c = await fixture();
  try {
    const plan = [{ sql: "INSERT INTO records VALUES(?,?,?)", params: [999, "synthetic-private-journal", null] }], intent = { operation: "insert" };
    await assert.rejects(c.journal.execute("atomic", plan, intent, at, () => { throw new Error("synthetic interruption"); }));
    assert.equal(c.journal.verify().seq, 0); assert.equal(c.journal.database.prepare("SELECT COUNT(*) n FROM records").get().n, 307);
    await c.journal.execute("atomic", plan, intent, at); const head = c.journal.verify().head;
    await c.journal.execute("atomic", plan, intent, at); assert.equal(c.journal.verify().head, head);
    await assert.rejects(c.journal.execute("atomic", plan, { operation: "different" }, at), /conflict/);
    const body = c.journal.database.prepare("SELECT body FROM authority.events").get().body;
    assert.ok(!Buffer.from(body).includes(Buffer.from("synthetic-private-journal")));
    c.journal.database.exec("DELETE FROM authority.events"); assert.throws(() => c.journal.verify(head), /mismatch/);
  } finally { await c.close(); }
});
test("latest verified checkpoint safely retires old identifiable journal history; old restore anchors cannot cross it", async () => {
  const c = await fixture();
  try {
    const old = await exportArchive(c.journal, c.archive, c.key, { now: at });
    await c.journal.execute("new", [{ sql: "UPDATE records SET payload=? WHERE id=0", params: ["new synthetic state"] }], { operation: "new" }, at);
    await assert.rejects(compactJournal(c.journal, c.archive, c.key, old.sha256, at), /checkpoint/);
    const freshPath = join(c.directory, "fresh"), fresh = await exportArchive(c.journal, freshPath, c.key, { now: at });
    await compactJournal(c.journal, freshPath, c.key, fresh.sha256, at);
    assert.equal(c.journal.database.prepare("SELECT COUNT(*) n FROM authority.events").get().n, 0);
    await assert.rejects(restoreArchive(c.archive, c.output, c.journal, c.key, review(old, c.journal), { now: at }), /journal_gap/);
    assert.equal((await restoreArchive(freshPath, c.output, c.journal, c.key, review(fresh, c.journal), { now: at })).complete, true);
  } finally { await c.close(); }
});
test("real accounting restore replays holds, closure, settlement, suppression and minimisation without reviving ownership", async () => {
  const c = await setup(), directory = await mkdtemp(join(tmpdir(), "wybp-authority-finance-")), key = randomBytes(32); let journal;
  const proof = "a".repeat(64), now = Date.UTC(2026, 9, 9, 12);
  try {
    const started = await c.walletService.startQuickPlay({ region: "west", anonymousSessionCredential: "a".repeat(32), idempotencyKey: "local-restore-only" });
    const selected = await new D1QuestionSelectionRepository(c.adapter).getAttempt(started.selection.attemptId, await deriveAnonymousSubjectHash("a".repeat(32)), Date.UTC(2026, 8, 12, 12));
    await completeCowrieQuickPlay(c.adapter, { attemptId: started.selection.attemptId, anonymousSessionCredential: "a".repeat(32), idempotencyKey: "b".repeat(32), avatarId: "adjoa", answers: selected.selection.questions.map(q => ({ questionStableId: q.stableId, selectedOptionIds: q.acceptedAnswers[0] })) }, Date.UTC(2026, 8, 12, 12));
    const order = await c.service.startOrder(request(c)); await c.service.webhook(await verified("checkout.session.completed", checkout(order)));
    await c.walletService.clear({ anonymousSessionCredential: "a".repeat(32) }); await c.service.webhook(await verified("charge.refunded", adverse()));
    const wallet = c.database.prepare("SELECT id FROM cowrie_wallets").get().id, payment = c.database.prepare("SELECT id FROM commerce_orders").get().id, event = c.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type='charge.refunded'").get().id;
    const source = join(directory, "source.sqlite"); c.database.prepare("VACUUM INTO ?").run(source);
    journal = await AuthorityJournal.connect(source, join(directory, "journal.sqlite"), key);
    const archivePath = join(directory, "archive"), archive = await exportArchive(journal, archivePath, key, { now });
    const action = async (name, input, time = now) => journal.execute(name, operatorRetentionPlan(input, time), { input, time }, time);
    await action("settle", { operation: "settlement", orderId: payment, eventId: event, reason: "verified_refund" });
    await action("close", { operation: "close-wallet", walletId: wallet, evidenceHash: proof });
    await action("hold", { operation: "hold", id: "synthetic_hold", scope: "wallet", subjectId: wallet, reason: "legal", evidenceHash: proof });
    await action("erase_attempt", { operation: "erase", scope: "attempt", subjectId: started.selection.attemptId, evidenceHash: proof });
    await action("erase_result", { operation: "erase", scope: "result", subjectId: journal.database.prepare("SELECT id FROM results").get().id, evidenceHash: proof });
    const before = journal.database.prepare("SELECT id,delta,related_order_id,related_allocation_id FROM cowrie_ledger ORDER BY id").all();
    const path = join(directory, "restored.sqlite"); await restoreArchive(archivePath, path, journal, key, review(archive, journal, now), { now });
    const db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON");
    try {
      assert.equal(db.prepare("SELECT state,closed_at FROM cowrie_wallets").get().state, "deleted");
      assert.equal(db.prepare("SELECT closed_at FROM retention_closures").get().closed_at, now);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM retention_holds WHERE released_at IS NULL").get().n, 1);
      assert.equal(db.prepare("SELECT status FROM quiz_attempts").get().status, "deleted");
      assert.equal(db.prepare("SELECT state FROM results").get().state, "deleted");
      await assert.rejects(assertRestoreReceipt(new Adapter(db), proof));
      assert.throws(() => db.exec("UPDATE cowrie_wallets SET state='active'"), /cannot reopen/);
      await runApprovedRetention(new Adapter(db), now + 31 * DAY, 50);
      assert.equal(db.prepare("SELECT ownership_minimized_at FROM cowrie_wallets").get().ownership_minimized_at, null);
      assert.deepEqual(db.prepare("SELECT id,delta,related_order_id,related_allocation_id FROM cowrie_ledger ORDER BY id").all(), before);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
    const newerPath = join(directory, "day29"), newer = await exportArchive(journal, newerPath, key, { now: now + 29 * DAY });
    await action("release", { operation: "release-hold", id: "synthetic_hold" }, now + 31 * DAY);
    await runApprovedRetention(journal.adapter("minimise", { operation: "purge", now: now + 31 * DAY }, now + 31 * DAY), now + 31 * DAY);
    assert.equal(journal.database.prepare("SELECT anonymous_owner_hash FROM cowrie_wallets").get().anonymous_owner_hash, "0".repeat(64));
    const minimised = join(directory, "minimised.sqlite");
    await restoreArchive(newerPath, minimised, journal, key, review(newer, journal, now + 31 * DAY), { now: now + 31 * DAY });
    const after = new DatabaseSync(minimised);
    try { assert.equal(after.prepare("SELECT anonymous_owner_hash FROM cowrie_wallets").get().anonymous_owner_hash, "0".repeat(64)); assert.equal(after.prepare("SELECT closed_at FROM retention_closures").get().closed_at, now); assert.deepEqual(after.prepare("PRAGMA foreign_key_check").all(), []); }
    finally { after.close(); }
  } finally { journal?.close(); c.database.close(); await rm(directory, { recursive: true, force: true }); }
});
test("local operator rejects hosted arguments and unjournalled changes", async () => {
  await assert.rejects(main(["--remote"]), /local_only/);
  const c = await fixture();
  try { c.journal.database.exec("DELETE FROM records WHERE id=0"); assert.throws(() => c.journal.verify(), /unjournalled/); await assert.rejects(exportArchive(c.journal, c.archive, c.key, { now: at }), /unjournalled/); }
  finally { await c.close(); }
});
test("independent journal readback restores after complete source database loss", async () => {
  const c = await fixture();
  try {
    const archive = await exportArchive(c.journal, c.archive, c.key, { now: at });
    await c.journal.execute("new_after_backup", [{ sql: "UPDATE records SET payload=? WHERE id=0", params: ["independent synthetic authority"] }], { action: "new" }, at);
    const copy = join(c.directory, "independent-journal.sqlite"), receipt = await copyJournal(c.journal, copy);
    const approved = review(archive, c.journal);
    c.journal.close(); await rm(join(c.directory, "source.sqlite")); await rm(join(c.directory, "journal.sqlite"));
    c.journal = await AuthorityJournal.openHistory(copy, c.key);
    assert.equal(c.journal.verify(receipt.journalHead).head, approved.journalHead);
    await assert.rejects(c.journal.execute("forbidden", [], {}, at), /read_only/);
    await restoreArchive(c.archive, c.output, c.journal, c.key, approved, { now: at });
    const restored = new DatabaseSync(c.output);
    try { assert.equal(restored.prepare("SELECT payload FROM records WHERE id=0").get().payload, "independent synthetic authority"); }
    finally { restored.close(); }
  } finally { await c.close(); }
});
