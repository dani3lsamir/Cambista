import { describe, it, expect } from 'vitest';
import {
  parseLocaleNumber, parseBcbHome, parseBinanceAds, median, fetchSnapshot, gap, isDue,
  fmtNumber, fmtPercent, notificationText, parseBcbBanks, parseLocaleInt, weightedMedian, notificationTitle, orderSides, p2pReference, pickLanguage, SOURCES,
} from '../src/core/rates-core.js';

const BCB_HTML = `<html><body><div class="block"><h2>Tipo de cambio oficial</h2>
<p>Bolivianos por d&oacute;lar estadounidense</p>
<p>VIGENTE PARA EL S&Aacute;BADO 3, DOMINGO 4 Y LUNES 5 DE OCTUBRE, 2026</p>
<span class="valor">12,00</span><a href="?q=content/tipo-de-cambio">Más información</a></div>
<div>Otro indicador 6,86</div></body></html>`;

const res = (body, ok = true) => ({ ok, status: ok ? 200 : 500, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const ads = (prices) => ({ data: prices.map((p) => ({ adv: { price: String(p) } })) });

describe('numbers', () => {
  it('parses Bolivian and plain formats', () => {
    expect(parseLocaleNumber('12,00')).toBe(12);
    expect(parseLocaleNumber('1.234,56')).toBe(1234.56);
    expect(parseLocaleNumber('12.45')).toBe(12.45);
    expect(parseLocaleNumber('abc')).toBeNaN();
  });
  it('formats with comma decimals and dot thousands', () => {
    expect(fmtNumber(1234.5)).toBe('1.234,50');
    expect(fmtNumber(-3.2)).toBe('−3,20');
    expect(fmtPercent(0.0375)).toBe('+3,8%');
    expect(fmtPercent(-0.01)).toBe('−1,0%');
    expect(fmtNumber(NaN)).toBe('—');
  });
  it('formats with dot decimals and comma thousands in English', () => {
    expect(fmtNumber(1234.5, 2, 'en')).toBe('1,234.50');
    expect(fmtNumber(-3.2, 2, 'en')).toBe('−3.20');
    expect(fmtPercent(0.0375, 'en')).toBe('+3.8%');
  });
  it('median works for odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('BCB parser', () => {
  it('reads rate and validity from the home page block', () => {
    const r = parseBcbHome(BCB_HTML);
    expect(r.rate).toBe(12);
    expect(r.validity).toBe('El sábado 3, domingo 4 y lunes 5 de octubre, 2026');
  });
  it('fails loudly when the block is missing', () => {
    expect(() => parseBcbHome('<p>nada</p>')).toThrow(/Tipo de cambio oficial/);
  });
  it('rejects implausible values', () => {
    expect(() => parseBcbHome('Tipo de cambio oficial VIGENTE PARA HOY 2026 0,50')).toThrow(/fuera de rango/);
  });
});

describe('Binance parser', () => {
  it('extracts prices and ignores junk', () => {
    expect(parseBinanceAds(ads(['12.40', 'x', '12.50']))).toEqual([12.4, 12.5]);
  });
  it('throws on empty responses', () => {
    expect(() => parseBinanceAds({ data: [] })).toThrow();
    expect(() => parseBinanceAds({})).toThrow();
  });
});

const BANKS_HTML = `<table class="tabla"><thead><tr><th>Entidad</th><th>Compra (Bs/$us)</th><th>Monto ($us)</th><th>N&uacute;mero de transacciones</th></tr></thead>
<tbody><tr><td>BANCO BISA</td><td class="r"><b>12,03</b></td><td>8.952.427</td><td>221</td></tr>
<tr><td>BANCO DE LA NACI&Oacute;N ARGENTINA</td><td>11,95</td><td>25.440</td><td>30</td></tr>
<tr><td>BANCO PYME ECOFUTURO</td><td>-</td><td>-</td><td>-</td></tr>
<tr><td>BANCO UNION</td><td>11,50</td><td>186.189</td><td>75</td></tr></tbody>
<tfoot><tr><td>TOTALES</td><td></td><td>9.164.056</td><td>326</td></tr>
<tr><td>BANCOS (MEDIANA PONDERADA POR MONTO)</td><td>11,97</td><td></td><td></td></tr></tfoot></table>
<p>Fecha de la cotizaci&oacute;n: 06/10/2026</p>`;

describe('bank table parser', () => {
  it('reads each bank, the weighted median and the date', () => {
    const r = parseBcbBanks(BANKS_HTML);
    expect(r.banks).toHaveLength(4);
    expect(r.banks[0]).toEqual({ name: 'BANCO BISA', buy: 12.03, amount: 8952427, count: 221 });
    expect(r.banks[1].name).toBe('BANCO DE LA NACIÓN ARGENTINA');
    expect(r.banks[2]).toEqual({ name: 'BANCO PYME ECOFUTURO', buy: null, amount: null, count: null });
    expect(r.median).toBe(11.97);
    expect(r.date).toBe('06/10/2026');
  });
  it('calculates the median when the page does not show it', () => {
    const r = parseBcbBanks(BANKS_HTML.replace(/<tr><td>BANCOS \(MEDIANA[\s\S]*?<\/tr>/, ''));
    expect(r.median).toBe(12.03); // BISA alone has more than half of the dollars
  });
  it('fails clearly when there is no table', () => {
    expect(() => parseBcbBanks('<p>mantenimiento</p>')).toThrow(/Bancos/);
  });
  it('helpers', () => {
    expect(parseLocaleInt('8.952.427')).toBe(8952427);
    expect(parseLocaleInt('-')).toBeNaN();
    expect(weightedMedian([{ value: 11, weight: 1 }, { value: 12, weight: 5 }, { value: 13, weight: 1 }])).toBe(12);
  });
});

describe('fetchSnapshot', () => {
  it('combines BCB and both Binance sides', async () => {
    const fetchFn = async (url, opts) => {
      if (url === SOURCES.bcb) return res(BCB_HTML);
      if (url === SOURCES.binance) {
        const b = JSON.parse(opts.body);
        expect(b.fiat).toBe('BOB');
        expect(b.asset).toBe('USDT');
        return res(b.tradeType === 'BUY' ? ads([12.5, 12.6, 12.7]) : ads([12.3, 12.2, 12.1]));
      }
      throw new Error('unexpected ' + url);
    };
    const s = await fetchSnapshot(fetchFn, { adsCount: 3 }, new Date(2026, 9, 5, 9, 30));
    expect(s.day).toBe('2026-10-05');
    expect(s.bcb.rate).toBe(12);
    expect(s.p2p.buy).toBe(12.6);
    expect(s.p2p.sell).toBe(12.2);
    expect(s.p2p.mid).toBeCloseTo(12.4);
    expect(s.errors).toEqual([]);
    // the bank table failed ("unexpected" URL) but that is not a failed update
    expect(s.banks).toBeNull();
    expect(s.banksError).toMatch(/unexpected/);
  });

  it('adds the bank table when it loads', async () => {
    const fetchFn = async (url, opts) => {
      if (url === SOURCES.bcbBanks) return res(BANKS_HTML);
      if (url === SOURCES.bcb) return res(BCB_HTML);
      return res(JSON.parse(opts.body).tradeType === 'BUY' ? ads([12.6]) : ads([12.2]));
    };
    const s = await fetchSnapshot(fetchFn, {}, new Date());
    expect(s.banks.median).toBe(11.97);
    expect(s.banks.source).toBe('BCB');
    expect(s.banksError).toBeNull();
  });

  it('falls back to paralelo.bo and DolarApi, and normalises sides', async () => {
    const fetchFn = async (url) => {
      if (url === SOURCES.bcb) return res('<p>mantenimiento</p>');
      if (url === SOURCES.dolarapiOficial) return res({ compra: 11.9, venta: 12.0 });
      if (url === SOURCES.binance) return res('', false);
      if (url === SOURCES.paraleloBo) return res({ median: 12.45, compra: 12.47, venta: 12.42 });
      throw new Error('unexpected ' + url);
    };
    const s = await fetchSnapshot(fetchFn, {}, new Date());
    expect(s.bcb).toMatchObject({ rate: 12, source: 'DolarApi (respaldo)' });
    expect(s.p2p).toMatchObject({ buy: 12.47, sell: 12.42, mid: 12.45, source: 'paralelo.bo (respaldo)' });
  });

  it('never throws: reports errors per source', async () => {
    const s = await fetchSnapshot(async () => { throw new Error('sin internet'); }, {}, new Date());
    expect(s.bcb).toBeNull();
    expect(s.p2p).toBeNull();
    expect(s.errors.length).toBe(2);
  });
});

describe('gap and references', () => {
  it('gap = P2P / BCB − 1', () => {
    expect(gap(12.6, 12)).toBeCloseTo(0.05);
    expect(gap(NaN, 12)).toBeNaN();
  });
  it('picks the configured side', () => {
    const p = { buy: 12.6, sell: 12.2, mid: 12.4 };
    expect(p2pReference(p, 'buy')).toBe(12.6);
    expect(p2pReference(p, 'sell')).toBe(12.2);
    expect(p2pReference(p, 'mid')).toBe(12.4);
  });
  it('orderSides puts the higher price on buy', () => {
    expect(orderSides(12.42, 12.47)).toEqual({ buy: 12.47, sell: 12.42 });
  });
  it('notification text', () => {
    const t = notificationText({ bcb: { rate: 12 }, p2p: { buy: 12.6, sell: 12.2, mid: 12.4 } }, { gapSide: 'mid' });
    expect(t).toBe('BCB 12,00 · P2P 12,40 · Brecha +3,3%');
    expect(notificationText({ bcb: null, p2p: null })).toMatch(/No se pudo/);
  });
  it('notification text in English', () => {
    const t = notificationText({ bcb: { rate: 12 }, p2p: { buy: 12.6, sell: 12.2, mid: 12.4 } }, { gapSide: 'mid', uiLang: 'en' });
    expect(t).toBe('BCB 12.00 · P2P 12.40 · Gap +3.3%');
    expect(notificationText({ bcb: null, p2p: null }, { uiLang: 'en' })).toMatch(/Could not update/);
    expect(notificationTitle({ uiLang: 'en' })).toMatch(/exchange rate/);
    expect(notificationTitle({})).toMatch(/tipo de cambio/);
  });
  it('picks the language from the setting or the phone', () => {
    expect(pickLanguage('en', 'es-BO')).toBe('en');
    expect(pickLanguage('es', 'en-US')).toBe('es');
    expect(pickLanguage('system', 'es-BO')).toBe('es');
    expect(pickLanguage('system', 'en-US')).toBe('en');
    expect(pickLanguage('system', 'pt-BR')).toBe('en');
    expect(pickLanguage(undefined, undefined)).toBe('es');
  });
});

describe('daily schedule', () => {
  const at = (h, m) => new Date(2026, 9, 5, h, m);
  it('runs once after the configured time', () => {
    const s = { autoUpdate: true, updateTime: '09:00' };
    expect(isDue(s, null, at(8, 59))).toBe(false);
    expect(isDue(s, null, at(9, 0))).toBe(true);
    expect(isDue(s, '2026-10-04', at(14, 0))).toBe(true);
    expect(isDue(s, '2026-10-05', at(14, 0))).toBe(false);
  });
  it('respects the switch', () => {
    expect(isDue({ autoUpdate: false, updateTime: '00:00' }, null, at(12, 0))).toBe(false);
  });
});
