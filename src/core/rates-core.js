// Cambista — rates core
// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Pure logic shared by the app and the background runner.
// Rules for this file (the runner build depends on them):
//   - no imports, no DOM, no Capacitor APIs
//   - every top-level declaration starts with `export function` or `export const`
//   - network access only through the `fetchFn` argument

export const SOURCES = {
  bcb: 'https://www.bcb.gob.bo/',
  binance: 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
  dolarapiOficial: 'https://bo.dolarapi.com/v1/dolares/oficial',
  dolarapiBinance: 'https://bo.dolarapi.com/v1/dolares/binance',
  paraleloBo: 'https://paralelo.bo/api/v1/rate',
};

export const DEFAULT_SETTINGS = {
  autoUpdate: true,
  updateTime: '09:00',
  notify: true,
  gapSide: 'mid', // 'mid' | 'buy' | 'sell'
  adsCount: 10,
  theme: 'system', // 'system' | 'dark' | 'light'
  language: 'system', // 'system' | 'es' | 'en'
};

// Language the app shows: the user's choice, or the phone's language (Spanish if it is
// Spanish, English otherwise).
export function pickLanguage(setting, deviceLanguage) {
  if (setting === 'es' || setting === 'en') return setting;
  return /^es\b/i.test(String(deviceLanguage || 'es')) ? 'es' : 'en';
}

// "12,00" -> 12 ; "1.234,56" -> 1234.56 ; "1,234.56" -> 1234.56 ; "12.45" -> 12.45 ; "" -> NaN
export function parseLocaleNumber(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
  if (typeof text !== 'string') return NaN;
  let s = text.trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    // the last separator is the decimal one
    s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Amount typed by the user. Phone keyboards may offer "." or "," as the decimal key whatever the
// app language, so a single separator followed by exactly 3 digits is read as thousands only when
// it is the language's thousands separator ("." in Spanish, "," in English); otherwise it is the decimal point.
// es: "100.50" -> 100.5 ; "1.000" -> 1000 ; "1.234,5" -> 1234.5   en: "1,000" -> 1000 ; "100,5" -> 100.5
export function parseAmountInput(text, lang) {
  const s = String(text == null ? '' : text).replace(/\s/g, '');
  if (!/^\d*[.,]?[\d.,]*$/.test(s) || !/\d/.test(s)) return NaN;
  const thousands = lang === 'en' ? ',' : '.';
  let plain;
  if (s.includes('.') && s.includes(',')) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const parts = s.split(dec);
    if (parts.length !== 2) return NaN;
    plain = parts[0].replace(/[.,]/g, '') + '.' + parts[1];
  } else {
    const sep = s.includes('.') ? '.' : s.includes(',') ? ',' : '';
    const parts = sep ? s.split(sep) : [s];
    if (parts.length > 2) {
      // "1.000.000": only valid as the language's thousands separator with groups of 3 digits
      const groups = sep === thousands && parts[0].length >= 1 && parts[0].length <= 3 && parts.slice(1).every((p) => p.length === 3);
      if (!groups) return NaN;
      plain = parts.join('');
    }
    else if (parts.length === 2 && sep === thousands && parts[1].length === 3 && parts[0] !== '') plain = parts.join('');
    else plain = parts.join('.');
  }
  return /^\d*\.?\d+$|^\d+\.$/.test(plain) ? Number(plain) : NaN;
}

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Reads the "Tipo de cambio oficial" block on the BCB home page.
// Text on 2026-11-17: "Tipo de cambio oficial Bolivianos por dólar estadounidense
// MARTES 17 DE NOVIEMBRE, 2026 Bs --> 11,70"
// Text on 2026-10-05: "Tipo de cambio oficial Bolivianos por dólar estadounidense
// VIGENTE PARA EL SÁBADO 3, DOMINGO 4 Y LUNES 5 DE OCTUBRE, 2026 12,00"
export function parseBcbHome(html) {
  const text = htmlToText(html);
  const start = text.search(/tipo de cambio oficial/i);
  if (start < 0) throw new Error('BCB: no se encontró "Tipo de cambio oficial"');
  let block = text.slice(start, start + 400);
  // The block ends where the next link or indicator starts (gold, UFV...): without this, a missing
  // value would make the parser take "3.845,96" (gold) as the dollar rate.
  const end = block.search(/m[aá]s informaci[oó]n|tabla de cotizaciones|microdatos/i);
  if (end > 0) block = block.slice(0, end);
  // Since the flexible rate (2026) the page shows one date: "MARTES 17 DE NOVIEMBRE, 2026 Bs 11,70"
  const validityMatch = block.match(/VIGENTE\s+PARA\s+(.+?\d{4})/i) ||
    block.match(/((?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+)?\d{1,2}\s+de\s+[a-zñ]+,?\s+\d{4})/i);
  const afterValidity = validityMatch ? block.slice(block.indexOf(validityMatch[0]) + validityMatch[0].length) : block;
  // A whole number like 11,70, never digits taken out of a bigger one (no lookbehind: older JS engines)
  const rateMatch = afterValidity.match(/(?:^|[^\d.,])(\d{1,2}[.,]\d{2,4})(?![\d.,])/);
  if (!rateMatch) throw new Error('BCB: no se encontró el valor');
  const rate = parseLocaleNumber(rateMatch[1]);
  if (!isPlausibleRate(rate)) throw new Error('BCB: valor fuera de rango (' + rateMatch[1] + ')');
  return {
    rate,
    validity: validityMatch ? capitalizeFirst(validityMatch[1].toLowerCase()) : null,
  };
}

