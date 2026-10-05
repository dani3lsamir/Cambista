// Cambista — rates core
// Copyright (c) 2026 dani3lsamir. All rights reserved.
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
};

// "12,00" -> 12 ; "1.234,56" -> 1234.56 ; "12.45" -> 12.45
export function parseLocaleNumber(text) {
  if (typeof text === 'number') return text;
  if (typeof text !== 'string') return NaN;
  let s = text.trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Reads the "Tipo de cambio oficial" block on the BCB home page.
// Text on 2026-10-05: "Tipo de cambio oficial Bolivianos por dólar estadounidense
// VIGENTE PARA EL SÁBADO 3, DOMINGO 4 Y LUNES 5 DE OCTUBRE, 2026 12,00"
export function parseBcbHome(html) {
  const text = htmlToText(html);
  const start = text.search(/tipo de cambio oficial/i);
  if (start < 0) throw new Error('BCB: no se encontró "Tipo de cambio oficial"');
  const block = text.slice(start, start + 400);
  const validityMatch = block.match(/VIGENTE\s+PARA\s+(.+?\d{4})/i);
  const afterValidity = validityMatch ? block.slice(block.indexOf(validityMatch[0]) + validityMatch[0].length) : block;
  const rateMatch = afterValidity.match(/(\d{1,2}[.,]\d{2,4})/);
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

export function binanceRequestBody(tradeType, rows) {
  return JSON.stringify({
    fiat: 'BOB',
    asset: 'USDT',
    tradeType, // 'BUY' = ads where you buy USDT ; 'SELL' = ads where you sell USDT
    page: 1,
    rows,
    payTypes: [],
    publisherType: null,
    countries: [],
  });
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

// paralelo.bo: { median, compra, venta, ... }
export function parseParaleloBo(json) {
  const buy = parseLocaleNumber(String(json && json.compra));
  const sell = parseLocaleNumber(String(json && json.venta));
  const mid = parseLocaleNumber(String(json && (json.median !== undefined ? json.median : json.mediana)));
  return { buy, sell, mid };
}

export async function readText(res) {
  if (res && typeof res.text === 'function') return await res.text();
  if (res && typeof res.json === 'function') return JSON.stringify(await res.json());
  if (res && typeof res.data === 'string') return res.data;
  return JSON.stringify(res && res.data);
}

export async function getText(fetchFn, url, options) {
  const res = await fetchFn(url, options);
  if (res && res.ok === false) throw new Error('HTTP ' + res.status + ' en ' + url);
  return await readText(res);
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

export function fmtNumber(n, decimals) {
  if (!Number.isFinite(n)) return '—';
  const d = decimals === undefined ? 2 : decimals;
  const fixed = Math.abs(n).toFixed(d);
  const parts = fixed.split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '−' : '') + int + (parts[1] ? ',' + parts[1] : '');
}

export function fmtPercent(ratio) {
  if (!Number.isFinite(ratio)) return '—';
  const sign = ratio > 0 ? '+' : ratio < 0 ? '−' : '';
  return sign + fmtNumber(Math.abs(ratio) * 100, 1) + '%';
}

export function notificationText(snapshot, settings) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const bcb = snapshot && snapshot.bcb ? snapshot.bcb.rate : NaN;
  const ref = p2pReference(snapshot && snapshot.p2p, s.gapSide);
  const parts = [];
  if (Number.isFinite(bcb)) parts.push('BCB ' + fmtNumber(bcb));
  if (Number.isFinite(ref)) parts.push('P2P ' + fmtNumber(ref));
  const g = gap(ref, bcb);
  if (Number.isFinite(g)) parts.push('Brecha ' + fmtPercent(g));
  return parts.length ? parts.join(' · ') : 'No se pudo actualizar. Abre la app para reintentar.';
}
