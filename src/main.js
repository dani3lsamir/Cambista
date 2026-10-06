// Cambista — app shell and screens
// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
import { App } from '@capacitor/app';
import {
  fetchSnapshot, p2pReference, gap, fmtNumber as fmtNum, fmtPercent as fmtPct, localDay,
} from './core/rates-core.js';
import {
  isNative, loadSettings, saveSettings, loadLatest, loadHistory, applySnapshots,
  clearHistory, importHistory, drainRunner, runRunnerNow, ensureNotificationPermission, syncRunnerSettings, shareFile,
} from './store.js';
import { historyToCsv, exportFileName, parseHistoryCsv } from './core/export.js';
import { demoFetch, demoHistory } from './demo.js';
import { t, lang, setLanguage } from './i18n.js';

const VERSION = __APP_VERSION__;
const DEMO = !isNative() && new URLSearchParams(location.search).has('demo');
const STALE_MS = 26 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 10 * 60 * 1000;

const state = {
  tab: 'today',
  settings: null,
  latest: { bcb: null, p2p: null, banks: null },
  history: [],
  loading: false,
  errors: [],
  banksError: null,
  calc: { dir: 'usd2bs', amount: '100' },
  sheet: null,
};

const root = document.getElementById('app');

// ---------------------------------------------------------------- helpers
const fmtNumber = (n, decimals) => fmtNum(n, decimals, lang());
const fmtPercent = (ratio) => fmtPct(ratio, lang());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ago(iso) {
  if (!iso) return t('never');
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return t('justNow');
  if (min < 60) return t('minAgo', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('hoursAgo', { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? t('yesterday') : t('daysAgo', { n: d });
}

function clock(iso) {
  return iso ? new Date(iso).toLocaleTimeString(t('locale'), { hour: '2-digit', minute: '2-digit' }) : '';
}

function prettyDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = localDay(new Date());
  if (day === today) return t('today');
  return date.toLocaleDateString(t('locale'), { weekday: 'short', day: 'numeric', month: 'short' });
}

const isStale = (iso) => !iso || Date.now() - new Date(iso).getTime() > STALE_MS;

function sideLabel(side) {
  return side === 'buy' ? t('sideBuy') : side === 'sell' ? t('sideSell') : t('sideMid');
}

// The BCB writes the validity in Spanish: "el sábado 3, domingo 4 y lunes 5 de octubre, 2026"
const EN_DATE_WORDS = {
  lunes: 'Monday', martes: 'Tuesday', miércoles: 'Wednesday', jueves: 'Thursday', viernes: 'Friday',
  sábado: 'Saturday', domingo: 'Sunday', enero: 'January', febrero: 'February', marzo: 'March',
  abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August', septiembre: 'September',
  setiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December',
  y: 'and', el: '', de: '', del: '',
};
function validityText(validity) {
  const s = validity.replace(/^vigente para /i, '').toLowerCase();
  if (lang() !== 'en') return s;
  return s.replace(/[a-záéíóúñ]+/g, (w) => (w in EN_DATE_WORDS ? EN_DATE_WORDS[w] : w))
    .replace(/\s+/g, ' ').replace(/\s,/g, ',').trim();
}

// Source names come from rates-core in Spanish, e.g. "DolarApi (respaldo)"
function sourceName(name) {
  return String(name).replace('(respaldo)', `(${t('backup')})`);
}

// Amount typed in the calculator: "1.234,5" in Spanish, "1,234.5" in English
function parseAmount(text) {
  const s = String(text).trim();
  const plain = lang() === 'en' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  return plain === '' ? NaN : Number(plain);
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
  banks: '<path d="M3 9.5L12 4l9 5.5"/><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5"/><path d="M3.5 20h17"/>',
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
  state.banksError = snap.banksError;
  state.loading = false;
  render();
  if (!silent && !snap.errors.length) toast(t('updated'));
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
    ? t(g >= 0 ? 'gapAbove' : 'gapBelow', { side: sideLabel(side), pct: fmtPercent(Math.abs(g)).replace('+', '') })
    : t('gapMissing');

  const lastAt = [bcb?.at, p2p?.at].filter(Boolean).sort().pop();
  const stale = isStale(bcb?.at) || isStale(p2p?.at);

  return `
  <main class="screen">
    <div class="title-row">
      <div>
        <h1 class="title">${t('today')}</h1>
        <p class="subtitle">${t('todaySubtitle')}</p>
      </div>
      <button class="btn ghost small" data-action="refresh" ${state.loading ? 'disabled' : ''} aria-label="${t('refresh')}">
        ${state.loading ? '<span class="spin"></span>' : svg('refresh', 18)} ${t('refresh')}
      </button>
    </div>

    ${DEMO ? `<div class="notice demo">${t('demo')}</div><div style="height:12px"></div>` : ''}

    <section class="hero">
      <div class="label">${t('gapLabel')}</div>
      <div class="big num ${gapClass}">${fmtPercent(g)}</div>
      <div class="explain">${explain}</div>
    </section>

    <div class="section-label">${t('rates')}</div>
    <section class="card rate-card">
      <div class="rate-head">
        <span class="rate-name">${t('official')}</span>
        <span class="rate-src">${esc(sourceName(bcb?.source || 'BCB'))}</span>
      </div>
      <div class="rate-value num">${fmtNumber(bcb?.rate)}<span class="rate-unit">Bs/USD</span></div>
      <div class="rate-meta">${bcb?.validity ? t('validFor', { date: esc(validityText(bcb.validity)) }) : t('officialAbout')}</div>
      <div class="rate-meta">${bcb ? t('checked', { ago: ago(bcb.at) }) : t('noData')}</div>
    </section>

    <section class="card rate-card">
      <div class="rate-head">
        <span class="rate-name">${t('parallel')}</span>
        <span class="rate-src">${esc(sourceName(p2p?.source || 'Binance P2P'))}</span>
      </div>
      <div class="rate-value num">${fmtNumber(p2p?.mid)}<span class="rate-unit">Bs/USD ${t('average')}</span></div>
      <div class="rate-meta">${p2p ? (p2p.count ? t('medianOf', { n: p2p.count }) : '') + t('checkedLower', { ago: ago(p2p.at) }) : t('noData')}</div>
      <div class="split">
        <div><div class="k">${t('buyDollar')}</div><div class="v num">${fmtNumber(p2p?.buy)}</div></div>
        <div><div class="k">${t('sellDollar')}</div><div class="v num">${fmtNumber(p2p?.sell)}</div></div>
      </div>
    </section>

    ${bankCard()}

    ${state.errors.length ? `<div class="notice err">${t('partialError')}<br><span style="color:var(--text-3)">${state.errors.map(esc).join('<br>')}</span></div>` : ''}

    <div class="status">
      <span class="dot ${state.errors.length ? 'err' : stale ? 'stale' : ''}"></span>
      ${lastAt ? t('lastUpdate', { time: clock(lastAt), ago: ago(lastAt) }) : t('firstRefresh')}
    </div>
  </main>`;
}

// Small card on Today that opens the Banks tab
function bankCard() {
  const { banks } = state.latest;
  if (!banks) return '';
  const best = sortedBanks(banks)[0];
  return `
    <button class="card rate-card card-link" data-tab="banks">
      <div class="rate-head">
        <span class="rate-name">${t('banks')}</span>
        <span class="rate-src">BCB ›</span>
      </div>
      <div class="rate-value num">${fmtNumber(banks.median)}<span class="rate-unit">Bs/USD ${t('medianShort')}</span></div>
      ${best?.buy ? `<div class="rate-meta">${t('bestBank', { name: esc(best.name), rate: fmtNumber(best.buy) })}</div>` : ''}
    </button>`;
}

// Highest price first; banks without trades at the end
function sortedBanks(banks) {
  return (banks?.banks || []).slice().sort((a, b) => (b.buy ?? -1) - (a.buy ?? -1));
}

function screenBanks() {
  const { banks, p2p } = state.latest;
  const list = sortedBanks(banks);
  const bestBuy = list[0]?.buy;
  const g = gap(p2p?.sell, banks?.median);
  const explain = Number.isFinite(g)
    ? t(g >= 0 ? 'p2pPaysMore' : 'bankPaysMore', { pct: fmtPercent(Math.abs(g)).replace('+', '') })
    : '';
  const rows = list.map((b) => {
    const isBest = b.buy !== null && b.buy === bestBuy;
    const sub = b.buy === null ? t('noTrades') : t(b.count === 1 ? 'bankVolumeOne' : 'bankVolume', { amount: fmtNumber(b.amount, 0), n: fmtNumber(b.count, 0) });
    return `<div class="row"><div class="grow">${esc(b.name)}${isBest ? ` <span class="badge">${t('best')}</span>` : ''}<div class="sub num">${sub}</div></div><div class="end num ${isBest ? 'strong' : ''}">${fmtNumber(b.buy)}</div></div>`;
  }).join('');
  return `
  <main class="screen">
    <div class="title-row"><div><h1 class="title">${t('banks')}</h1><p class="subtitle">${t('banksSubtitle')}</p></div></div>
    ${state.banksError ? `<div class="notice err">${t('banksError')}<br><span style="color:var(--text-3)">${esc(state.banksError)}</span></div><div style="height:12px"></div>` : ''}
    ${banks ? `
    <section class="hero">
      <div class="label">${t('banksMedian')}</div>
      <div class="big num">${fmtNumber(banks.median)}<span class="rate-unit">Bs/USD</span></div>
      <div class="explain">${explain}</div>
    </section>
    <div class="section-label">${t('bankList')}</div>
    <section class="card">${rows}</section>
    <p class="footnote">${t('banksNote')}${banks.date ? '<br>' + t('banksDate', { date: esc(banks.date) }) : ''}<br>${t('checked', { ago: ago(banks.at) })}</p>`
    : `<div class="card empty">${t('noBanksYet')}</div>`}
  </main>`;
}

function calcResults() {
  const { bcb, p2p, banks } = state.latest;
  const amount = parseAmount(state.calc.amount);
  if (state.calc.dir === 'usd2bs') {
    const atBcb = amount * (bcb?.rate ?? NaN);
    const atP2p = amount * (p2p?.sell ?? NaN);
    const bankRow = banks?.median
      ? `<div class="row"><div class="grow">${t('sellingBank')}<div class="sub num">${t('perDollarMedian', { rate: fmtNumber(banks.median) })}</div></div><div class="end strong num">Bs ${fmtNumber(amount * banks.median)}</div></div>`
      : '';
    return `
      <div class="row"><div class="grow">${t('atOfficial')}<div class="sub num">${t('perDollar', { rate: fmtNumber(bcb?.rate) })}</div></div><div class="end strong num">Bs ${fmtNumber(atBcb)}</div></div>
      ${bankRow}
      <div class="row"><div class="grow">${t('sellingP2p')}<div class="sub num">${t('perDollar', { rate: fmtNumber(p2p?.sell) })}</div></div><div class="end strong num">Bs ${fmtNumber(atP2p)}</div></div>
      <div class="row"><div class="grow">${t('difference')}</div><div class="end num">Bs ${fmtNumber(atP2p - atBcb)}</div></div>`;
  }
  const atBcb = amount / (bcb?.rate ?? NaN);
  const atP2p = amount / (p2p?.buy ?? NaN);
  return `
    <div class="row"><div class="grow">${t('atOfficial')}<div class="sub num">${t('perDollar', { rate: fmtNumber(bcb?.rate) })}</div></div><div class="end strong num">USD ${fmtNumber(atBcb)}</div></div>
    <div class="row"><div class="grow">${t('buyingP2p')}<div class="sub num">${t('perDollar', { rate: fmtNumber(p2p?.buy) })}</div></div><div class="end strong num">USD ${fmtNumber(atP2p)}</div></div>
    <div class="row"><div class="grow">${t('difference')}</div><div class="end num">USD ${fmtNumber(atP2p - atBcb)}</div></div>`;
}

function screenCalc() {
  const usd = state.calc.dir === 'usd2bs';
  return `
  <main class="screen">
    <div class="title-row"><div><h1 class="title">${t('calc')}</h1><p class="subtitle">${t('calcSubtitle')}</p></div></div>
    <div class="segmented" role="tablist">
      <button data-dir="usd2bs" class="${usd ? 'on' : ''}">${t('haveUsd')}</button>
      <button data-dir="bs2usd" class="${!usd ? 'on' : ''}">${t('haveBs')}</button>
    </div>
    <section class="card pad" style="margin-top:12px">
      <label class="amount-cur" for="amount">${usd ? t('amountUsd') : t('amountBs')}</label>
      <input id="amount" class="amount" inputmode="decimal" autocomplete="off" value="${esc(state.calc.amount)}" />
    </section>
    <div class="section-label">${usd ? t('getBs') : t('getUsd')}</div>
    <section class="card" id="calc-results">${calcResults()}</section>
    <p class="footnote">${t('calcNote')}</p>
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
    <div class="legend"><span><i style="background:var(--text-2)"></i>${t('chartOfficial')}</span><span><i style="background:var(--accent)"></i>${t('chartP2p')}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${t('chartLabel', { n: pts.length })}">
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
    <div class="title-row"><div><h1 class="title">${t('history')}</h1><p class="subtitle">${t('historySubtitle')}</p></div></div>
    ${state.history.length ? chart(state.history) + `<div class="section-label">${t('days')}</div><section class="card">${rows}</section>` : `<div class="card empty">${t('noHistory')}</div>`}
  </main>`;
}

function screenSettings() {
  const s = state.settings;
  const seg = (key, options) => `<div class="segmented" data-seg="${key}">${options.map(([v, l]) => `<button data-value="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `
  <main class="screen">
    <div class="title-row"><div><h1 class="title">${t('settings')}</h1></div></div>

    <div class="section-label">${t('autoUpdate')}</div>
    <section class="card">
      <div class="row"><div class="grow">${t('dailyUpdate')}<div class="sub">${t('evenClosed')}</div></div>
        <label class="switch"><input type="checkbox" data-toggle="autoUpdate" ${s.autoUpdate ? 'checked' : ''}><span></span></label></div>
      <div class="row"><div class="grow">${t('time')}</div>
        <input type="time" class="time-input" data-time="updateTime" value="${esc(s.updateTime)}" ${s.autoUpdate ? '' : 'disabled'}></div>
      <div class="row"><div class="grow">${t('notifyMe')}<div class="sub">${t('notifyWhat')}</div></div>
        <label class="switch"><input type="checkbox" data-toggle="notify" ${s.notify ? 'checked' : ''} ${s.autoUpdate ? '' : 'disabled'}><span></span></label></div>
      ${isNative() ? `<button class="row" data-action="run-now"><div class="grow">${t('tryNow')}</div><div class="end">${t('tryNowWhat')}</div></button>` : ''}
    </section>
    <p class="footnote">${t('autoNote')}</p>

    <div class="section-label">${t('parallelSection')}</div>
    <section class="card pad">
      <div style="margin-bottom:8px">${t('gapPrice')}</div>
      ${seg('gapSide', [['mid', t('mid')], ['buy', t('buy')], ['sell', t('sell')]])}
      <div style="margin:16px 0 8px">${t('adsForMedian')}</div>
      ${seg('adsCount', [[5, '5'], [10, '10'], [20, '20']])}
    </section>

    <div class="section-label">${t('appearance')}</div>
    <section class="card pad">${seg('theme', [['system', t('system')], ['dark', t('dark')], ['oled', 'OLED'], ['light', t('light')]])}</section>

    <div class="section-label">${t('language')}</div>
    <section class="card pad">${seg('language', [['system', t('system')], ['es', 'Español'], ['en', 'English']])}</section>

    <div class="section-label">${t('data')}</div>
    <section class="card">
      <button class="row" data-action="export" ${state.history.length ? '' : 'disabled'}><div class="grow">${t('exportHistory')}<div class="sub">${state.history.length ? t(state.history.length === 1 ? 'exportOne' : 'exportMany', { n: state.history.length }) : t('noDaysYet')}</div></div></button>
      <button class="row" data-action="import"><div class="grow">${t('importHistory')}<div class="sub">${t('importWhat')}</div></div></button>
      <button class="row danger" data-action="ask-clear"><div class="grow">${t('clearHistory')}</div></button>
    </section>

    <div class="section-label">${t('about')}</div>
    <section class="card">
      <div class="row"><div class="grow">${t('version')}</div><div class="end">${esc(VERSION)}</div></div>
      <div class="row"><div class="grow">${t('officialSrc')}<div class="sub">${t('officialSrcSub')}</div></div></div>
      <div class="row"><div class="grow">${t('banksSrc')}<div class="sub">${t('banksSrcSub')}</div></div></div>
      <div class="row"><div class="grow">${t('parallelSrc')}<div class="sub">Binance P2P, USDT/BOB</div></div></div>
      <div class="row"><div class="grow">${t('backupSrc')}<div class="sub">${t('backupSrcSub')}</div></div></div>
    </section>
    <p class="footnote">${t('disclaimer')}<br>${t('rights')}</p>
  </main>`;
}

function sheet() {
  if (state.sheet !== 'clear') return '';
  return `
  <div class="sheet-backdrop" data-action="close-sheet">
    <div class="sheet" role="dialog" aria-modal="true">
      <h3>${t('clearTitle')}</h3>
      <p>${t('clearText')}</p>
      <div class="actions">
        <button class="btn danger block" data-action="clear">${t('clearHistory')}</button>
        <button class="btn ghost block" data-action="close-sheet">${t('cancel')}</button>
      </div>
    </div>
  </div>`;
}

function tabbar() {
  const tabs = [['today', t('today')], ['calc', t('calc')], ['banks', t('banks')], ['history', t('history')], ['settings', t('settings')]];
  return `<nav class="tabbar"><div class="tabbar-inner">${tabs.map(([k, l]) => `<button class="tab ${state.tab === k ? 'on' : ''}" data-tab="${k}">${svg(k === 'today' ? 'today' : k)}${l}</button>`).join('')}</div></nav>`;
}

function render() {
  const screens = { today: screenToday, calc: screenCalc, banks: screenBanks, history: screenHistory, settings: screenSettings };
  const scroll = window.scrollY;
  root.innerHTML = screens[state.tab]() + tabbar() + sheet();
  window.scrollTo(0, scroll);
}

// ---------------------------------------------------------------- events
async function updateSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  if (key === 'theme') applyTheme();
  if (key === 'language') setLanguage(value);
  await saveSettings(state.settings);
  if (key === 'adsCount') refresh({ silent: true });
  render();
}

// The file input lives outside #app: Android re-renders the screen when it comes back from the
// file picker, and an input inside #app would be gone before it reports the chosen file.
function pickImportFile() {
  const input = Object.assign(document.createElement('input'), {
    type: 'file', accept: '.csv,text/csv,text/comma-separated-values,text/plain', hidden: true,
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const { entries, skipped } = parseHistoryCsv(await file.text());
      if (!entries.length) throw new Error(t('noValidDay'));
      const r = await importHistory(entries);
      state.history = r.history;
      render();
      const parts = [t(r.added === 1 ? 'newDay' : 'newDays', { n: r.added })];
      if (r.kept) parts.push(t(r.kept === 1 ? 'keptDay' : 'keptDays', { n: r.kept }));
      if (skipped) parts.push(t(skipped === 1 ? 'badRow' : 'badRows', { n: skipped }));
      toast(t('imported', { parts: parts.join(' · ') }));
    } catch (err) {
      toast(t('importFailed', { msg: err?.message || err }));
    }
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}

root.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-tab],[data-action],[data-dir],[data-seg] button');
  if (!el) return;
  if (el.dataset.tab) {
    state.tab = el.dataset.tab;
    window.scrollTo(0, 0);
    render();
    return;
  }
  if (el.dataset.dir) {
    state.calc.dir = el.dataset.dir;
    state.calc.amount = el.dataset.dir === 'usd2bs' ? '100' : '1000';
    render();
    return;
  }
  const seg = el.closest('[data-seg]');
  if (seg) {
    const key = seg.dataset.seg;
    const raw = el.dataset.value;
    await updateSetting(key, key === 'adsCount' ? Number(raw) : raw);
    return;
  }
  switch (el.dataset.action) {
    case 'refresh': refresh(); break;
    case 'export':
      if (!state.history.length) break;
      try {
        const shared = await shareFile(exportFileName(localDay()), historyToCsv(state.history), {
          title: t('shareTitle'), dialogTitle: t('shareDialog'),
        });
        if (shared && !isNative()) toast(t('downloaded'));
      } catch (err) {
        toast(t('exportFailed', { msg: err?.message || err }));
      }
      break;
    case 'import': pickImportFile(); break;
    case 'ask-clear': state.sheet = 'clear'; render(); break;
    case 'close-sheet':
      // A tap inside the sheet bubbles up to the backdrop: only the backdrop itself or Cancel closes it.
      if (el.classList.contains('sheet-backdrop') && e.target.closest('.sheet')) break;
      state.sheet = null;
      render();
      break;
    case 'clear':
      await clearHistory();
      state.history = [];
      state.sheet = null;
      render();
      toast(t('cleared'));
      break;
    case 'run-now':
      toast(t('checkingBg'));
      try {
        await ensureNotificationPermission();
        const r = await runRunnerNow();
        await pullBackground();
        render();
        toast(r && r.ok ? t('bgDone') : t('bgFailed'));
      } catch (err) {
        toast(t('error', { msg: err?.message || err }));
      }
      break;
  }
});

root.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.toggle) {
    if (el.dataset.toggle === 'notify' && el.checked) {
      const p = await ensureNotificationPermission();
      if (p !== 'granted') {
        toast(t('allowNotifications'));
        el.checked = false;
        return;
      }
    }
    await updateSetting(el.dataset.toggle, el.checked);
  }
  if (el.dataset.time && /^\d{2}:\d{2}$/.test(el.value)) await updateSetting(el.dataset.time, el.value);
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
  setLanguage(state.settings.language);
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
