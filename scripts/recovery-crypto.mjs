import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const json = value => Buffer.from(JSON.stringify(value));
const fail = message => { throw new Error(message); };
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

export { seal as encryptRecord, open as decryptRecord };
export const recoveryHash = bytes => createHash('sha256').update(bytes).digest('hex');
