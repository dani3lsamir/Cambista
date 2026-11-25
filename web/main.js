// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
import './styles.css';
import { fmtNumber, fmtPercent, parseAmountInput } from '../src/core/rates-core.js';
import { lang, setLanguage, t } from '../src/i18n.js';
import { BOLIVIA_TIME_ZONE, bcbValidOn, boliviaDay, emptyMarket, estimateForAmount, quoteComparison } from './market.js';
import { rateChart } from './chart.js';

const $ = (id) => document.getElementById(id);
const amountInput = $('amount');
const currencyInput = $('currency');
const updateChart = rateChart($('chart'), $('chart-reading'));
const themeButton = $('theme');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const THEME_KEY = 'cambista-web-theme';
const DEMO = new URLSearchParams(location.search).has('demo');
const STALE_MINUTES = 90;
let market = emptyMarket();
let loading = true;
let range = '30';
let theme;
try {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') theme = stored;
} catch {
  // The toggle still works for this page when storage is unavailable.
}

function applyTheme() {
  const current = theme ?? (systemTheme.matches ? 'dark' : 'light');
  const dark = current === 'dark';
  document.documentElement.dataset.theme = current;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement)
    .getPropertyValue('--page-bg').trim();
  themeButton.setAttribute('aria-label', t('webNightMode'));
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.textContent = dark ? '☀' : '☾';
}

function date(value, includeTime = false) {
  return new Intl.DateTimeFormat(t('locale'), {
    timeZone: BOLIVIA_TIME_ZONE, dateStyle: 'medium', ...(includeTime && { timeStyle: 'short' }),
  }).format(new Date(value));
}

function convert() {
  const amount = parseAmountInput(amountInput.value, lang());
  const p2p = market.latest.p2p;
  const currency = currencyInput.value;
  const quote = estimateForAmount(p2p, amount, currency);
  const output = currency === 'BOB' ? 'USDT' : lang() === 'es' ? 'Bs' : 'BOB';
  $('result').textContent = quote ? `${fmtNumber(quote.result, 2, lang())} ${output}` : '—';
  const ads = currency === 'BOB' ? p2p?.buyAds : p2p?.sellAds;
  $('conversion-note').textContent = quote
    ? t(quote.matched ? 'webQuote' : ads?.length ? 'webNoMatch' : 'webReference', { rate: fmtNumber(quote.rate, 3, lang()) })
    : amountInput.value && !(amount > 0) ? t('webInvalidAmount') : '';
}

function render() {
  applyTheme();
  for (const node of document.querySelectorAll('[data-text]')) node.textContent = t(node.dataset.text);
  for (const node of document.querySelectorAll('[data-label]')) node.setAttribute('aria-label', t(node.dataset.label));
  const language = $('language');
  language.textContent = lang() === 'es' ? 'EN' : 'ES';
  language.setAttribute('aria-label', lang() === 'es' ? 'English' : 'Español');
  document.title = `Cambista · ${t('webTitle')}`;
  const now = Date.now();
  const today = boliviaDay(now);
  $('local-date').dateTime = today;
  $('local-date').textContent = date(now);
  const { bcb, p2p } = market.latest;
  const p2pDelayed = p2p && now - Date.parse(p2p.at) > STALE_MINUTES * 60 * 1000;
  $('notice').textContent = DEMO ? t('webDemo') : loading ? t('webLoading') : !bcb && !p2p ? t('webEmpty') : '';

  $('official').textContent = fmtNumber(bcb?.rate, 2, lang());
  $('parallel').textContent = fmtNumber(p2p?.mid, 3, lang());
  $('buy').textContent = fmtNumber(p2p?.buy, 3, lang());
  $('sell').textContent = fmtNumber(p2p?.sell, 3, lang());
  const officialStatus = bcbValidOn(bcb, today) ? 'webValid' : bcb?.from > today ? 'webValidFrom' : 'webOfficialExpired';
  const officialDate = officialStatus === 'webValidFrom' ? bcb.from : bcb?.through;
  $('official-date').textContent = bcb ? t(officialStatus, { date: date(`${officialDate}T12:00:00Z`) })
    : loading ? '' : t('webOfficialMissing');
  $('official-date').toggleAttribute('data-delayed', !loading && officialStatus !== 'webValid');
  $('parallel-time').textContent = p2p ? t(p2pDelayed ? 'webP2pDelayed' : 'webObserved', { date: date(p2p.at, true), minutes: STALE_MINUTES })
    : loading ? '' : t('webP2pMissing');
  $('parallel-time').toggleAttribute('data-delayed', !loading && (!p2p || p2pDelayed));

  const comparison = quoteComparison(bcb, p2p);
  $('gap').textContent = fmtPercent(comparison?.ratio, lang());
  $('gap-amount').hidden = !comparison;
  $('gap-amount').textContent = comparison ? t('webGapAmount', { value: new Intl.NumberFormat(t('locale'), {
    signDisplay: 'exceptZero', minimumFractionDigits: 3, maximumFractionDigits: 3,
  }).format(comparison.amount) }) : '';
  $('gap-note').textContent = comparison ? (p2pDelayed || comparison.day !== today ? t('webGapDate', { date: date(comparison.at) }) : '')
    : loading ? '' : t(bcb && p2p ? 'webGapDifferentDays' : 'webGapMissing');
  convert();
  updateChart(market, range, now);
}

async function loadMarket() {
  if (DEMO) {
    const { demoHistory } = await import('../src/demo.js');
    const daily = demoHistory();
    const now = Date.now();
    const at = new Date(now).toISOString();
    const today = boliviaDay(now);
    const last = daily.at(-1);
    const recent = Array.from({ length: 12 }, (_, index) => ({
      at: new Date(now - (11 - index) * 30 * 60 * 1000).toISOString(),
      bcb: last.bcb,
      mid: last.mid + Math.sin(index) * 0.04,
    }));
    return { daily, recent, latest: {
      bcb: { rate: last.bcb, from: today, through: today, at },
      p2p: { mid: last.mid, buy: last.buy, sell: last.sell, at, buyAds: [], sellAds: [] },
    } };
  }
  const response = await fetch(new URL('./data/market.json', document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.version !== 1) throw new Error('Unsupported market data version.');
  return data;
}

$('language').addEventListener('click', () => {
  setLanguage(lang() === 'es' ? 'en' : 'es');
  render();
});
themeButton.addEventListener('click', () => {
  theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  render();
});
systemTheme.addEventListener('change', () => {
  if (!theme) render();
});
amountInput.addEventListener('input', convert);
currencyInput.addEventListener('change', convert);
const buttons = [...document.querySelectorAll('[data-range]')];
for (const button of buttons) button.addEventListener('click', () => {
  range = button.dataset.range;
  for (const candidate of buttons) candidate.setAttribute('aria-pressed', String(candidate === button));
  updateChart(market, range, Date.now());
});

render();
loadMarket().then((data) => { market = data; })
  .catch((error) => console.info('No market data available:', error.message))
  .finally(() => {
    loading = false;
    render();
  });
