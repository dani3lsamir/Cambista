// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SETTINGS, SOURCES, binanceRequestBody, getJson, getText,
  isPlausibleRate, median, parseBcbHome, parseLocaleNumber,
} from '../src/core/rates-core.js';
import { boliviaDay, emptyMarket, recordSample } from '../web/market.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const OFFICIAL_HISTORY = 'https://www.bcb.gob.bo/grafico_evolutivo/download.php?serie=tipo_de_cambio&format=json';
// The BCB download combines different methodologies. Only the TCO period belongs in this series.
const TCO_START = '2026-06-29';

export function officialValidity(label) {
  const year = Number(label?.match(/\b\d{4}\b/)?.[0]);
  const dates = [...(label || '').toLowerCase().matchAll(/\b(\d{1,2})\b(?:\s+de\s+([a-z]+))?/g)];
  const last = dates.at(-1);
  if (!year || !last || !MONTHS.includes(last[2])) return null;
  let month = MONTHS.indexOf(last[2]);
  // Resolve dates written without a month from the right, accounting for a weekend across months.
  const days = [];
  let anchor = new Date(Date.UTC(year, month, Number(last[1])));
  for (const [, day, namedMonth] of dates.reverse()) {
    const precedingMonth = Number(day) > anchor.getUTCDate() ? month - 1 : month;
    month = namedMonth ? MONTHS.indexOf(namedMonth) : precedingMonth;
    if (namedMonth && month < 0) return null;
    let date = new Date(Date.UTC(anchor.getUTCFullYear(), month, Number(day)));
    if (date > anchor) date = new Date(Date.UTC(anchor.getUTCFullYear() - 1, month, Number(day)));
    if (date.getUTCDate() !== Number(day)) return null;
    days.push(date.toISOString().slice(0, 10));
    anchor = date;
    month = date.getUTCMonth();
  }
  return { from: days.at(-1), through: days[0] };
}

export async function readOfficial(fetchFn, today) {
  const html = await getText(fetchFn, SOURCES.bcb, { headers: { Accept: 'text/html' } });
  const quote = parseBcbHome(html);
  const validity = officialValidity(quote.validity);
  if (!validity || today < validity.from || today > validity.through) {
    throw new Error('BCB did not publish a rate applicable to the current Bolivia date.');
  }
  return { rate: quote.rate, from: validity.from, through: validity.through };
}

export async function readOfficialHistory(fetchFn, today) {
  const result = await getJson(fetchFn, OFFICIAL_HISTORY, { headers: { Accept: 'application/json' } });
  const rows = (result.datos ?? []).flatMap(({ Fecha, Valor }) => {
    const official = typeof Fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(Fecha)
      && Fecha >= TCO_START && Fecha < today && isPlausibleRate(Valor);
    return official ? [{ day: Fecha, bcb: Valor }] : [];
  });
  if (!rows.length) throw new Error('The BCB download contained no historical official rates.');
  return rows;
}

function parseBook(json) {
  if (!Array.isArray(json.data)) throw new Error('Binance P2P did not return advertisements.');
  const prices = [];
  const ads = [];
  for (const { adv } of json.data) {
    if (!adv) continue;
    const price = parseLocaleNumber(adv.price);
    if (!isPlausibleRate(price)) continue;
    prices.push(price);
    const min = parseLocaleNumber(adv.minSingleTransAmount);
    const max = parseLocaleNumber(adv.dynamicMaxSingleTransAmount ?? adv.maxSingleTransAmount);
    const available = parseLocaleNumber(adv.tradableQuantity ?? adv.surplusAmount);
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min && available > 0) {
      ads.push({ price, min, max, available });
    }
  }
  if (!prices.length) throw new Error('Binance P2P did not return any valid prices.');
  return { rate: median(prices.slice(0, DEFAULT_SETTINGS.adsCount)), ads };
}

export async function readMarket(fetchFn) {
  const side = async (direction) => parseBook(await getJson(fetchFn, SOURCES.binance, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: binanceRequestBody(direction, 20),
  }));
  const [buy, sell] = await Promise.all([side('BUY'), side('SELL')]);
  return { buy: buy.rate, sell: sell.rate, mid: (buy.rate + sell.rate) / 2, buyAds: buy.ads, sellAds: sell.ads };
}

async function updateMarket(file) {
  let previous = emptyMarket();
  try {
    previous = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous.version !== 1) throw new Error('Unsupported market data version.');
  const at = new Date();
  const today = boliviaDay(at);
  const [bcb, p2p, officialHistory] = await Promise.allSettled([
    readOfficial(fetch, today), readMarket(fetch),
    previous.officialHistoryImported ? null : readOfficialHistory(fetch, today),
  ]);
  [bcb, p2p].forEach((reading, index) => {
    const source = index === 0 ? 'BCB' : 'Binance P2P';
    if (reading.status === 'rejected') console.warn(`${source} unavailable: ${reading.reason.message}`);
    else console.log(`${source} updated.`);
  });
  if (officialHistory.value) {
    const combined = new Map(officialHistory.value.map((row) => [row.day, row]));
    for (const row of previous.daily) combined.set(row.day, { ...combined.get(row.day), ...row });
    previous.daily = [...combined.values()];
    previous.officialHistoryImported = true;
    console.log(`BCB historical series read (${officialHistory.value.length} days).`);
  } else if (officialHistory.status === 'rejected') {
    console.warn(`BCB historical series unavailable: ${officialHistory.reason.message}`);
  }
  const market = recordSample(previous, at, bcb.value, p2p.value);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(market) + '\n');
  await rename(temporary, file);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/collect-market.mjs <market.json>');
  await updateMarket(resolve(process.argv[2]));
}
