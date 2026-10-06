// Copyright (c) 2026 dani3lsamir. All rights reserved.
import { describe, it, expect } from 'vitest';
import { historyToCsv, exportFileName, parseHistoryCsv } from '../src/core/export.js';

describe('history export', () => {
  it('writes a header and one row per day, oldest first, with comma decimals', () => {
    const csv = historyToCsv([
      { day: '2026-10-05', bcb: 12, buy: 12.5, sell: 12.34, mid: 12.42 },
      { day: '2026-10-04', bcb: 12, buy: 12.4, sell: 12.3, mid: 12.36 },
    ]);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Fecha;Oficial BCB;P2P compra;P2P venta;P2P promedio;Brecha promedio %');
    expect(lines[1]).toBe('2026-10-04;12,00;12,40;12,30;12,36;3,00');
    expect(lines[2]).toBe('2026-10-05;12,00;12,50;12,34;12,42;3,50');
  });

  it('leaves missing values empty and handles an empty history', () => {
    const lines = historyToCsv([{ day: '2026-10-01', bcb: 12 }]).trim().split('\r\n');
    expect(lines[1]).toBe('2026-10-01;12,00;;;;');
    expect(historyToCsv([]).trim().split('\r\n')).toHaveLength(1);
    expect(historyToCsv(undefined).startsWith('﻿')).toBe(true);
  });

  it('names the file with the day', () => {
    expect(exportFileName('2026-10-06')).toBe('cambista-historial-2026-10-06.csv');
  });
});

describe('history import', () => {
  it('reads back what historyToCsv writes', () => {
    const history = [
      { day: '2026-10-04', bcb: 12, buy: 12.4, sell: 12.3, mid: 12.35 },
      { day: '2026-10-05', bcb: 12.01, buy: 12.5, sell: 12.34, mid: 12.42 },
    ];
    const { entries, skipped } = parseHistoryCsv(historyToCsv(history));
    expect(skipped).toBe(0);
    expect(entries).toEqual(history);
  });

  it('accepts a file saved again by a spreadsheet (commas, dots, d/m/y dates, other column order)', () => {
    const csv = 'P2P promedio,Fecha,Oficial BCB\n12.42,05/10/2026,12.00\n12.36,4/10/2026,12\n';
    expect(parseHistoryCsv(csv).entries).toEqual([
      { day: '2026-10-04', bcb: 12, mid: 12.36 },
      { day: '2026-10-05', bcb: 12, mid: 12.42 },
    ]);
  });

  it('computes the average from buy and sell when it is missing, with dot or comma decimals', () => {
    const { entries } = parseHistoryCsv('Fecha;Oficial BCB;P2P compra;P2P venta\n2026-10-05;12,00;12.50;12,30\n');
    expect(entries[0].buy).toBe(12.5);
    expect(entries[0].mid).toBeCloseTo(12.4);
  });

  it('skips bad rows and keeps the last row of a repeated day', () => {
    const csv = 'Fecha;Oficial BCB\n2026-02-30;12,00\nayer;12,00\n2026-10-05;9999\n2026-10-06;12,00\n2026-10-06;12,10\n';
    const { entries, skipped } = parseHistoryCsv(csv);
    expect(entries).toEqual([{ day: '2026-10-06', bcb: 12.1 }]);
    expect(skipped).toBe(3);
  });

  it('rejects files that are not a Cambista history', () => {
    expect(() => parseHistoryCsv('')).toThrow(/vacío/);
    expect(() => parseHistoryCsv('Nombre;Monto\nAna;10\n')).toThrow(/Cambista/);
  });
});