export function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Bs per USD has been between ~6 and ~30 in any realistic scenario; anything else is a parse error.
export function isPlausibleRate(n) {
  return Number.isFinite(n) && n > 3 && n < 60;
}

export function median(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// transAmount (optional, in Bs): Binance then lists only ads whose minimum and maximum accept it
export function binanceRequestBody(tradeType, rows, transAmount) {
  const body = {
    fiat: 'BOB',
    asset: 'USDT',
    tradeType, // 'BUY' = ads where you buy USDT ; 'SELL' = ads where you sell USDT
    page: 1,
    rows,
    payTypes: [],
    publisherType: null,
    countries: [],
  };
  if (Number.isFinite(transAmount) && transAmount > 0) body.transAmount = String(Math.ceil(transAmount));
  return JSON.stringify(body);
}

// Binance P2P search response -> list of prices
export function parseBinanceAds(json) {
  const data = json && Array.isArray(json.data) ? json.data : null;
  if (!data) throw new Error('Binance: respuesta sin anuncios');
  const prices = data
    .map((d) => parseLocaleNumber(String(d && d.adv && d.adv.price)))
    .filter(isPlausibleRate);
  if (!prices.length) throw new Error('Binance: ningún precio válido');
  return prices;
}

// DolarApi style: { compra, venta, fechaActualizacion }
export function parseCompraVenta(json) {
  const buy = parseLocaleNumber(String(json && json.compra));
  const sell = parseLocaleNumber(String(json && json.venta));
  return { buy, sell, updatedAt: (json && json.fechaActualizacion) || null };
}

// paralelo.bo: { buy, sell, median, ... } since November 2026; before that { median, compra, venta }
export function parseParaleloBo(json) {
  const pick = (...keys) => {
    const k = keys.find((key) => json && json[key] !== undefined && json[key] !== null);
    return parseLocaleNumber(String(k ? json[k] : undefined));
  };
  return { buy: pick('buy', 'compra'), sell: pick('sell', 'venta'), mid: pick('median', 'mediana') };
}

export async function readText(res) {
  if (res && typeof res.text === 'function') return await res.text();
  if (res && typeof res.json === 'function') return JSON.stringify(await res.json());
  if (res && typeof res.data === 'string') return res.data;
  return JSON.stringify(res && res.data);
}

// A site that never answers must not block the reading: after this time the backup source is used.
export const FETCH_TIMEOUT_MS = 15000;

// Rejects if `promise` takes longer than `ms`. Works in the app and in the background runner
// (which has setTimeout but no AbortController, so the request itself is not cancelled).
export function withTimeout(promise, ms, url) {
  if (typeof setTimeout !== 'function') return promise;
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Sin respuesta en ' + Math.round(ms / 1000) + ' s: ' + url)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function getText(fetchFn, url, options) {
  return withTimeout((async () => {
    const res = await fetchFn(url, options);
    if (res && res.ok === false) throw new Error('HTTP ' + res.status + ' en ' + url);
    return await readText(res);
  })(), FETCH_TIMEOUT_MS, url);
}

export async function getJson(fetchFn, url, options) {
  return JSON.parse(await getText(fetchFn, url, options));
}

export async function fetchBcb(fetchFn) {
  try {
    const html = await getText(fetchFn, SOURCES.bcb, { method: 'GET', headers: { Accept: 'text/html' } });
    const r = parseBcbHome(html);
    return { rate: r.rate, validity: r.validity, source: 'BCB' };
  } catch (e) {
    const j = await getJson(fetchFn, SOURCES.dolarapiOficial, { method: 'GET' });
    const cv = parseCompraVenta(j);
    const rate = isPlausibleRate(cv.sell) ? cv.sell : cv.buy;
    if (!isPlausibleRate(rate)) throw new Error('Oficial: ninguna fuente respondió (' + e.message + ')');
    return { rate, validity: null, source: 'DolarApi (respaldo)' };
  }
}

export async function fetchBinanceSide(fetchFn, tradeType, rows) {
  const json = await getJson(fetchFn, SOURCES.binance, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: binanceRequestBody(tradeType, rows),
  });
  const prices = parseBinanceAds(json).slice(0, rows);
  return { price: median(prices), count: prices.length };
}

