// Copyright (c) 2026 dani3lsamir. All rights reserved.
import { describe, it, expect } from 'vitest';
import { historyToCsv, exportFileName } from '../src/core/export.js';

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
