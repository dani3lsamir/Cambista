// Cambista — demo data for the browser preview (open the app with ?demo).
// In a normal browser the BCB and Binance block requests from other sites (CORS);
// the Android app does not have that limit because requests go through native code.
// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later

const BCB_HTML = `<div class="tc"><h3>Tipo de cambio oficial</h3><p>Bolivianos por dólar estadounidense</p>
<p>VIGENTE PARA EL SÁBADO 3, DOMINGO 4 Y LUNES 5 DE OCTUBRE, 2026</p><strong>12,00</strong></div>`;

// Values from the BCB table on 2026-10-06
const BANKS = [
  ['BANCO BISA', '12,03', '8.952.427', '221'], ['BANCO DE CREDITO', '11,95', '3.285.681', '998'],
  ['BANCO DE LA NACIÓN ARGENTINA', '11,95', '25.440', '30'], ['BANCO ECONOMICO', '11,90', '284.998', '42'],
  ['BANCO FIE', '11,92', '1.254.523', '20'], ['BANCO FORTALEZA', '12,05', '314.485', '15'],
  ['BANCO GANADERO', '11,95', '6.289.404', '607'], ['BANCO MERCANTIL SANTA CRUZ', '12,05', '5.333.443', '189'],
  ['BANCO NACIONAL DE BOLIVIA', '11,96', '2.424.665', '342'], ['BANCO PRODEM', '11,70', '2.738', '11'],
  ['BANCO PYME DE LA COMUNIDAD', '11,60', '1', '1'], ['BANCO PYME ECOFUTURO', '-', '-', '-'],
  ['BANCO SOLIDARIO', '11,95', '3.173.274', '46'], ['BANCO UNION', '11,50', '186.189', '75'],
];
const BANKS_HTML = `<table><tr><th>Entidad</th><th>Compra (Bs/$us)</th><th>Monto ($us)</th><th>Número de transacciones</th></tr>
${BANKS.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
<tr><td>TOTALES</td><td></td><td>31.527.269</td><td>2.597</td></tr>
<tr><td>BANCOS (MEDIANA PONDERADA POR MONTO)</td><td>11,97</td><td></td><td></td></tr></table>`;

function ads(base, step, n) {
  return { data: Array.from({ length: n }, (_, i) => ({ adv: { price: (base + i * step).toFixed(2) } })) };
}

export function demoFetch(url, options) {
  const body = options && options.body ? JSON.parse(options.body) : null;
  let payload;
  if (url.includes('ultima_cotizacion')) payload = BANKS_HTML;
  else if (url.includes('bcb.gob.bo')) payload = BCB_HTML;
  else if (url.includes('binance')) {
    payload = JSON.stringify(body && body.tradeType === 'BUY' ? ads(12.45, 0.01, body.rows) : ads(12.38, -0.01, body ? body.rows : 10));
  } else payload = '{}';
  return new Promise((resolve) =>
    setTimeout(() => resolve({ ok: true, status: 200, text: async () => payload }), 450),
  );
}

// 30 days of made-up history so the chart has something to draw
export function demoHistory() {
  const out = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const t = 29 - i;
    const bcb = 11.6 + t * 0.014;
    const mid = bcb + 0.35 + Math.sin(t / 3) * 0.08;
    out.push({ day, at: d.toISOString(), bcb: +bcb.toFixed(2), buy: +(mid + 0.04).toFixed(2), sell: +(mid - 0.04).toFixed(2), mid: +mid.toFixed(2) });
  }
  return out;
}
