// Cambista — app shell and screens
// Copyright (c) 2026 dani3lsamir. All rights reserved.
import { App } from '@capacitor/app';
import {
  fetchSnapshot, p2pReference, gap, fmtNumber, fmtPercent, localDay,
} from './core/rates-core.js';
import {
  isNative, loadSettings, saveSettings, loadLatest, loadHistory, applySnapshots,
  clearHistory, drainRunner, runRunnerNow, ensureNotificationPermission, syncRunnerSettings, shareFile,
} from './store.js';
import { historyToCsv, exportFileName } from './core/export.js';
import { demoFetch, demoHistory } from './demo.js';

const VERSION = __APP_VERSION__;
const DEMO = !isNative() && new URLSearchParams(location.search).has('demo');
const STALE_MS = 26 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 10 * 60 * 1000;

const state = {
  tab: 'today',
  settings: null,
  latest: { bcb: null, p2p: null },
  history: [],
  loading: false,
  errors: [],
  calc: { dir: 'usd2bs', amount: '100' },
  sheet: null,
};

const root = document.getElementById('app');

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ago(iso) {
  if (!iso) return 'nunca';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

function clock(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '';
}

function prettyDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = localDay(new Date());
  if (day === today) return 'Hoy';
  return date.toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' });
}

const isStale = (iso) => !iso || Date.now() - new Date(iso).getTime() > STALE_MS;

