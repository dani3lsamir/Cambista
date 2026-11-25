// Cambista — storage and background bridge
// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { BackgroundRunner } from '@capacitor/background-runner';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { DEFAULT_SETTINGS, pickLanguage } from './core/rates-core.js';

export const RUNNER_LABEL = 'bo.cambista.app.daily';
const MAX_HISTORY = 1825; // five years of daily readings (about 150 KB)

export const isNative = () => Capacitor.isNativePlatform();

async function read(key, fallback) {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key, value) {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

export async function loadSettings() {
  const saved = await read('settings', {});
  if (saved.theme === 'oled') saved.theme = 'dark'; // the OLED theme became the only dark theme
  return Object.assign({}, DEFAULT_SETTINGS, saved);
}

export async function saveSettings(settings) {
  await write('settings', settings);
  await syncRunnerSettings(settings);
}

// Latest good value of each source, each with its own timestamp:
// { bcb: {rate, validity, source, at}, p2p: {buy, sell, mid, count, source, at} }
export async function loadLatest() {
  return Object.assign({ bcb: null, p2p: null }, await read('latest', {}));
}

export async function loadHistory() {
  return read('history', []);
}

// Read-modify-write steps on the history run one after another, so a refresh and a background
// pull that finish at the same time cannot overwrite each other's days.
let queue = Promise.resolve();
function serialized(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// Applies one or more snapshots (oldest first) to "latest" and to the daily history.
export function applySnapshots(snapshots) {
  return serialized(() => applyNow(snapshots));
}

async function applyNow(snapshots) {
  const latest = await loadLatest();
  const history = await loadHistory();
  for (const s of snapshots) {
    if (!s) continue;
    if (s.bcb && (!latest.bcb || latest.bcb.at <= s.at)) latest.bcb = { ...s.bcb, at: s.at };
    if (s.p2p && (!latest.p2p || latest.p2p.at <= s.at)) latest.p2p = { ...s.p2p, at: s.at };
    if (s.bcb || s.p2p) upsertDay(history, s);
  }
  history.sort((a, b) => (a.day < b.day ? -1 : 1));
  await write('latest', latest);
  await write('history', history.slice(-MAX_HISTORY));
  return { latest, history: history.slice(-MAX_HISTORY) };
}

function upsertDay(history, s) {
  let entry = history.find((h) => h.day === s.day);
  if (!entry) {
    entry = { day: s.day };
    history.push(entry);
  }
  if (entry.at && entry.at > s.at) return;
  entry.at = s.at;
  if (s.bcb) entry.bcb = s.bcb.rate;
  if (s.p2p) {
    entry.buy = s.p2p.buy;
    entry.sell = s.p2p.sell;
    entry.mid = s.p2p.mid;
  }
}

// Adds imported days to the history. Days already on the phone are kept as they are.
// `added` counts only the new days that fit in the history (the oldest go past MAX_HISTORY).
export function importHistory(entries) {
  return serialized(async () => {
    const history = await loadHistory();
    const known = new Set(history.map((h) => h.day));
    const fresh = entries.filter((e) => !known.has(e.day));
    const merged = [...history, ...fresh].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-MAX_HISTORY);
    const kept = new Set(merged.map((h) => h.day));
    await write('history', merged);
    return { history: merged, added: fresh.filter((e) => kept.has(e.day)).length, kept: entries.length - fresh.length };
  });
}

export function clearHistory() {
  return serialized(() => write('history', []));
}

// Android: writes the file to the app's cache and opens the share menu (Drive, WhatsApp, Files…).
// No storage permission needed. Browser: downloads the file. `mime` is the file type (CSV by default).
// Returns false if the user closed the share menu without picking an app.
export async function shareFile(fileName, text, labels = {}, mime = 'text/csv') {
  if (!isNative()) {
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const { uri } = await Filesystem.writeFile({
    path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: labels.title, files: [uri], dialogTitle: labels.dialogTitle });
    return true;
  } catch (e) {
    if (/cancel/i.test(e?.message || '')) return false;
    throw e;
  }
}

// ---------- background runner bridge (Android only) ----------

// The runner cannot see the phone's language, so the app sends the resolved one as uiLang.
export async function syncRunnerSettings(settings) {
  if (!isNative()) return;
  try {
    const withLang = { ...settings, uiLang: pickLanguage(settings.language, navigator.language) };
    await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'saveSettings', details: { settings: withLang } });
  } catch (e) {
    console.warn('runner saveSettings failed', e);
  }
}

// Adds the readings the runner took while the app was closed. They are removed from the runner
// only after they are saved here. Returns { latest, history }, or null if there was nothing new.
export async function pullRunner() {
  if (!isNative()) return null;
  try {
    const r = await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'drain', details: { peek: true } });
    const snapshots = (r && r.snapshots) || [];
    if (!snapshots.length) return null;
    const applied = await applySnapshots(snapshots);
    await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'ackDrain', details: { count: snapshots.length } });
    return applied;
  } catch (e) {
    console.warn('runner pull failed', e);
    return null;
  }
}

export async function runRunnerNow() {
  if (!isNative()) throw Object.assign(new Error('Solo funciona en la app de Android'), { code: 'errAndroidOnly' });
  return BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'runNow', details: {} });
}

export async function ensureNotificationPermission() {
  if (!isNative()) return 'granted';
  try {
    const current = await BackgroundRunner.checkPermissions();
    if (current.notifications === 'granted') return 'granted';
    const asked = await BackgroundRunner.requestPermissions({ apis: ['notifications'] });
    return asked.notifications;
  } catch {
    return 'denied';
  }
}
