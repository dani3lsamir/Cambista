// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
import { isPlausibleRate } from '../src/core/rates-core.js';

export const BOLIVIA_TIME_ZONE = 'America/La_Paz';
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: BOLIVIA_TIME_ZONE });
const TODAY_WINDOW_MS = 36 * 60 * 60 * 1000;

export function boliviaDay(date) {
  return localDate.format(new Date(date));
}

export function emptyMarket() {
  return { version: 1, officialHistoryImported: false, latest: { bcb: null, p2p: null }, recent: [], daily: [] };
}

// Keep observations for the recent chart and the last valid reading per source per day.
// Failed reads remain empty in the chart and preserve the most recent published quote.
export function recordSample(market, at, bcb, p2p) {
  const stamp = new Date(at).toISOString();
  const day = boliviaDay(at);
  const latest = { ...market.latest };
  const daily = new Map(market.daily.map((row) => [row.day, row]));
  const row = { ...daily.get(day), day };
  if (bcb) {
    latest.bcb = { ...bcb, at: stamp };
    Object.assign(row, { bcb: bcb.rate, bcbAt: stamp });
  }
  if (p2p) {
    latest.p2p = { ...p2p, at: stamp };
    Object.assign(row, { mid: p2p.mid, buy: p2p.buy, sell: p2p.sell, p2pAt: stamp });
  }
  daily.set(day, row);
  const observation = { at: stamp, bcb: bcb?.rate ?? null, mid: p2p?.mid ?? null };
  const cutoff = new Date(Date.parse(stamp) - TODAY_WINDOW_MS).toISOString();
  const recent = market.recent.filter((point) => point.at >= cutoff && point.at < stamp);
  return {
    ...market, latest,
    recent: [...recent, observation],
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export function estimateForAmount(p2p, amount, currency) {
  if (!p2p || !Number.isFinite(amount) || amount <= 0) return null;
  const buying = currency === 'BOB';
  const ads = buying ? p2p.buyAds : p2p.sellAds;
  const eligible = ads.filter(({ price, min, max, available }) => {
    const bob = buying ? amount : amount * price;
    const usdt = buying ? amount / price : amount;
    return bob >= min && bob <= max && usdt <= available;
  });
  const reference = buying ? p2p.buy : p2p.sell;
  const rates = eligible.map((ad) => ad.price);
  const matched = rates.length > 0;
  const rate = matched ? (buying ? Math.min(...rates) : Math.max(...rates)) : reference;
  const result = buying ? amount / rate : amount * rate;
  return isPlausibleRate(rate) && Number.isFinite(result)
    ? { rate, result, matched, count: eligible.length }
    : null;
}