function sideLabel(side) {
  return side === 'buy' ? 'precio de compra' : side === 'sell' ? 'precio de venta' : 'promedio compra/venta';
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

// ---------------------------------------------------------------- icons (own, 24px stroke)
const icon = {
  today: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01"/>',
  history: '<path d="M4 19V5M4 19h16"/><path d="M7.5 15l3.5-4 3 2.5L19 8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
};
const svg = (name, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon[name]}</svg>`;

// ---------------------------------------------------------------- data
async function refresh({ silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  render();
  const fetchFn = DEMO ? demoFetch : (url, opts) => fetch(url, opts);
  const snap = await fetchSnapshot(fetchFn, state.settings, new Date());
  const r = await applySnapshots([snap]);
  state.latest = r.latest;
  state.history = r.history;
  state.errors = snap.errors;
  state.loading = false;
  render();
  if (!silent && !snap.errors.length) toast('Tipo de cambio actualizado');
}

async function pullBackground() {
  const snaps = await drainRunner();
  if (snaps.length) {
    const r = await applySnapshots(snaps);
    state.latest = r.latest;
    state.history = r.history;
  }
}

function needsRefresh() {
  const times = [state.latest.bcb?.at, state.latest.p2p?.at].filter(Boolean);
  if (times.length < 2) return true;
  return times.some((t) => Date.now() - new Date(t).getTime() > AUTO_REFRESH_MS);
}

// ---------------------------------------------------------------- screens
function screenToday() {
  const { bcb, p2p } = state.latest;
  const side = state.settings.gapSide;
  const ref = p2pReference(p2p, side);
  const g = gap(ref, bcb?.rate);
  const gapClass = g > 0 ? 'up' : g < 0 ? 'down' : '';
  const explain = Number.isFinite(g)
    ? `El paralelo (${sideLabel(side)}) está ${fmtPercent(Math.abs(g)).replace('+', '')} ${g >= 0 ? 'por encima' : 'por debajo'} del oficial.`
    : 'Falta una de las dos tasas para calcular la brecha.';

  const lastAt = [bcb?.at, p2p?.at].filter(Boolean).sort().pop();
  const stale = isStale(bcb?.at) || isStale(p2p?.at);

  return `
  <main class="screen">
    <div class="title-row">
      <div>
        <h1 class="title">Hoy</h1>
        <p class="subtitle">Dólar en Bolivia · oficial y paralelo</p>
      </div>
      <button class="btn ghost small" data-action="refresh" ${state.loading ? 'disabled' : ''} aria-label="Actualizar">
        ${state.loading ? '<span class="spin"></span>' : svg('refresh', 18)} Actualizar
      </button>
    </div>

    ${DEMO ? '<div class="notice demo">Vista de demostración con datos de ejemplo. En el celular la app consulta el BCB y Binance de verdad.</div><div style="height:12px"></div>' : ''}

    <section class="hero">
      <div class="label">Brecha paralelo vs oficial</div>
      <div class="big num ${gapClass}">${fmtPercent(g)}</div>
      <div class="explain">${explain}</div>
    </section>

    <div class="section-label">Tasas</div>
    <section class="card rate-card">
      <div class="rate-head">
        <span class="rate-name">Oficial BCB</span>
        <span class="rate-src">${esc(bcb?.source || 'BCB')}</span>
      </div>
      <div class="rate-value num">${fmtNumber(bcb?.rate)}<span class="rate-unit">Bs/USD</span></div>
      <div class="rate-meta">${bcb?.validity ? 'Vigente para ' + esc(bcb.validity.replace(/^vigente para /i, '').toLowerCase()) : 'Tipo de cambio oficial del Banco Central'}</div>
      <div class="rate-meta">${bcb ? 'Consultado ' + ago(bcb.at) : 'Sin datos todavía'}</div>
    </section>

    <section class="card rate-card">
      <div class="rate-head">
        <span class="rate-name">Dólar paralelo</span>
        <span class="rate-src">${esc(p2p?.source || 'Binance P2P')}</span>
      </div>
      <div class="rate-value num">${fmtNumber(p2p?.mid)}<span class="rate-unit">Bs/USD promedio</span></div>
      <div class="rate-meta">${p2p ? (p2p.count ? `Mediana de ${p2p.count} anuncios por lado · ` : '') + 'consultado ' + ago(p2p.at) : 'Sin datos todavía'}</div>
      <div class="split">
        <div><div class="k">Comprar dólar</div><div class="v num">${fmtNumber(p2p?.buy)}</div></div>
        <div><div class="k">Vender dólar</div><div class="v num">${fmtNumber(p2p?.sell)}</div></div>
      </div>
    </section>

    ${state.errors.length ? `<div class="notice err">No se pudo actualizar todo. Se muestran los últimos datos guardados.<br><span style="color:var(--text-3)">${state.errors.map(esc).join('<br>')}</span></div>` : ''}

    <div class="status">
      <span class="dot ${state.errors.length ? 'err' : stale ? 'stale' : ''}"></span>
      ${lastAt ? `Última actualización ${clock(lastAt)} · ${ago(lastAt)}` : 'Toca Actualizar para la primera consulta'}
    </div>
  </main>`;
}

function calcResults() {
  const { bcb, p2p } = state.latest;
  const a = Number(String(state.calc.amount).replace(/\./g, '').replace(',', '.'));
  const amount = Number.isFinite(a) ? a : NaN;
  if (state.calc.dir === 'usd2bs') {
    const atBcb = amount * (bcb?.rate ?? NaN);
    const atP2p = amount * (p2p?.sell ?? NaN);
    return `
      <div class="row"><div class="grow">Al oficial BCB<div class="sub num">${fmtNumber(bcb?.rate)} Bs por dólar</div></div><div class="end strong num">Bs ${fmtNumber(atBcb)}</div></div>
      <div class="row"><div class="grow">Vendiendo en P2P<div class="sub num">${fmtNumber(p2p?.sell)} Bs por dólar</div></div><div class="end strong num">Bs ${fmtNumber(atP2p)}</div></div>
      <div class="row"><div class="grow">Diferencia</div><div class="end num">Bs ${fmtNumber(atP2p - atBcb)}</div></div>`;
  }
  const atBcb = amount / (bcb?.rate ?? NaN);
  const atP2p = amount / (p2p?.buy ?? NaN);
  return `
    <div class="row"><div class="grow">Al oficial BCB<div class="sub num">${fmtNumber(bcb?.rate)} Bs por dólar</div></div><div class="end strong num">USD ${fmtNumber(atBcb)}</div></div>
    <div class="row"><div class="grow">Comprando en P2P<div class="sub num">${fmtNumber(p2p?.buy)} Bs por dólar</div></div><div class="end strong num">USD ${fmtNumber(atP2p)}</div></div>
    <div class="row"><div class="grow">Diferencia</div><div class="end num">USD ${fmtNumber(atP2p - atBcb)}</div></div>`;
}

function screenCalc() {
  const usd = state.calc.dir === 'usd2bs';
  return `
  <main class="screen">
    <div class="title-row"><div><h1 class="title">Calcular</h1><p class="subtitle">Con las tasas de la pantalla Hoy</p></div></div>
    <div class="segmented" role="tablist">
      <button data-dir="usd2bs" class="${usd ? 'on' : ''}">Tengo dólares</button>
      <button data-dir="bs2usd" class="${!usd ? 'on' : ''}">Tengo bolivianos</button>
    </div>
    <section class="card pad" style="margin-top:12px">
      <label class="amount-cur" for="amount">${usd ? 'Monto en dólares (USD)' : 'Monto en bolivianos (Bs)'}</label>
      <input id="amount" class="amount" inputmode="decimal" autocomplete="off" value="${esc(state.calc.amount)}" />
    </section>
    <div class="section-label">${usd ? 'Recibes en bolivianos' : 'Recibes en dólares'}</div>
    <section class="card" id="calc-results">${calcResults()}</section>
    <p class="footnote">P2P usa la mediana de los anuncios de Binance: para vender dólares toma el precio que te pagan; para comprar, el que pagas. Es una referencia, no un precio garantizado.</p>
  </main>`;
}

function chart(history) {
  const pts = history.slice(-30).filter((h) => Number.isFinite(h.bcb) || Number.isFinite(h.mid));
  if (pts.length < 2) return '';
  const vals = pts.flatMap((h) => [h.bcb, h.mid]).filter(Number.isFinite);
  let min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 0.1;
  min -= pad; max += pad;
  const W = 320, H = 160;
  const x = (i) => (i / (pts.length - 1)) * (W - 8) + 4;
  const y = (v) => H - 18 - ((v - min) / (max - min)) * (H - 30);
  const line = (key) => pts.map((h, i) => (Number.isFinite(h[key]) ? `${x(i).toFixed(1)},${y(h[key]).toFixed(1)}` : null)).filter(Boolean).join(' ');
  return `
  <section class="card chart">
    <div class="legend"><span><i style="background:var(--text-2)"></i>Oficial BCB</span><span><i style="background:var(--accent)"></i>P2P promedio</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolución de los últimos ${pts.length} días">
      <line x1="0" x2="${W}" y1="${H - 18}" y2="${H - 18}" stroke="var(--line)" />
      <polyline points="${line('bcb')}" fill="none" stroke="var(--text-2)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
      <polyline points="${line('mid')}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
      <text x="2" y="${H - 4}" font-size="10" fill="var(--text-3)">${esc(prettyDay(pts[0].day))}</text>
      <text x="${W - 2}" y="${H - 4}" font-size="10" fill="var(--text-3)" text-anchor="end">${esc(prettyDay(pts[pts.length - 1].day))}</text>
    </svg>
  </section>`;
}

function screenHistory() {
  const side = state.settings.gapSide;
  const rows = state.history.slice().reverse().slice(0, 90).map((h) => {
    const ref = side === 'buy' ? h.buy : side === 'sell' ? h.sell : h.mid;
    const g = gap(ref, h.bcb);
    return `<div class="row"><div class="grow">${esc(prettyDay(h.day))}<div class="sub num">BCB ${fmtNumber(h.bcb)} · P2P ${fmtNumber(ref)}</div></div><div class="end num ${g > 0 ? 'up' : g < 0 ? 'down' : ''}">${fmtPercent(g)}</div></div>`;
  }).join('');
  return `
  <main class="screen">
    <div class="title-row"><div><h1 class="title">Historial</h1><p class="subtitle">Una lectura por día, guardada en tu celular</p></div></div>
    ${state.history.length ? chart(state.history) + `<div class="section-label">Días</div><section class="card">${rows}</section>` : '<div class="card empty">Todavía no hay historial. Cada actualización agrega el día.</div>'}
  </main>`;
}

function screenSettings() {
  const s = state.settings;
  const seg = (key, options) => `<div class="segmented" data-seg="${key}">${options.map(([v, l]) => `<button data-value="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `
  <main class="screen">
    <div class="title-row"><div><h1 class="title">Ajustes</h1></div></div>

    <div class="section-label">Actualización automática</div>
    <section class="card">
      <div class="row"><div class="grow">Actualizar una vez al día<div class="sub">Aunque la app esté cerrada</div></div>
        <label class="switch"><input type="checkbox" data-toggle="autoUpdate" ${s.autoUpdate ? 'checked' : ''}><span></span></label></div>
      <div class="row"><div class="grow">Hora</div>
        <input type="time" class="time-input" data-time="updateTime" value="${esc(s.updateTime)}" ${s.autoUpdate ? '' : 'disabled'}></div>
      <div class="row"><div class="grow">Avisarme con una notificación<div class="sub">BCB, P2P y brecha del día</div></div>
        <label class="switch"><input type="checkbox" data-toggle="notify" ${s.notify ? 'checked' : ''} ${s.autoUpdate ? '' : 'disabled'}><span></span></label></div>
      ${isNative() ? '<button class="row" data-action="run-now"><div class="grow">Probar ahora</div><div class="end">Consultar y notificar</div></button>' : ''}
    </section>
    <p class="footnote">La actualización llega entre la hora que elijas y unos 30 minutos después, porque Android agrupa las tareas en segundo plano para ahorrar batería. Si no te llega, revisa que Cambista no esté restringida en el ahorro de batería de tu celular.</p>

    <div class="section-label">Dólar paralelo</div>
    <section class="card pad">
      <div style="margin-bottom:8px">Precio para calcular la brecha</div>
      ${seg('gapSide', [['mid', 'Promedio'], ['buy', 'Compra'], ['sell', 'Venta']])}
      <div style="margin:16px 0 8px">Anuncios de Binance para la mediana</div>
      ${seg('adsCount', [[5, '5'], [10, '10'], [20, '20']])}
    </section>

    <div class="section-label">Apariencia</div>
    <section class="card pad">${seg('theme', [['system', 'Sistema'], ['dark', 'Oscuro'], ['oled', 'OLED'], ['light', 'Claro']])}</section>

    <div class="section-label">Datos</div>
    <section class="card">
      <button class="row" data-action="export" ${state.history.length ? '' : 'disabled'}><div class="grow">Exportar historial<div class="sub">${state.history.length ? `${state.history.length} ${state.history.length === 1 ? 'día' : 'días'} en un archivo CSV para Excel o Google Sheets` : 'Todavía no hay días guardados'}</div></div></button>
      <button class="row danger" data-action="ask-clear"><div class="grow">Borrar historial</div></button>
    </section>

    <div class="section-label">Acerca de</div>
    <section class="card">
      <div class="row"><div class="grow">Versión</div><div class="end">${esc(VERSION)}</div></div>
      <div class="row"><div class="grow">Dólar oficial<div class="sub">Banco Central de Bolivia · bcb.gob.bo</div></div></div>
      <div class="row"><div class="grow">Dólar paralelo<div class="sub">Binance P2P, USDT/BOB</div></div></div>
      <div class="row"><div class="grow">Otras fuentes<div class="sub">DolarApi · paralelo.bo (CC BY 4.0)</div></div></div>
    </section>
    <p class="footnote">Cambista es informativa. Las tasas pueden cambiar en cualquier momento y no son una oferta de compra o venta.<br>© 2026 dani3lsamir. Todos los derechos reservados.</p>
  </main>`;
}

function sheet() {
  if (state.sheet !== 'clear') return '';
  return `
  <div class="sheet-backdrop" data-action="close-sheet">
    <div class="sheet" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
      <h3>¿Borrar el historial?</h3>
      <p>Se eliminan todos los días guardados en este celular. Las tasas de hoy se mantienen.</p>
      <div class="actions">
        <button class="btn danger block" data-action="clear">Borrar historial</button>
        <button class="btn ghost block" data-action="close-sheet">Cancelar</button>
      </div>
    </div>
  </div>`;
}

function tabbar() {
  const tabs = [['today', 'Hoy'], ['calc', 'Calcular'], ['history', 'Historial'], ['settings', 'Ajustes']];
  return `<nav class="tabbar"><div class="tabbar-inner">${tabs.map(([k, l]) => `<button class="tab ${state.tab === k ? 'on' : ''}" data-tab="${k}">${svg(k === 'today' ? 'today' : k)}${l}</button>`).join('')}</div></nav>`;
}

function render() {
  const screens = { today: screenToday, calc: screenCalc, history: screenHistory, settings: screenSettings };
  const scroll = window.scrollY;
  root.innerHTML = screens[state.tab]() + tabbar() + sheet();
  window.scrollTo(0, scroll);
}

// ---------------------------------------------------------------- events
async function updateSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  if (key === 'theme') applyTheme();
  await saveSettings(state.settings);
  if (key === 'adsCount') refresh({ silent: true });
  render();
}

root.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab],[data-action],[data-dir],[data-seg] button');
  if (!t) return;
  if (t.dataset.tab) {
    state.tab = t.dataset.tab;
    window.scrollTo(0, 0);
    render();
    return;
  }
  if (t.dataset.dir) {
    state.calc.dir = t.dataset.dir;
    state.calc.amount = t.dataset.dir === 'usd2bs' ? '100' : '1000';
    render();
    return;
  }
  const seg = t.closest('[data-seg]');
  if (seg) {
    const key = seg.dataset.seg;
    const raw = t.dataset.value;
    await updateSetting(key, key === 'adsCount' ? Number(raw) : raw);
    return;
  }
  switch (t.dataset.action) {
    case 'refresh': refresh(); break;
    case 'export':
      if (!state.history.length) break;
      try {
        const shared = await shareFile(exportFileName(localDay()), historyToCsv(state.history));
        if (shared && !isNative()) toast('Historial descargado');
      } catch (err) {
        toast('No se pudo exportar: ' + (err?.message || err));
      }
      break;
    case 'ask-clear': state.sheet = 'clear'; render(); break;
    case 'close-sheet': state.sheet = null; render(); break;
    case 'clear':
      await clearHistory();
      state.history = [];
      state.sheet = null;
      render();
      toast('Historial borrado');
      break;
    case 'run-now':
      toast('Consultando en segundo plano…');
      try {
        await ensureNotificationPermission();
        const r = await runRunnerNow();
        await pullBackground();
        render();
        toast(r && r.ok ? 'Listo: revisa la notificación' : 'Falló la consulta en segundo plano');
      } catch (err) {
        toast('Error: ' + (err?.message || err));
      }
      break;
  }
});

root.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.toggle) {
    if (t.dataset.toggle === 'notify' && t.checked) {
      const p = await ensureNotificationPermission();
      if (p !== 'granted') {
        toast('Activa las notificaciones de Cambista en los ajustes de Android');
        t.checked = false;
        return;
      }
    }
    await updateSetting(t.dataset.toggle, t.checked);
  }
  if (t.dataset.time && /^\d{2}:\d{2}$/.test(t.value)) await updateSetting(t.dataset.time, t.value);
});

root.addEventListener('input', (e) => {
  if (e.target.id !== 'amount') return;
  state.calc.amount = e.target.value;
  const box = document.getElementById('calc-results');
  if (box) box.innerHTML = calcResults();
});

// ---------------------------------------------------------------- boot
async function boot() {
  state.settings = await loadSettings();
  applyTheme();
  state.latest = await loadLatest();
  state.history = await loadHistory();
  if (DEMO && !state.history.length) {
    const r = await applySnapshots(demoHistory().map((h) => ({
      at: h.at, day: h.day, bcb: { rate: h.bcb, source: 'BCB' }, p2p: { buy: h.buy, sell: h.sell, mid: h.mid, source: 'Binance P2P' },
    })));
    state.history = r.history;
  }
  render();
  // Notifications are on by default; Android 13+ needs the user's OK once.
  if (isNative() && state.settings.autoUpdate && state.settings.notify) await ensureNotificationPermission();
  await syncRunnerSettings(state.settings);
  await pullBackground();
  render();
  if (needsRefresh()) refresh({ silent: true });

  if (isNative()) {
    App.addListener('resume', async () => {
      await pullBackground();
      render();
      if (needsRefresh()) refresh({ silent: true });
    });
  }
}

boot();
