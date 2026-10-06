// Cambista — history export and import (pure: no DOM, no network)
// Copyright (c) 2026 dani3lsamir. All rights reserved.
import { isPlausibleRate } from './rates-core.js';

// CSV for Excel / Google Sheets with Spanish settings: ";" between columns, "," for decimals.
// Starts with a BOM so Excel reads the accents as UTF-8.
export const CSV_COLUMNS = ['Fecha', 'Oficial BCB', 'P2P compra', 'P2P venta', 'P2P promedio', 'Brecha promedio %'];

function cell(n, decimals) {
  return Number.isFinite(n) ? n.toFixed(decimals).replace('.', ',') : '';
}

export function historyToCsv(history) {
  const rows = [...(history || [])]
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((h) => {
      const gapPct = Number.isFinite(h.mid) && Number.isFinite(h.bcb) && h.bcb > 0 ? (h.mid / h.bcb - 1) * 100 : NaN;
      return [h.day, cell(h.bcb, 2), cell(h.buy, 2), cell(h.sell, 2), cell(h.mid, 2), cell(gapPct, 2)].join(';');
    });
  return '﻿' + [CSV_COLUMNS.join(';'), ...rows].join('\r\n') + '\r\n';
}

export function exportFileName(day) {
  return `cambista-historial-${day}.csv`;
}

// Reads a CSV made by historyToCsv, also after it was opened and saved again in Excel or Sheets:
// accepts ";", "," or tab between columns, dates as 2026-10-05 or 05/10/2026, and "12,34" or "12.34".
// Columns are found by their header name, so their order does not matter; "Brecha" is recalculated.
// Returns { entries, skipped }: entries sorted oldest first, one per day; skipped = rows that were not valid.
export function parseHistoryCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('El archivo está vacío');
  const header = lines[0];
  const sep = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',';
  const names = header.split(sep).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = (name) => names.indexOf(name.toLowerCase());
  const idx = {
    day: col('Fecha'), bcb: col('Oficial BCB'), buy: col('P2P compra'), sell: col('P2P venta'), mid: col('P2P promedio'),
  };
  if (idx.day < 0 || idx.bcb < 0) throw new Error('No es un historial de Cambista (faltan las columnas Fecha y Oficial BCB)');

  const byDay = new Map();
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const day = parseDay(cells[idx.day]);
    const num = (i) => {
      if (i < 0 || !cells[i]) return undefined;
      const n = Number(cells[i].replace(',', '.'));
      return isPlausibleRate(n) ? n : undefined;
    };
    const entry = { day, bcb: num(idx.bcb), buy: num(idx.buy), sell: num(idx.sell), mid: num(idx.mid) };
    if (entry.mid === undefined && entry.buy !== undefined && entry.sell !== undefined) entry.mid = (entry.buy + entry.sell) / 2;
    if (!day || (entry.bcb === undefined && entry.mid === undefined)) {
      skipped++;
      continue;
    }
    for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
    byDay.set(day, entry);
  }
  const entries = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  return { entries, skipped };
}

function parseDay(s) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s || '');
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || ''))) [, d, mo, y] = m;
  else return null;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}`;
}