// Price for a real trade of `fiatAmount` Bs: the best `rows` ads that accept that amount, best first.
// Returns { best, median, count, total }: best = best price among those ads, count = ads used,
// total = all ads that accept the amount (null if Binance does not say). count 0 = no ad accepts it.
export async function fetchPriceForAmount(fetchFn, tradeType, fiatAmount, rows) {
  const n = rows || 5;
  const json = await getJson(fetchFn, SOURCES.binance, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: binanceRequestBody(tradeType, n, fiatAmount),
  });
  const total = json && Number.isFinite(json.total) ? json.total : null;
  if (json && Array.isArray(json.data) && !json.data.length) return { best: NaN, median: NaN, count: 0, total: 0 };
  const prices = parseBinanceAds(json).slice(0, n);
  const best = tradeType === 'BUY' ? Math.min(...prices) : Math.max(...prices);
  return { best, median: median(prices), count: prices.length, total };
}

// Third-party sites label compra/venta from different points of view, so the sides are
// normalised: buy = what you pay (the higher price), sell = what you receive (the lower one).
export function orderSides(a, b) {
  return { buy: Math.max(a, b), sell: Math.min(a, b) };
}

export async function fetchP2p(fetchFn, rows) {
  try {
    const [buy, sell] = await Promise.all([
      fetchBinanceSide(fetchFn, 'BUY', rows),
      fetchBinanceSide(fetchFn, 'SELL', rows),
    ]);
    return { buy: buy.price, sell: sell.price, mid: (buy.price + sell.price) / 2, count: Math.min(buy.count, sell.count), source: 'Binance P2P' };
  } catch (e) {
    try {
      const p = parseParaleloBo(await getJson(fetchFn, SOURCES.paraleloBo, { method: 'GET' }));
      if (!isPlausibleRate(p.buy) || !isPlausibleRate(p.sell)) throw new Error('paralelo.bo: datos incompletos');
      return Object.assign(orderSides(p.buy, p.sell), { mid: isPlausibleRate(p.mid) ? p.mid : (p.buy + p.sell) / 2, count: null, source: 'paralelo.bo (respaldo)' });
    } catch (e2) {
      const d = parseCompraVenta(await getJson(fetchFn, SOURCES.dolarapiBinance, { method: 'GET' }));
      if (!isPlausibleRate(d.buy) || !isPlausibleRate(d.sell)) throw new Error('P2P: ninguna fuente respondió (' + e.message + ')');
      return Object.assign(orderSides(d.buy, d.sell), { mid: (d.buy + d.sell) / 2, count: null, source: 'DolarApi (respaldo)' });
    }
  }
}

// One full reading. Never throws: failures are reported per source.
export async function fetchSnapshot(fetchFn, settings, now) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const at = now || new Date();
  const [bcb, p2p] = await Promise.allSettled([fetchBcb(fetchFn), fetchP2p(fetchFn, s.adsCount)]);
  return {
    at: at.toISOString(),
    day: localDay(at),
    bcb: bcb.status === 'fulfilled' ? bcb.value : null,
    p2p: p2p.status === 'fulfilled' ? p2p.value : null,
    failed: [bcb.status === 'rejected' ? 'bcb' : null, p2p.status === 'rejected' ? 'p2p' : null].filter(Boolean),
    errors: [
      bcb.status === 'rejected' ? String(bcb.reason && bcb.reason.message || bcb.reason) : null,
      p2p.status === 'rejected' ? String(p2p.reason && p2p.reason.message || p2p.reason) : null,
    ].filter(Boolean),
  };
}

