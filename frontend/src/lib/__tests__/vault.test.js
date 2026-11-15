import { describe, expect, it } from 'vitest';
import { decryptWithCode, decryptWithOwnerKey, deviceIdFor, encryptBackup, newOwnerKeyPair, newRecoveryCode, normalizeCode } from '../vault';

const owner = await newOwnerKeyPair();
const backup = JSON.stringify({ expenses: [{ note: 'Kopi rahasia', amount: 25000 }], debts: [{ person: 'Budi' }], receipts: { r1: 'data:image/jpeg;base64,AAAA' } });

describe('recovery code', () => {
  it('is 8 groups of 4 easy characters, different every time', () => {
    const a = newRecoveryCode();
    expect(a).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(newRecoveryCode()).not.toBe(a);
  });

  it('forgives spaces, case and look-alike letters', () => {
    const code = '7KQ2-M9XD-0A1B-CDEF-GHJK-MNPQ-RSTV-WXYZ';
    expect(normalizeCode('7kq2 m9xd oaib cdef ghjk mnpq rstv wxyz')).toBe(code);
    expect(normalizeCode('7KQ2M9XD0A1BCDEFGHJKMNPQRSTVWXYZ')).toBe(code);
    expect(normalizeCode('too short')).toBeNull();
    expect(normalizeCode('7KQ2-M9XD-0A1B-CDEF-GHJK-MNPQ-RSTV-WXY!')).toBeNull();
  });

  it('names the backup folder without revealing the code', async () => {
    const code = newRecoveryCode();
    const id = await deviceIdFor(code);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await deviceIdFor(code.toLowerCase().replace(/-/g, ' '))).toBe(id);
    expect(await deviceIdFor(newRecoveryCode())).not.toBe(id);
  });
});

describe('encrypted backups', () => {
  it('hide everything: no names, notes or amounts in the file', async () => {
    const code = newRecoveryCode();
    const file = await encryptBackup(backup, { code, ownerPublicKey: owner.publicKey });
    expect(file).not.toMatch(/Kopi|rahasia|Budi|25000|image\/jpeg/);
    expect(JSON.parse(file)).toMatchObject({ format: 'spendify-encrypted-backup', v: 1, cipher: 'AES-256-GCM', deviceId: await deviceIdFor(code) });
  });

  it('open with her code, or with the owner key', async () => {
    const code = newRecoveryCode();
    const file = await encryptBackup(backup, { code, ownerPublicKey: owner.publicKey });
    expect(await decryptWithCode(file, code)).toBe(backup);
    expect(await decryptWithCode(file, code.toLowerCase())).toBe(backup);
    expect(await decryptWithOwnerKey(file, owner.privateKeyPem)).toBe(backup);
  });

  it('refuse a wrong code, a wrong key, and tampered data', async () => {
    const code = newRecoveryCode();
    const file = await encryptBackup(backup, { code, ownerPublicKey: owner.publicKey });
    await expect(decryptWithCode(file, newRecoveryCode())).rejects.toThrow('wrong-code');
    const other = await newOwnerKeyPair();
    await expect(decryptWithOwnerKey(file, other.privateKeyPem)).rejects.toThrow('wrong-key');

    const e = JSON.parse(file);
    const bytes = Uint8Array.from(atob(e.data), (c) => c.charCodeAt(0));
    bytes[10] ^= 1;
    const tampered = JSON.stringify({ ...e, data: btoa(String.fromCharCode(...bytes)) });
    await expect(decryptWithCode(tampered, code)).rejects.toThrow('damaged');
    // Moving a backup to someone else's folder breaks it too
    await expect(decryptWithCode(JSON.stringify({ ...e, deviceId: 'f'.repeat(32) }), code)).rejects.toThrow();
    await expect(decryptWithCode('{"hello":1}', code)).rejects.toThrow('not-backup');
  });

  it('use a fresh key and IV every time, so two backups of the same data differ', async () => {
    const code = newRecoveryCode();
    const a = JSON.parse(await encryptBackup(backup, { code, ownerPublicKey: owner.publicKey }));
    const b = JSON.parse(await encryptBackup(backup, { code, ownerPublicKey: owner.publicKey }));
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
    expect(a.keys.owner.key).not.toBe(b.keys.owner.key);
  });

  it('still works without an owner key (code only)', async () => {
    const code = newRecoveryCode();
    const file = await encryptBackup(backup, { code });
    expect(JSON.parse(file).keys.owner).toBeUndefined();
    expect(await decryptWithCode(file, code)).toBe(backup);
    await expect(decryptWithOwnerKey(file, owner.privateKeyPem)).rejects.toThrow('no-owner-key');
  });
});
