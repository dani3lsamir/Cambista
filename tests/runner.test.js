// Loads the generated runner the way @capacitor/background-runner does (a plain script with
// globals) and drives its events with fake CapacitorKV / CapacitorNotifications / fetch.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let code;
beforeAll(() => {
  execFileSync('node', ['scripts/build-runner.mjs']);
  code = readFileSync('public/runners/daily.js', 'utf8');
});

function makeRuntime(fetchImpl, now) {
  const kv = new Map();
  const notes = [];
  const listeners = {};
  const env = {
    addEventListener: (name, fn) => { listeners[name] = fn; },
    fetch: fetchImpl,
    console,
    CapacitorKV: {
      get: (k) => ({ value: kv.has(k) ? kv.get(k) : undefined }),
      set: (k, v) => kv.set(k, v),
      remove: (k) => kv.delete(k),
    },
    CapacitorNotifications: { schedule: (list) => notes.push(...list) },
    Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } },
  };
  // eslint-disable-next-line no-new-func
  new Function(...Object.keys(env), code)(...Object.values(env));
  const dispatch = (event, args = {}) => new Promise((resolve, reject) => listeners[event](resolve, reject, args));
  return { kv, notes, dispatch, listeners };
}

const okFetch = async (url, opts) => {
  if (url.includes('bcb.gob.bo')) return { ok: true, text: async () => 'Tipo de cambio oficial VIGENTE PARA EL LUNES 5 DE OCTUBRE, 2026 12,00' };
  const side = JSON.parse(opts.body).tradeType;
  const price = side === 'BUY' ? '12.60' : '12.20';
  return { ok: true, text: async () => JSON.stringify({ data: [{ adv: { price } }] }) };
};

describe('background runner', () => {
  it('registers all events', () => {
    const rt = makeRuntime(okFetch, new Date(2026, 9, 5, 10, 0).getTime());
    expect(Object.keys(rt.listeners).sort()).toEqual(['dailyCheck', 'drain', 'runNow', 'saveSettings']);
  });

  it('does nothing before the configured hour', async () => {
    const rt = makeRuntime(okFetch, new Date(2026, 9, 5, 8, 0).getTime());
    await rt.dispatch('saveSettings', { settings: { updateTime: '09:00' } });
    await rt.dispatch('dailyCheck');
    expect(rt.notes).toHaveLength(0);
  });

  it('updates once a day, notifies, and hands readings to the app', async () => {
    const rt = makeRuntime(okFetch, new Date(2026, 9, 5, 9, 20).getTime());
    await rt.dispatch('saveSettings', { settings: { updateTime: '09:00', notify: true } });
    await rt.dispatch('dailyCheck');
    await rt.dispatch('dailyCheck'); // second check the same day: no-op
    expect(rt.notes).toHaveLength(1);
    expect(rt.notes[0].body).toBe('BCB 12,00 · P2P 12,40 · Brecha +3,3%');
    const drained = await rt.dispatch('drain');
    expect(drained.snapshots).toHaveLength(1);
    expect(drained.lastRunDay).toBe('2026-10-05');
    expect((await rt.dispatch('drain')).snapshots).toHaveLength(0);
  });

  it('runNow always notifies, even when offline', async () => {
    const rt = makeRuntime(async () => { throw new Error('offline'); }, new Date(2026, 9, 5, 9, 20).getTime());
    const r = await rt.dispatch('runNow');
    expect(r.ok).toBe(false);
    expect(rt.notes[0].body).toMatch(/No se pudo/);
  });
});
