// Cambista — background runner
// Copyright (c) 2026 dani3lsamir. All rights reserved.
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
const MAX_PENDING = 60;
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

async function runUpdate(forceNotify) {
  const settings = Object.assign({}, DEFAULT_SETTINGS, kvGet(KV_SETTINGS, {}));
  const snapshot = await fetchSnapshot(fetch, settings, new Date());
  const ok = !!(snapshot.bcb || snapshot.p2p);
  if (ok) {
    savePending(snapshot);
    kvSet(KV_LAST_DAY, snapshot.day);
  }
  if ((ok && settings.notify) || forceNotify) notify(snapshot, settings);
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

// The app collects readings taken in the background and adds them to its history
addEventListener('drain', (resolve, reject) => {
  try {
    const list = kvGet(KV_PENDING, []);
    kvSet(KV_PENDING, []);
    resolve({ snapshots: list, lastRunDay: kvGet(KV_LAST_DAY, null) });
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
