// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { officialValidity, readMarket, readOfficial, readOfficialHistory } from '../scripts/collect-market.mjs';
import { emptyMarket, estimateForAmount, recordSample } from '../web/market.js';

const bcb = { rate: 7, from: '2026-01-31', through: '2026-02-02' };
const book = {
  buy: 10.1, sell: 9.9, mid: 10,
  buyAds: [
    { price: 10, min: 100, max: 400, available: 40 },
    { price: 10.2, min: 100, max: 1000, available: 80 },
    { price: 10.01, min: 100, max: 1000, available: 1 },
  ],
  sellAds: [{ price: 10, min: 200, max: 900, available: 90 }],
};

describe('the public rate history', () => {
  it('uses the date in Bolivia and keeps both partial readings on the same day', () => {
    const one = recordSample(emptyMarket(), '2026-02-01T01:00Z', bcb, null);
    const two = recordSample(one, '2026-02-01T02:00Z', null, book);
    const three = recordSample(two, '2026-02-01T04:00Z', null, null);
    expect(three.latest.bcb.rate).toBe(7);
    expect(three.latest.p2p.mid).toBe(10);
    expect(three.daily).toMatchObject([{ day: '2026-01-31', bcb: 7, mid: 10 }, { day: '2026-02-01' }]);
    expect(three.daily[1]).not.toHaveProperty('bcb');
    expect(three.daily[1]).not.toHaveProperty('mid');
    expect(three.recent[2]).toMatchObject({ bcb: null, mid: null });
  });

  it('expires intraday samples while retaining the daily series', () => {
    const one = recordSample(emptyMarket(), '2026-01-31T18:00Z', bcb, book);
    const two = recordSample(one, '2026-02-03T18:00Z', null, null);
    expect(two.recent).toHaveLength(1);
    expect(two.daily).toHaveLength(2);
  });
});

describe('observed quotes', () => {
  it('respects the minimum, maximum, and available funds for buying and selling', () => {
    expect(estimateForAmount(book, 200, 'BOB')).toMatchObject({ rate: 10, result: 20, matched: true });
    expect(estimateForAmount(book, 500, 'BOB')).toMatchObject({ rate: 10.2, matched: true });
    expect(estimateForAmount(book, 1000, 'BOB')).toMatchObject({ rate: 10.1, matched: false });
    expect(estimateForAmount(book, 50, 'USDT')).toMatchObject({ rate: 10, result: 500, matched: true });
  });

  it('reads both sides of Binance and only keeps the public fields needed by the calculator', async () => {
    const fetchFn = async (_url, { body }) => {
      const price = JSON.parse(body).tradeType === 'BUY' ? '10.20' : '10.00';
      return Response.json({ data: [{
        advertiser: { nickName: 'Sample merchant' },
        adv: { price, minSingleTransAmount: '100', maxSingleTransAmount: '1000', tradableQuantity: '100' },
      }] });
    };
    const market = await readMarket(fetchFn);
    expect(market.buy).toBe(10.2);
    expect(market.sell).toBe(10);
    expect(market.mid).toBeCloseTo(10.1);
    expect(market.buyAds).toEqual([{ price: 10.2, min: 100, max: 1000, available: 100 }]);
  });

  it('accepts a BCB validity interval across months and rejects a cached expired rate', async () => {
    expect(officialValidity('sábado 31, domingo 1 y lunes 2 de febrero, 2026')).toEqual({
      from: '2026-01-31', through: '2026-02-02',
    });
    const fetchFn = async () => new Response('Tipo de cambio oficial VIGENTE PARA EL SÁBADO 31, DOMINGO 1 Y LUNES 2 DE FEBRERO, 2026 7,00 Más información');
    expect(await readOfficial(fetchFn, '2026-02-01')).toEqual(bcb);
    await expect(readOfficial(fetchFn, '2026-02-03')).rejects.toThrow('applicable');
  });

  it('imports only past BCB dates from the official period', async () => {
    const fetchFn = async () => Response.json({ datos: [
      { Fecha: '2026-06-28', Valor: 9.9 }, { Fecha: '2026-06-29', Valor: 10 },
      { Fecha: '2026-06-30', Valor: 10.1 }, { Fecha: '2026-07-01', Valor: 10.2 },
    ] });
    expect(await readOfficialHistory(fetchFn, '2026-07-01')).toEqual([
      { day: '2026-06-29', bcb: 10 }, { day: '2026-06-30', bcb: 10.1 },
    ]);
  });
});
