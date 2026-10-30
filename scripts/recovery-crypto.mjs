import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
const json = value => Buffer.from(JSON.stringify(value));
const fail = message => { throw new Error(message); };
const ARCHIVE_LIMIT = 3500000, ARCHIVE_CODEC = 'gzip-json-v1';
function seal(value, key, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) fail("backup_key_required");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(json(value)), cipher.final()]);
  return json({ iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), body: body.toString("base64") });
}
function open(bytes, key, aad) {
  const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (value.codec !== undefined && value.codec !== ARCHIVE_CODEC) fail('backup_archive_codec');
  if (value.codec && (Buffer.byteLength(bytes) > 4700000 || typeof value.body !== 'string' || value.body.length > 4666700)) fail('backup_archive_bounds');
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "hex"));
  // Codec is authenticated: adding/removing it cannot reinterpret old ciphertext.
  decipher.setAAD(value.codec ? json([aad, ARCHIVE_CODEC]) : Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(value.tag, "hex"));
  const plain = Buffer.concat([decipher.update(Buffer.from(value.body, "base64")), decipher.final()]);
  return JSON.parse(value.codec ? gunzipSync(plain, { maxOutputLength: ARCHIVE_LIMIT }) : plain);
}

/** Only bounded immutable archive objects use compression. Authority intents,
 * confirmation records and caller progress retain their existing encoding.
 * Decompression follows successful GCM authentication and has a hard output cap.
 * Existing archives are read/reused unchanged, including original ciphertext hashes.
 */
export function encryptArchiveRecord(value, key, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) fail('backup_key_required');
  const plain = json(value);
  if (plain.length > ARCHIVE_LIMIT) fail('backup_archive_bounds');
  if (plain.length < 1024) return seal(value, key, aad);
  const packed = gzipSync(plain, { level: 1 });
  if (packed.length >= plain.length) return seal(value, key, aad);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(json([aad, ARCHIVE_CODEC]));
  const body = Buffer.concat([cipher.update(packed), cipher.final()]);
  return json({ codec: ARCHIVE_CODEC, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), body: body.toString('base64') });
}

export { seal as encryptRecord, open as decryptRecord };
export const recoveryHash = bytes => createHash('sha256').update(bytes).digest('hex');
