/*
 * Encrypted backups. Runs in the browser and in Node (scripts/backup-restore.mjs) with the built-in
 * Web Crypto API only; no imports, so both can load it as-is.
 *
 * Each backup gets a fresh random AES-256-GCM key (the "data key"). The data key is then locked twice:
 *   1. with a key derived from her recovery code (8 groups of 4 characters, made on her phone), and
 *   2. with the app owner's RSA public key; the matching private key never leaves the owner's computer.
 * Either one can open the backup. Google Drive, the server and anyone else see only ciphertext.
 *
 * The recovery code also names her backup folder (deviceId = a one-way hash of the code), so the
 * server can file her backups without ever learning the code.
 */

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const FORMAT = 'spendify-encrypted-backup';
export const VERSION = 1;

/* ---------- base64 / base32 ---------- */

export const toB64 = (bytes) => {
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Crockford base32: no I, L, O or U, so the code is easy to read aloud and copy by hand
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const toB32 = (bytes) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

const fromB32 = (s) => {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
};

/* ---------- recovery code ---------- */

const CODE_BYTES = 20; // 160 random bits → 32 characters
const CODE_CHARS = 32;

/** A new recovery code, like "7KQ2-M9XD-…" (8 groups of 4). */
export const newRecoveryCode = () => formatCode(toB32(globalThis.crypto.getRandomValues(new Uint8Array(CODE_BYTES))));

const formatCode = (raw) => raw.match(/.{1,4}/g).join('-');

/**
 * Tidies what she typed: spaces and dashes don't matter, nor does case, and the letters people
 * confuse with digits are read as digits (O → 0, I and L → 1). Null if it can't be a code.
 */
export const normalizeCode = (input) => {
  const raw = String(input || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (raw.length !== CODE_CHARS || !/^[0-9A-HJKMNP-TV-Z]+$/.test(raw)) return null;
  return formatCode(raw);
};

const codeBytes = (code) => {
  const norm = normalizeCode(code);
  if (!norm) throw new Error('bad-code');
  return fromB32(norm.replace(/-/g, '')).subarray(0, CODE_BYTES);
};

const sha256 = async (label, bytes) => new Uint8Array(await subtle().digest('SHA-256', new Uint8Array([...enc.encode(label), ...bytes])));

/** The folder name for her backups: a one-way hash of the code (32 hex characters). */
export const deviceIdFor = async (code) =>
  [...(await sha256('spendify-device:', codeBytes(code))).subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');

const codeKey = async (code) => subtle().importKey('raw', await sha256('spendify-key:', codeBytes(code)), 'AES-GCM', false, ['encrypt', 'decrypt']);

/* ---------- owner key (RSA-OAEP, SHA-256) ---------- */

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };

const pemBody = (pem) => fromB64(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));

/** The owner's public key, as base64 SPKI (what scripts/backup-setup.mjs prints) or PEM. */
export const importOwnerPublicKey = (spki) => subtle().importKey('spki', pemBody(spki), RSA, false, ['encrypt']);
export const importOwnerPrivateKey = (pkcs8Pem) => subtle().importKey('pkcs8', pemBody(pkcs8Pem), RSA, false, ['decrypt']);

/** A new owner key pair: { publicKey (base64 SPKI), privateKeyPem }. Used by the setup script. */
export const newOwnerKeyPair = async () => {
  const pair = await subtle().generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  const pub = toB64(await subtle().exportKey('spki', pair.publicKey));
  const priv = toB64(await subtle().exportKey('pkcs8', pair.privateKey));
  return { publicKey: pub, privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${priv.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n` };
};

/* ---------- compression (gzip when the platform has it) ---------- */

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/* ---------- encrypt / decrypt ---------- */

const aad = (deviceId) => enc.encode(`${FORMAT}:${VERSION}:${deviceId}`);

/**
 * Locks a backup (the JSON text from exportData). Returns the file's text: a small JSON envelope
 * holding only ciphertext, random IVs and the two locked copies of the data key.
 */
export const encryptBackup = async (json, { code, ownerPublicKey, createdAt = Date.now() }) => {
  const deviceId = await deviceIdFor(code);
  const gzip = canGzip();
  const plain = gzip ? await pipe(enc.encode(json), new CompressionStream('gzip')) : enc.encode(json);

  const dataKey = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(deviceId) }, dataKey, plain);
  const rawKey = new Uint8Array(await subtle().exportKey('raw', dataKey));

  const codeIv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const byCode = await subtle().encrypt({ name: 'AES-GCM', iv: codeIv, additionalData: aad(deviceId) }, await codeKey(code), rawKey);
  const keys = { code: { iv: toB64(codeIv), key: toB64(byCode) } };
  if (ownerPublicKey) {
    const pub = typeof ownerPublicKey === 'string' ? await importOwnerPublicKey(ownerPublicKey) : ownerPublicKey;
    keys.owner = { alg: 'RSA-OAEP-256', key: toB64(await subtle().encrypt(RSA, pub, rawKey)) };
  }
  rawKey.fill(0);

  return JSON.stringify({ format: FORMAT, v: VERSION, deviceId, createdAt, cipher: 'AES-256-GCM', gzip, iv: toB64(iv), keys, data: toB64(data) });
};

const parseEnvelope = (text) => {
  let e;
  try {
    e = JSON.parse(text);
  } catch {
    throw new Error('not-backup');
  }
  if (e?.format !== FORMAT || e.v !== VERSION || !e.iv || !e.data || !e.keys) throw new Error('not-backup');
  return e;
};

const openWith = async (e, rawKey) => {
  const dataKey = await subtle().importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  let plain;
  try {
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(e.iv), additionalData: aad(e.deviceId) }, dataKey, fromB64(e.data)));
  } catch {
    throw new Error('damaged'); // the key was right but the data was changed
  }
  return dec.decode(e.gzip ? await pipe(plain, new DecompressionStream('gzip')) : plain);
};

/** Opens a backup with her recovery code. Throws 'wrong-code' if the code doesn't fit. */
export const decryptWithCode = async (text, code) => {
  const e = parseEnvelope(text);
  let rawKey;
  try {
    rawKey = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(e.keys.code.iv), additionalData: aad(e.deviceId) }, await codeKey(code), fromB64(e.keys.code.key)));
  } catch {
    throw new Error('wrong-code');
  }
  return openWith(e, rawKey);
};

/** Opens a backup with the owner's private key (PEM). Throws 'wrong-key' if it isn't the matching key. */
export const decryptWithOwnerKey = async (text, privateKeyPem) => {
  const e = parseEnvelope(text);
  if (!e.keys.owner) throw new Error('no-owner-key');
  let rawKey;
  try {
    rawKey = new Uint8Array(await subtle().decrypt(RSA, await importOwnerPrivateKey(privateKeyPem), fromB64(e.keys.owner.key)));
  } catch {
    throw new Error('wrong-key');
  }
  return openWith(e, rawKey);
};
