// Cambista — demo data for the browser preview (open the app with ?demo).
// In a normal browser the BCB and Binance block requests from other sites (CORS);
// the Android app does not have that limit because requests go through native code.
// Copyright (c) 2026 dani3lsamir. All rights reserved.

const BCB_HTML = `<div class="tc"><h3>Tipo de cambio oficial</h3><p>Bolivianos por dólar estadounidense</p>
<p>VIGENTE PARA EL SÁBADO 3, DOMINGO 4 Y LUNES 5 DE OCTUBRE, 2026</p><strong>12,00</strong></div>`;

function ads(base, step, n) {
  return { data: Array.from({ length: n }, (_, i) => ({ adv: { price: (base + i * step).toFixed(2) } })) };
}

export function demoFetch(url, options) {
  const body = options && options.body ? JSON.parse(options.body) : null;
  let payload;
  if (url.includes('bcb.gob.bo')) payload = BCB_HTML;
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
