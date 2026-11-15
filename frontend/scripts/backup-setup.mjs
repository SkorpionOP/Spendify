#!/usr/bin/env node
/*
 * One-time setup for automatic encrypted backups to YOUR Google Drive. Run from the frontend folder.
 *
 *   node scripts/backup-setup.mjs keys
 *     Makes your key pair. The private key is saved OUTSIDE the project, in ~/.spendify/ (never commit
 *     it, never put it on Vercel). Prints the public key for VITE_BACKUP_PUBLIC_KEY.
 *
 *   node scripts/backup-setup.mjs token
 *     Signs you in to Google once and prints the refresh token for GOOGLE_REFRESH_TOKEN.
 *     Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local, and this redirect URI added to the
 *     OAuth client in Google Cloud Console: http://localhost:53682/callback
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { newOwnerKeyPair } from '../src/lib/vault.js';

const DIR = join(homedir(), '.spendify');
const KEY_FILE = join(DIR, 'backup-private-key.pem');
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;

const env = () => {
  const out = { ...process.env };
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[2] && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
};

async function keys() {
  if (existsSync(KEY_FILE)) {
    console.error(`A private key already exists at ${KEY_FILE}.`);
    console.error('Not replacing it: backups made with its public key could never be opened by you again.');
    console.error('If you really want a new pair, move that file somewhere safe first.');
    process.exit(1);
  }
  const { publicKey, privateKeyPem } = await newOwnerKeyPair();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(KEY_FILE, privateKeyPem, { mode: 0o600 });
  console.log(`\nPrivate key saved to: ${KEY_FILE}`);
  console.log('Keep a second copy somewhere safe (a password manager or a USB stick).');
  console.log('If you lose it, only her recovery code can open her backups.\n');
  console.log('Add this to Vercel (Settings → Environment Variables) and to .env.local, then redeploy:\n');
  console.log(`VITE_BACKUP_PUBLIC_KEY=${publicKey}\n`);
}

async function token() {
  const e = env();
  const id = e.GOOGLE_CLIENT_ID;
  const secret = e.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    console.error('Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first (from Google Cloud Console → Credentials).');
    process.exit(1);
  }
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: id,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
  })}`;

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, REDIRECT);
      if (u.pathname !== '/callback') return res.writeHead(404).end();
      const got = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(got ? '<h2>Done. You can close this tab and go back to the terminal.</h2>' : `<h2>Google said: ${err || 'no code'}</h2>`);
      server.close();
      got ? resolve(got) : reject(new Error(err || 'no code'));
    });
    server.listen(PORT, '127.0.0.1', () => {
      console.log('\nOpening Google sign-in. Sign in with the Google account whose Drive should hold the backups.');
      console.log(`If no browser opens, visit:\n${url}\n`);
      const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
      exec(opener, () => {});
    });
  });

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  });
  const j = await r.json();
  if (!j.refresh_token) {
    console.error('Google did not return a refresh token:', j.error_description || j.error || JSON.stringify(j));
    process.exit(1);
  }
  console.log('\nAdd this to Vercel (Settings → Environment Variables) and to .env.local. Treat it like a password:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${j.refresh_token}\n`);
  console.log('Important: in Google Cloud Console → OAuth consent screen, set the app to "In production".');
  console.log('While it is in "Testing", Google expires this token after 7 days and backups stop.\n');
}

const cmd = process.argv[2];
if (cmd === 'keys') await keys();
else if (cmd === 'token') await token();
else {
  console.log('Usage:\n  node scripts/backup-setup.mjs keys    make your key pair\n  node scripts/backup-setup.mjs token   get the Google refresh token');
  process.exit(cmd ? 1 : 0);
}
