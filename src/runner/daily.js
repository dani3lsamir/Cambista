// Cambista — background runner
// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Runs outside the app (Android WorkManager, about every 30 minutes).
// scripts/build-runner.mjs glues src/core/rates-core.js in front of this file and writes
// public/runners/daily.js. Edit this file, never the generated one.
//
// Globals provided by @capacitor/background-runner: addEventListener, fetch,
// CapacitorKV, CapacitorNotifications.

const KV_SETTINGS = 'settings';
const KV_LAST_DAY = 'lastRunDay';
const KV_PENDING = 'pending';
const KV_ATTEMPTS = 'attempts'; // { day, n }: tries today that got only one of the two sources
const MAX_PENDING = 60;
const MAX_PARTIAL_ATTEMPTS = 4; // with one source down, retry about every 30 min, up to 4 times
const NOTIFICATION_ID = 1001;

function kvGet(key, fallback) {
  try {
    const r = CapacitorKV.get(key);
    const v = r && r.value;
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function kvSet(key, value) {
  CapacitorKV.set(key, JSON.stringify(value));
}

function savePending(snapshot) {
  const list = kvGet(KV_PENDING, []);
  list.push(snapshot);
  kvSet(KV_PENDING, list.slice(-MAX_PENDING));
}

function notify(snapshot, settings) {
  CapacitorNotifications.schedule([
    {
      id: NOTIFICATION_ID,
      title: notificationTitle(settings),
      body: notificationText(snapshot, settings),
    },
  ]);
}

// The day counts as done when both sources answered, or when one of them is still down after
// MAX_PARTIAL_ATTEMPTS tries. Until then the next check (about 30 min later) tries again, and the
// notification waits, so it is sent once a day with as much data as possible.
async function runUpdate(forceNotify) {
  const settings = Object.assign({}, DEFAULT_SETTINGS, kvGet(KV_SETTINGS, {}));
  const snapshot = await fetchSnapshot(fetch, settings, new Date());
  const ok = !!(snapshot.bcb || snapshot.p2p);
  let done = false;
  if (ok) {
    savePending(snapshot);
    const prev = kvGet(KV_ATTEMPTS, null);
    const n = (prev && prev.day === snapshot.day ? prev.n : 0) + 1;
    kvSet(KV_ATTEMPTS, { day: snapshot.day, n });
    done = !!(snapshot.bcb && snapshot.p2p) || n >= MAX_PARTIAL_ATTEMPTS;
    if (done) kvSet(KV_LAST_DAY, snapshot.day);
  }
  if ((done && settings.notify) || forceNotify) notify(snapshot, settings);
  return { ok, snapshot };
}

// Periodic event configured in capacitor.config.json
addEventListener('dailyCheck', async (resolve, reject) => {
  try {
    const settings = Object.assign({}, DEFAULT_SETTINGS, kvGet(KV_SETTINGS, {}));
    if (!isDue(settings, kvGet(KV_LAST_DAY, null), new Date())) return resolve();
    await runUpdate(false);
    resolve();
  } catch (e) {
    console.error('dailyCheck failed: ' + e);
    reject(e);
  }
});

// The app sends its settings every time they change
addEventListener('saveSettings', (resolve, reject, args) => {
  try {
    kvSet(KV_SETTINGS, Object.assign({}, DEFAULT_SETTINGS, (args && args.settings) || {}));
    resolve({ ok: true });
  } catch (e) {
    reject(e);
  }
});

// The app collects readings taken in the background and adds them to its history.
// With { peek: true } they stay here until the app confirms it saved them ('ackDrain'), so a
// crash between the two steps loses nothing.
addEventListener('drain', (resolve, reject, args) => {
  try {
    const list = kvGet(KV_PENDING, []);
    if (!(args && args.peek)) kvSet(KV_PENDING, []);
    resolve({ snapshots: list, lastRunDay: kvGet(KV_LAST_DAY, null) });
  } catch (e) {
    reject(e);
  }
});

// The app saved the first `count` pending readings: remove them (newer ones stay)
addEventListener('ackDrain', (resolve, reject, args) => {
  try {
    const count = Number(args && args.count) || 0;
    kvSet(KV_PENDING, kvGet(KV_PENDING, []).slice(count));
    resolve({ ok: true });
  } catch (e) {
    reject(e);
  }
});

// "Probar ahora" button in Settings
addEventListener('runNow', async (resolve, reject) => {
  try {
    const r = await runUpdate(true);
    resolve({ ok: r.ok, errors: r.snapshot.errors });
  } catch (e) {
    reject(e);
  }
});
