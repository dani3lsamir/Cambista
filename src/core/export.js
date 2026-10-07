// Cambista — history export and import (pure: no DOM, no network)
// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
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

// ---- settings export and import (a small JSON file; the history has its own CSV) ----
const SETTING_RULES = {
  autoUpdate: (v) => typeof v === 'boolean',
  updateTime: (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
  notify: (v) => typeof v === 'boolean',
  gapSide: (v) => ['mid', 'buy', 'sell'].includes(v),
  adsCount: (v) => [5, 10, 20].includes(v),
  theme: (v) => ['system', 'dark', 'light'].includes(v),
  language: (v) => ['system', 'es', 'en'].includes(v),
};

export function settingsToJson(settings) {
  const out = {};
  for (const k of Object.keys(SETTING_RULES)) if (SETTING_RULES[k](settings?.[k])) out[k] = settings[k];
  return JSON.stringify({ app: 'cambista', kind: 'settings', settings: out }, null, 2) + '\n';
}

export function settingsFileName(day) {
  return `cambista-ajustes-${day}.json`;
}

// Returns only the valid settings found in the file; unknown or invalid values are ignored.
export function parseSettingsJson(text) {
  let data;
  try {
    data = JSON.parse(String(text || '').replace(/^﻿/, ''));
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }
  if (data?.app !== 'cambista' || data?.kind !== 'settings' || typeof data.settings !== 'object' || !data.settings) {
    throw new Error('No es un archivo de ajustes de Cambista');
  }
  const settings = {};
  if (data.settings.theme === 'oled') data.settings.theme = 'dark'; // old name of today's dark theme
  for (const k of Object.keys(SETTING_RULES)) if (SETTING_RULES[k](data.settings[k])) settings[k] = data.settings[k];
  if (!Object.keys(settings).length) throw new Error('El archivo no tiene ajustes válidos');
  return settings;
}