// Price a person actually gets in P2P:
//  - "buy"  = what you PAY to buy 1 USDT (the higher one)
//  - "sell" = what you RECEIVE when you sell 1 USDT (the lower one)
export function p2pReference(p2p, side) {
  if (!p2p) return NaN;
  if (side === 'buy') return p2p.buy;
  if (side === 'sell') return p2p.sell;
  return p2p.mid;
}

// Gap = P2P / BCB − 1
export function gap(p2pRate, bcbRate) {
  if (!isPlausibleRate(p2pRate) || !isPlausibleRate(bcbRate)) return NaN;
  return p2pRate / bcbRate - 1;
}

// P2P price of one history day for the chosen side ('mid' | 'buy' | 'sell')
export function historyValue(entry, side) {
  if (!entry) return NaN;
  const v = side === 'buy' ? entry.buy : side === 'sell' ? entry.sell : entry.mid;
  return Number.isFinite(v) ? v : NaN;
}

export function addDays(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n, 12)); // noon: a daylight saving change cannot move the day
}

// Latest history day before `today` (usually yesterday), or null
export function lastDayBefore(history, today) {
  let best = null;
  for (const h of history || []) if (h && h.day < today && (!best || h.day > best.day)) best = h;
  return best;
}

// Today's P2P price against the previous `days` days of history (today itself is left out).
// level: 'cheap' when it is lower than at least 75% of those days, 'expensive' when higher than
// at least 75%, 'normal' otherwise, null with fewer than 3 days to compare.
export function compareWithPast(value, history, side, today, days) {
  const from = addDays(today, -days);
  const past = (history || [])
    .filter((h) => h && h.day >= from && h.day < today)
    .map((h) => historyValue(h, side))
    .filter(isPlausibleRate);
  const n = past.length;
  const lower = past.filter((v) => v > value).length; // days when the price was higher than today
  const higher = past.filter((v) => v < value).length; // days when the price was lower than today
  let level = null;
  if (isPlausibleRate(value) && n >= 3) {
    level = lower / n >= 0.75 ? 'cheap' : higher / n >= 0.75 ? 'expensive' : 'normal';
  }
  return { n, lower, higher, level };
}

export function localDay(date) {
  const d = date || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return { h: 9, m: 0 };
  return { h: Math.min(23, Number(m[1])), m: Math.min(59, Number(m[2])) };
}

// Should the daily background update run now?
export function isDue(settings, lastRunDay, now) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  if (!s.autoUpdate) return false;
  const at = now || new Date();
  if (lastRunDay === localDay(at)) return false;
  const t = parseTime(s.updateTime);
  return at.getHours() * 60 + at.getMinutes() >= t.h * 60 + t.m;
}

// Spanish (Bolivia): 1.234,50 ; English: 1,234.50
export function fmtNumber(n, decimals, lang) {
  if (!Number.isFinite(n)) return '—';
  const d = decimals === undefined ? 2 : decimals;
  const en = lang === 'en';
  const fixed = Math.abs(n).toFixed(d);
  const parts = fixed.split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, en ? ',' : '.');
  return (n < 0 && Number(fixed) !== 0 ? '−' : '') + int + (parts[1] ? (en ? '.' : ',') + parts[1] : '');
}

export function fmtPercent(ratio, lang) {
  if (!Number.isFinite(ratio)) return '—';
  const pct = Math.abs(ratio) * 100;
  const sign = Number(pct.toFixed(1)) === 0 ? '' : ratio > 0 ? '+' : '−';
  return sign + fmtNumber(pct, 1, lang) + '%';
}

export function notificationText(snapshot, settings) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const bcb = snapshot && snapshot.bcb ? snapshot.bcb.rate : NaN;
  const ref = p2pReference(snapshot && snapshot.p2p, s.gapSide);
  const en = s.uiLang === 'en';
  const parts = [];
  if (Number.isFinite(bcb)) parts.push('BCB ' + fmtNumber(bcb, 2, s.uiLang));
  if (Number.isFinite(ref)) parts.push('P2P ' + fmtNumber(ref, 2, s.uiLang));
  const g = gap(ref, bcb);
  if (Number.isFinite(g)) parts.push((en ? 'Gap ' : 'Brecha ') + fmtPercent(g, s.uiLang));
  if (parts.length) return parts.join(' · ');
  return en ? 'Could not update. Open the app to try again.' : 'No se pudo actualizar. Abre la app para reintentar.';
}

export function notificationTitle(settings) {
  return settings && settings.uiLang === 'en' ? 'Cambista · today\'s exchange rate' : 'Cambista · tipo de cambio de hoy';
}
