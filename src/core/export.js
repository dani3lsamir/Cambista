// Cambista — history export (pure: no imports, no DOM)
// Copyright (c) 2026 dani3lsamir. All rights reserved.

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
