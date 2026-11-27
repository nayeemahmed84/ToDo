#!/usr/bin/env node
/**
 * Automatically enables all required free-tier Firebase & Google Cloud APIs
 * before `firebase deploy` runs (via firebase.json `predeploy`).
 *
 * Uses `gcloud services enable` when Google Cloud CLI is installed & signed in.
 * If `gcloud` is unavailable or unauthenticated, prints direct 1-click Console
 * links and exits 0 so `firebase deploy` is never blocked (pass --strict to fail).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REQUIRED_APIS = [
  { id: 'firestore.googleapis.com', label: 'Cloud Firestore' },
  { id: 'identitytoolkit.googleapis.com', label: 'Firebase Authentication' },
  { id: 'firebasehosting.googleapis.com', label: 'Firebase Hosting' },
  { id: 'fcm.googleapis.com', label: 'Firebase Cloud Messaging (Push)' },
  { id: 'firebaseinstallations.googleapis.com', label: 'Firebase Installations' },
  { id: 'drive.googleapis.com', label: 'Google Drive API (Attachments & Backups)' },
  { id: 'photospicker.googleapis.com', label: 'Google Photos Picker API (Backgrounds)' },
];

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const projectFlag = args.find((a) => a.startsWith('--project='))?.slice('--project='.length);

function resolveProjectId() {
  if (projectFlag) return projectFlag.trim();
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT.trim();
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID.trim();

  const firebasercPath = resolve(process.cwd(), '.firebaserc');
  if (existsSync(firebasercPath)) {
    try {
      const parsed = JSON.parse(readFileSync(firebasercPath, 'utf8'));
      const def = parsed?.projects?.default;
      if (typeof def === 'string' && def.trim()) return def.trim();
    } catch {
      // ignore malformed .firebaserc
    }
  }

  const envLocalPath = resolve(process.cwd(), '.env.local');
  if (existsSync(envLocalPath)) {
    try {
      const content = readFileSync(envLocalPath, 'utf8');
      const match = content.match(/^VITE_FIREBASE_PROJECT_ID=(.+)$/m);
      if (match?.[1]) {
        const val = match[1].trim().replace(/^["']|["']$/g, '');
        if (val && !val.includes('PASTE_YOUR')) return val;
      }
    } catch {
      // ignore read error
    }
  }

  return null;
}

function printManualLinks(projectId) {
  console.log('\nEnable any remaining APIs with 1 click in Google Cloud Console:');
  for (const api of REQUIRED_APIS) {
    console.log(
      `  • ${api.label}: https://console.cloud.google.com/apis/library/${api.id}?project=${encodeURIComponent(projectId)}`
    );
  }
  console.log('');
}

const projectId = resolveProjectId();
if (!projectId) {
  console.warn('[enable-apis] Could not detect Firebase project ID (.firebaserc or .env.local). Skipping API check.');
  process.exit(strict ? 1 : 0);
}

console.log(`[enable-apis] Ensuring required free-tier APIs are enabled for project "${projectId}"...`);

const isWin = process.platform === 'win32';
const checkGcloud = spawnSync('gcloud', ['--version'], {
  shell: isWin,
  stdio: 'ignore',
});

if (checkGcloud.status !== 0) {
  console.warn(
    '[enable-apis] Google Cloud CLI (`gcloud`) is not installed — skipping automatic API activation.'
  );
  console.warn(
    '[enable-apis] Install `gcloud` (https://cloud.google.com/sdk/docs/install) and run `gcloud auth login` to enable APIs automatically on deploy.'
  );
  printManualLinks(projectId);
  process.exit(strict ? 1 : 0);
}

const enableArgs = [
  'services',
  'enable',
  ...REQUIRED_APIS.map((a) => a.id),
  `--project=${projectId}`,
];

const res = spawnSync('gcloud', enableArgs, {
  shell: isWin,
  encoding: 'utf8',
  stdio: 'pipe',
});

if (res.status === 0) {
  console.log(`[enable-apis] ✓ All ${REQUIRED_APIS.length} required APIs are enabled for "${projectId}".`);
  process.exit(0);
}

const stderr = (res.stderr || '').trim();
console.warn('[enable-apis] Could not enable APIs automatically via `gcloud`.');
if (stderr) {
  console.warn(`[enable-apis] Details: ${stderr.split('\n').slice(0, 3).join(' ')}`);
}
console.warn('[enable-apis] Run `gcloud auth login` if you are not signed in to Google Cloud CLI.');
printManualLinks(projectId);
process.exit(strict ? 1 : 0);
