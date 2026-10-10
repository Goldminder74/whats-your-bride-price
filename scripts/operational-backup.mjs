import { DatabaseSync } from "node:sqlite";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, rename, unlink, realpath } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { operatorRetentionPlan, runApprovedRetention } from "../db/retention.ts";

const DAY = 86400000;
const ZERO = "0".repeat(64);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => Buffer.from(JSON.stringify(value));
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const fail = message => { throw new Error(message); };
const cell = value => typeof value === "bigint" ? ["integer", String(value)]
  : value instanceof Uint8Array ? ["blob", Buffer.from(value).toString("base64")]
    : ["value", value];
const uncell = ([type, value]) => type === "integer" ? BigInt(value) : type === "blob" ? Buffer.from(value, "base64") : value;
const rows = (db, sql, params = []) => { const s = db.prepare(sql); s.setReadBigInts(true); return s.all(...params).map(row => Object.values(row).map(cell)); };
function seal(value, key, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) fail("backup_key_required");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(json(value)), cipher.final()]);
  return json({ iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), body: body.toString("base64") });
}
function open(bytes, key, aad) {
  const value = JSON.parse(Buffer.from(bytes).toString("utf8")), decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "hex"));
  decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(Buffer.from(value.tag, "hex"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.body, "base64")), decipher.final()]));
}
async function exists(path) { try { await realpath(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function atomic(path, bytes) {
  const temp = path + ".writing";
  await writeFile(temp, bytes, { mode: 0o600 }); await rename(temp, path);
}
/** Private files only: never allow source, ciphertext, keys or working databases into Git. */
export async function privatePath(path) {
  const absolute = resolve(path), roots = [resolve(tmpdir()), resolve("outputs/retention-authority")];
  if (!roots.some(root => { const r = relative(root, absolute); return r && !r.startsWith("..") && !r.includes(":"); })) fail("private_directory_required");
  await mkdir(resolve(absolute, ".."), { recursive: true });
  const parent = await realpath(resolve(absolute, ".."));
  if (!roots.some(root => { const r = relative(root, parent); return !r.startsWith("..") && !r.includes(":"); })) fail("private_symlink_rejected");
  if (await exists(absolute)) {
    const target = await realpath(absolute);
    if (!roots.some(root => { const r = relative(root, target); return r && !r.startsWith("..") && !r.includes(":"); })) fail("private_symlink_rejected");
  }
  return absolute;
}
function inventory(db) {
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row => ({ ...row }));
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all().map(({ name }) => {
    const info = db.prepare(`PRAGMA table_info(${quote(name)})`).all();
    const without = db.prepare("SELECT wr FROM pragma_table_list WHERE name=? AND schema='main'").get(name).wr;
    const order = without ? info.filter(x => x.pk).sort((a, b) => a.pk - b.pk).map(x => quote(x.name)).join(",") : "rowid";
    return { name, columns: info.map(x => x.name), order, count: db.prepare(`SELECT COUNT(*) n FROM ${quote(name)}`).get().n };
  });
  return { schema, tables };
}
function contentHash(db) {
  const info = inventory(db), h = createHash("sha256"); h.update(json(info.schema));
  for (const t of info.tables) {
    h.update(json(t));
    for (let offset = 0; offset < t.count; offset += 100) h.update(json(rows(db, `SELECT * FROM ${quote(t.name)} ORDER BY ${t.order} LIMIT 100 OFFSET ?`, [offset])));
  }
  return h.digest("hex");
}

/** SQLite DELETE/FULL super-journal makes main + attached encrypted event commit atomic.
 * Local/offline only; this is NOT an atomic D1/external-storage journal adapter. */
export class AuthorityJournal {
  static async openHistory(journalPath, key) {
    const path = await privatePath(journalPath);
    if (!await exists(path)) fail("independent_journal_required");
    const db = new DatabaseSync(path, { readOnly: true });
    const journal = new AuthorityJournal({ prepare: sql => db.prepare(sql.replaceAll("authority.", "")), close: () => db.close() }, key);
    journal.readOnly = true;
    try { journal.verify(); return journal; } catch (error) { db.close(); throw error; }
  }
  static async connect(databasePath, journalPath, key) {
    const source = await privatePath(databasePath), sidecar = await privatePath(journalPath);
    if (!await exists(source) || source === sidecar) fail("existing_local_source_required");
    const db = new DatabaseSync(source); db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL");
    try {
      db.prepare("ATTACH DATABASE ? AS authority").run(sidecar);
      db.exec("PRAGMA authority.journal_mode=DELETE; PRAGMA authority.synchronous=FULL; CREATE TABLE IF NOT EXISTS authority.events(seq INTEGER PRIMARY KEY,operation TEXT UNIQUE NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL,body BLOB NOT NULL); CREATE TABLE IF NOT EXISTS authority.base(id INTEGER PRIMARY KEY CHECK(id=1),body BLOB NOT NULL)");
      const journal = new AuthorityJournal(db, key);
      if (!db.prepare("SELECT 1 FROM authority.base").get()) db.prepare("INSERT INTO authority.base VALUES(1,?)").run(seal({ digest: contentHash(db), createdAt: Date.now() }, key, "base"));
      journal.verify(); return journal;
    } catch (error) { db.close(); throw error; }
  }
  constructor(database, key) { this.database = database; this.key = key; }
  close() { this.database.close(); }
  verify(expectedHead) {
    const base = open(this.database.prepare("SELECT body FROM authority.base WHERE id=1").get().body, this.key, "base");
    let previous = base.head || ZERO, seq = base.seq || 0, last = base.digest;
    for (const row of this.database.prepare("SELECT * FROM authority.events ORDER BY seq").iterate()) {
      if (row.seq !== ++seq || row.previous_hash !== previous || row.hash !== digest(Buffer.concat([Buffer.from(previous), row.body]))) fail("journal_chain_rejected");
      const event = open(row.body, this.key, String(seq));
      if (event.before !== last) fail("journal_state_gap");
      last = event.after; previous = row.hash;
    }
    if (expectedHead !== undefined && previous !== expectedHead) fail("journal_head_mismatch");
    if (!this.readOnly && contentHash(this.database) !== last) fail("unjournalled_database_change");
    return { head: previous, seq, content: last, createdAt: base.createdAt, firstSequence: base.seq || 0 };
  }
  async execute(operation, statements, intent, now = Date.now(), fault) {
    if (this.readOnly) fail("read_only_journal");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(operation) || !Number.isSafeInteger(now)) fail("journal_operation_required");
    const intentHash = digest(json(intent)), prior = this.database.prepare("SELECT seq,body FROM authority.events WHERE operation=?").get(operation);
    if (prior) { const event = open(prior.body, this.key, String(prior.seq)); if (event.intent !== intentHash) fail("journal_operation_conflict"); this.verify(); return event.results; }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const before = this.verify(), results = [];
      for (const s of statements) {
        const query = this.database.prepare(s.sql);
        results.push(/^\s*(SELECT|WITH)\b/i.test(s.sql) ? { success: true, results: query.all(...s.params), meta: { changes: 0 } }
          : { success: true, results: [], meta: { changes: Number(query.run(...s.params).changes) } });
      }
      const after = contentHash(this.database), seq = before.seq + 1;
      const body = seal({ intent: intentHash, at: now, before: before.content, after, statements: statements.map(s => ({ sql: s.sql, params: s.params.map(cell) })), results }, this.key, String(seq));
      const hash = digest(Buffer.concat([Buffer.from(before.head), body]));
      this.database.prepare("INSERT INTO authority.events VALUES(?,?,?,?,?)").run(seq, operation, before.head, hash, body);
      fault?.(); this.database.exec("COMMIT"); return results;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  adapter(operation, intent, now) {
    let batches = 0; const database = this.database, execute = this.execute.bind(this);
    return { prepare(sql) { return { sql, params: [], bind(...params) { return { ...this, params }; },
      async all() { return { results: database.prepare(sql).all(...this.params) }; },
      async first(column) { const row = database.prepare(sql).get(...this.params); return row ? column ? row[column] : row : null; } }; },
    async batch(statements) { return execute(`${operation}_${batches++}`, statements, intent, now); } };
  }
}

/** Fixed offline snapshot: OFFSET pagination is safe because this copy never changes. */
export async function exportArchive(journal, directory, key, { pageSize = 100, now = Date.now(), maxPages = Infinity } = {}) {
  if (journal.readOnly) fail("source_database_required_for_export");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) fail("invalid_page_size");
  directory = await privatePath(directory); await mkdir(directory, { recursive: true });
  const snapshot = join(directory, "working.sqlite"), statePath = join(directory, "checkpoint.enc");
  let state;
  if (await exists(statePath)) state = open(await readFile(statePath), key, "checkpoint");
  else {
    if (await exists(snapshot)) await unlink(snapshot); // Only our uncheckpointed local working copy.
    const base = journal.verify(); journal.database.prepare("VACUUM main INTO ?").run(snapshot);
    const copy = new DatabaseSync(snapshot, { readOnly: true });
    try { if (contentHash(copy) !== base.content) fail("snapshot_changed_during_capture"); state = { version: 1, capturedAt: now, base, ...inventory(copy), pageSize, pages: [] }; }
    finally { copy.close(); }
    await atomic(statePath, seal(state, key, "checkpoint"));
  }
  if (state.pageSize !== pageSize || now < state.capturedAt || now - state.capturedAt >= 30 * DAY) fail("snapshot_window_rejected");
  if (await exists(join(directory, "manifest.enc"))) return verifyArchive(directory, key, now);
  const db = new DatabaseSync(snapshot, { readOnly: true }); let written = 0;
  try {
    if (contentHash(db) !== state.base.content) fail("working_snapshot_changed");
    for (let table = 0; table < state.tables.length; table++) {
      const t = state.tables[table];
      for (let offset = 0; offset < t.count; offset += pageSize) {
        const name = `page-${table}-${offset}.enc`, prior = state.pages.find(p => p.name === name);
        if (prior) { if (digest(await readFile(join(directory, name))) !== prior.sha256) fail("export_page_changed"); continue; }
        if (written++ >= maxPages) return { complete: false, pages: state.pages.length };
        const data = rows(db, `SELECT * FROM ${quote(t.name)} ORDER BY ${t.order} LIMIT ? OFFSET ?`, [pageSize, offset]);
        if (data.length !== Math.min(pageSize, t.count - offset)) fail("export_count_changed");
        const bytes = seal(data, key, name); await atomic(join(directory, name), bytes);
        state.pages.push({ name, table, offset, count: data.length, sha256: digest(bytes) });
        await atomic(statePath, seal(state, key, "checkpoint"));
      }
    }
    await atomic(join(directory, "manifest.enc"), seal(state, key, "manifest"));
  } finally { db.close(); }
  await unlink(snapshot); return verifyArchive(directory, key, now);
}
export async function verifyArchive(directory, key, now = Date.now()) {
  const bytes = await readFile(join(directory, "manifest.enc")), manifest = open(bytes, key, "manifest");
  if (manifest.version !== 1 || !Number.isSafeInteger(manifest.capturedAt) || now < manifest.capturedAt || now - manifest.capturedAt >= 30 * DAY) fail("archive_window_rejected");
  if (!Number.isInteger(manifest.pageSize) || manifest.pageSize < 1 || manifest.pageSize > 100
    || !Array.isArray(manifest.tables) || !Array.isArray(manifest.pages)
    || new Set(manifest.tables.map(t => t.name)).size !== manifest.tables.length
    || manifest.tables.some(t => !Number.isSafeInteger(t.count) || t.count < 0 || !Array.isArray(t.columns))) fail("archive_inventory_rejected");
  let pages = 0;
  for (let table = 0; table < manifest.tables.length; table++) {
    const t = manifest.tables[table];
    for (let offset = 0; offset < t.count; offset += manifest.pageSize) {
      const name = `page-${table}-${offset}.enc`, matches = manifest.pages.filter(p => p.name === name && p.table === table && p.offset === offset);
      if (matches.length !== 1) fail("archive_page_gap");
      const p = matches[0], data = await readFile(join(directory, name));
      if (digest(data) !== p.sha256 || p.count !== Math.min(manifest.pageSize, t.count - offset)) fail("archive_page_rejected");
      const decoded = open(data, key, name);
      if (decoded.length !== p.count || decoded.some(row => row.length !== t.columns.length)) fail("archive_row_rejected");
      pages++;
    }
  }
  if (pages !== manifest.pages.length) fail("archive_extra_pages");
  return { complete: true, pages, sha256: digest(bytes), schemaHash: digest(json(manifest.schema)), manifest };
}

export async function restoreArchive(directory, destination, journal, key, review, { now = Date.now(), maxPages = Infinity } = {}) {
  const checked = await verifyArchive(directory, key, now), m = checked.manifest, head = journal.verify(review.journalHead);
  if (review.manifestHash !== checked.sha256 || review.schemaHash !== checked.schemaHash
    || review.financialReconciliation !== true || review.holdsReconciled !== true || review.caseAuthorityReconciled !== true
    || !Number.isSafeInteger(review.reviewedThrough) || review.reviewedThrough > now || now - review.reviewedThrough > 900000) fail("independent_restore_review_required");
  const base = open(journal.database.prepare("SELECT body FROM authority.base WHERE id=1").get().body, key, "base");
  const anchor = m.base.seq === head.firstSequence ? (base.head || ZERO)
    : journal.database.prepare("SELECT hash FROM authority.events WHERE seq=?").get(m.base.seq)?.hash;
  if (m.base.seq < head.firstSequence || m.base.seq > head.seq || anchor !== m.base.head) fail("restore_journal_gap");
  destination = await privatePath(destination); if (await exists(destination)) fail("restore_never_overwrites_destination");
  const staging = destination + ".restoring", progress = destination + ".progress";
  const db = new DatabaseSync(staging); let applied = 0;
  try {
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=OFF");
    db.prepare("ATTACH DATABASE ? AS progress").run(progress);
    db.exec("PRAGMA progress.journal_mode=DELETE; PRAGMA progress.synchronous=FULL; CREATE TABLE IF NOT EXISTS progress.pages(name TEXT PRIMARY KEY,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS progress.meta(id INTEGER PRIMARY KEY,manifest TEXT NOT NULL,finished_head TEXT,finished_content TEXT)");
    const meta = db.prepare("SELECT manifest FROM progress.meta").get();
    if (meta && meta.manifest !== checked.sha256) fail("restore_checkpoint_conflict");
    if (!meta) {
      if (db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().n) fail("unknown_restore_working_copy");
      db.exec("BEGIN IMMEDIATE");
      try { for (const s of m.schema.filter(s => s.type === "table")) db.exec(s.sql); db.prepare("INSERT INTO progress.meta(id,manifest) VALUES(1,?)").run(checked.sha256); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    }
    for (const p of m.pages) {
      const prior = db.prepare("SELECT hash FROM progress.pages WHERE name=?").get(p.name);
      if (prior) { if (prior.hash !== p.sha256) fail("restore_page_conflict"); continue; }
      if (applied++ >= maxPages) return { complete: false };
      const t = m.tables[p.table], data = open(await readFile(join(directory, p.name)), key, p.name);
      db.exec("BEGIN IMMEDIATE");
      try {
        if (t.name === "sqlite_sequence" && p.offset === 0) db.exec("DELETE FROM sqlite_sequence");
        const s = db.prepare(`INSERT INTO ${quote(t.name)}(${t.columns.map(quote).join(",")}) VALUES(${t.columns.map(() => "?").join(",")})`);
        for (const row of data) s.run(...row.map(uncell));
        db.prepare("INSERT INTO progress.pages VALUES(?,?)").run(p.name, p.sha256); db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
    // No externally usable database exists before all pages and authority are verified.
    for (const s of m.schema.filter(s => s.type !== "table")) if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(s.name)) db.exec(s.sql);
    const finished = db.prepare("SELECT finished_head,finished_content FROM progress.meta WHERE id=1").get();
    if (finished.finished_head) {
      if (finished.finished_head !== head.head || contentHash(db) !== finished.finished_content
        || db.prepare("PRAGMA foreign_key_check").all().length) fail("restore_finished_head_changed");
    } else {
    if (contentHash(db) !== m.base.content) fail("restored_content_mismatch");
    db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
    try {
      let current = m.base.content;
      for (const row of journal.database.prepare("SELECT * FROM authority.events WHERE seq>? ORDER BY seq").iterate(m.base.seq)) {
        const event = open(row.body, key, String(row.seq));
        if (event.before !== current) fail("restore_event_gap");
        for (const s of event.statements) { const query = db.prepare(s.sql); if (/^\s*(SELECT|WITH)\b/i.test(s.sql)) query.all(...s.params.map(uncell)); else query.run(...s.params.map(uncell)); }
        current = contentHash(db); if (current !== event.after) fail("restore_authority_conflict");
      }
      if (current !== head.content || db.prepare("PRAGMA foreign_key_check").all().length) fail("restore_dependencies_rejected");
      // A separate fresh runtime receipt is required after operator review; restored receipts never reopen access.
      if (m.tables.some(t => t.name === "retention_restore")) db.exec("DELETE FROM retention_restore");
      db.prepare("UPDATE progress.meta SET finished_head=?,finished_content=? WHERE id=1").run(head.head, contentHash(db));
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
  } finally { db.close(); }
  await rename(staging, destination); await unlink(progress);
  return { complete: true, manifestHash: checked.sha256, journalHead: head.head, runtimeAccess: "blocked_pending_fresh_receipt" };
}

/** Rotate only after a complete independently checked current archive anchors the chain.
 * Older archives then fail closed, rather than restoring across discarded authority. */
export async function compactJournal(journal, directory, key, expectedManifestHash, now = Date.now()) {
  if (journal.readOnly) fail("read_only_journal");
  const archive = await verifyArchive(directory, key, now), head = journal.verify();
  if (archive.sha256 !== expectedManifestHash || archive.manifest.base.head !== head.head
    || archive.manifest.base.content !== head.content) fail("current_checkpoint_required");
  journal.database.exec("BEGIN IMMEDIATE");
  try {
    journal.database.prepare("UPDATE authority.base SET body=? WHERE id=1").run(seal({ digest: head.content, createdAt: now, seq: head.seq, head: head.head }, key, "base"));
    journal.database.exec("DELETE FROM authority.events; COMMIT");
  } catch (error) { journal.database.exec("ROLLBACK"); throw error; }
  return { head: journal.verify().head, retiredHistory: true };
}

export async function copyJournal(journal, destination) {
  if (journal.readOnly) fail("active_journal_required");
  destination = await privatePath(destination);
  if (await exists(destination)) fail("journal_copy_never_overwrites");
  const expected = journal.verify();
  journal.database.prepare("VACUUM authority INTO ?").run(destination);
  const copied = await AuthorityJournal.openHistory(destination, journal.key);
  try { copied.verify(expected.head); return { journalHead: expected.head, sha256: digest(await readFile(destination)) }; }
  finally { copied.close(); }
}

export async function main(args = process.argv.slice(2)) {
  const value = name => args[args.indexOf(name) + 1];
  if (!args.includes("--local") || args.some(a => ["--remote", "--token"].includes(a))) fail("local_only_operation");
  const key = await readFile(await privatePath(value("--key-file")));
  const journal = args.includes("--restore") ? await AuthorityJournal.openHistory(value("--journal"), key)
    : await AuthorityJournal.connect(value("--database"), value("--journal"), key);
  try {
    if (args.includes("--export")) { const result = await exportArchive(journal, value("--export"), key); return { complete: result.complete, pages: result.pages, manifestHash: result.sha256, schemaHash: result.schemaHash, journalHead: journal.verify().head }; }
    if (args.includes("--compact")) return compactJournal(journal, value("--compact"), key, value("--approve-manifest"));
    if (args.includes("--journal-export")) return copyJournal(journal, value("--journal-export"));
    if (args.includes("--restore")) return restoreArchive(value("--restore"), value("--destination"), journal, key, JSON.parse(await readFile(await privatePath(value("--review")), "utf8")));
    if (!args.includes("--operation-id")) fail("stable_operation_id_required");
    if (args.includes("--action")) { const bytes = await readFile(await privatePath(value("--action"))); if (bytes.length > 65536) fail("action_too_large"); const action = JSON.parse(bytes), now = Number(value("--at")); await journal.execute(value("--operation-id"), operatorRetentionPlan(action, now), { action, now }, now); }
    else if (args.includes("--purge")) { const now = Number(value("--at")); await runApprovedRetention(journal.adapter(value("--operation-id"), { operation: "purge", now }, now), now); }
    else fail("operation_required");
    return { complete: true, journalHead: journal.verify().head };
  } finally { journal.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().then(result => console.log(JSON.stringify(result))).catch(() => { console.error("Local operational recovery rejected. No record contents or credentials logged."); process.exitCode = 1; });

// Reused by the provider operator; callers must retain private-path and custody gates.
export { seal as encryptRecord, open as decryptRecord, digest as recoveryHash };
