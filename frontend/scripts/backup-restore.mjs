#!/usr/bin/env node
/*
 * Opens one of her encrypted backups with YOUR private key.
 *
 *   node scripts/backup-restore.mjs <backup-YYYY-MM-DD.json> [private-key.pem]
 *
 * Download the file from your Google Drive ("Spendify backups" / <device id> /). The private key
 * defaults to ~/.spendify/backup-private-key.pem. Writes the readable backup next to the input as
 * restored-backup-YYYY-MM-DD.json: load it on her phone with Settings → Restore from file.
 * The restored file contains her data AND her recovery code, so send it to her privately and delete
 * your copy afterwards.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { decryptWithOwnerKey } from '../src/lib/vault.js';

const [file, keyPath = join(homedir(), '.spendify', 'backup-private-key.pem')] = process.argv.slice(2);
if (!file) {
  console.log('Usage: node scripts/backup-restore.mjs <backup-YYYY-MM-DD.json> [private-key.pem]');
  process.exit(1);
}

try {
  const json = await decryptWithOwnerKey(readFileSync(file, 'utf8'), readFileSync(keyPath, 'utf8'));
  const data = JSON.parse(json);
  const out = join(dirname(file), `restored-${basename(file)}`);
  writeFileSync(out, json, { mode: 0o600 });
  console.log(`Opened. ${data.expenses?.length ?? 0} expenses, ${data.debts?.length ?? 0} IOUs, ${Object.keys(data.receipts || {}).length} receipt photos.`);
  if (data.settings?.cloud?.code) console.log(`Her recovery code: ${data.settings.cloud.code}`);
  console.log(`Saved: ${out}`);
} catch (err) {
  const why = { 'wrong-key': 'this private key does not match the public key the app used', 'not-backup': 'this is not a Spendify encrypted backup', damaged: 'the file was changed or is incomplete', 'no-owner-key': 'this backup was made without your public key' }[err.message];
  console.error(`Could not open it: ${why || err.message}`);
  process.exit(1);
}
